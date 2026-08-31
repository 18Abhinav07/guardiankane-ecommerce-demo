import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { anchorToRange, prdRefToRange, rangesOverlap } from './graph-build.js';
import { readTracker, writeTracker, findTask, activeTask, nextPlannedTask } from './tracker.js';

// Returns the use-cases (from a real `context view --json` shape) whose
// DERIVES anchor overlaps this task's prd_ref range. Same "any overlap
// counts" heuristic as Phase 2's attributeClaimPhases — deliberately
// reused, not reinvented. A task with no prd_ref (e.g. T0, the hardcoded
// scaffold task) has nothing to recall — this returns [], not an error.
export function findRelevantUseCases(view, task) {
  const range = prdRefToRange(task.prd_ref);
  if (!range) return [];
  const nodesByCid = new Map((view.nodes || []).map(n => [n.cid, n]));
  const out = [];
  for (const edge of view.edges || []) {
    if (edge.type !== 'DERIVES') continue;
    const dstNode = nodesByCid.get(edge.dst);
    if (!dstNode || dstNode.label !== 'usecase') continue;
    const ranges = (edge.anchors || []).map(anchorToRange).filter(Boolean);
    if (ranges.some(r => rangesOverlap(r, range))) {
      out.push({ slug: dstNode.slug, cid: dstNode.cid, title: dstNode.title, anchors: edge.anchors });
    }
  }
  return out;
}

// Returns the ACs scoped to a given use-case cid, via `scoped_to` edges
// (ac --src--> usecase --dst-->). Real edge shape confirmed live
// (kane-cli 0.8.7, todo-kane/, 2026-08-28).
export function findAcsForUseCase(view, usecaseCid) {
  const nodesByCid = new Map((view.nodes || []).map(n => [n.cid, n]));
  const out = [];
  for (const edge of view.edges || []) {
    if (edge.type !== 'scoped_to' || edge.dst !== usecaseCid) continue;
    const acNode = nodesByCid.get(edge.src);
    if (acNode && acNode.label === 'ac') out.push({ slug: acNode.slug, cid: acNode.cid, title: acNode.title });
  }
  return out;
}

// Order-independent: DERIVES edges can repeat/reorder anchors between
// extractions without the underlying PRD text having changed.
export function detectAnchorDrift(previousAnchors, currentAnchors) {
  const norm = (arr) => [...(arr || [])].sort().join(',');
  return norm(previousAnchors) !== norm(currentAnchors);
}

// Bounded on purpose — counts, not content. `view.summary` is already a
// rollup (see docs/superpowers/specs/2026-08-25-kane-cli-verified-reference.md);
// `graph` is the already-built .testmuai/graph.json (code + claim + feature
// nodes/edges) the dashboard already reads — reused, not recomputed.
export function buildCompactMap(view, graph) {
  return {
    claims: view.summary || null,
    code: graph
      ? {
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          byType: graph.nodes.reduce((acc, n) => {
            acc[n.type] = (acc[n.type] || 0) + 1;
            return acc;
          }, {}),
        }
      : null,
  };
}

export function formatContextBlock({ task, useCaseEntries, acEntries, driftWarnings, compactMap }) {
  const lines = [`## Context for ${task.id} (${task.title})`, ''];

  lines.push('### Relevant use-cases (recorded reasoning, zero fresh AI)');
  for (const { slug, title, entries } of useCaseEntries) {
    lines.push(`#### ${slug} — ${title}`);
    for (const e of entries) {
      const who = e.by ? ` (by ${e.by.kind}:${e.by.id})` : '';
      lines.push(`- [${e.kind}] ${e.detail}${who}`);
    }
  }
  lines.push('');

  if (driftWarnings.length) {
    lines.push('### ⚠ Anchor drift since this task last ran this step');
    for (const w of driftWarnings) lines.push(`- ${w.slug}: anchors changed`);
    lines.push('');
  }

  lines.push('### Relevant acceptance criteria (design reasoning, zero fresh AI)');
  for (const { slug, text } of acEntries) {
    lines.push(`#### ${slug}`);
    lines.push(text.trim());
  }
  lines.push('');

  lines.push('### Codebase orientation (compact map)');
  lines.push('```json');
  lines.push(JSON.stringify(compactMap, null, 2));
  lines.push('```');

  return lines.join('\n');
}

export function explainUseCase(target, slug) {
  const out = execFileSync('kane-cli', ['context', 'explain', slug, '--json'], { cwd: target, encoding: 'utf8' });
  return JSON.parse(out);
}

export function explainAc(target, slug) {
  // No --json on this subcommand (confirmed live, kane-cli 0.8.7) — plain
  // text, returned as-is.
  return execFileSync('kane-cli', ['design', 'explain', slug], { cwd: target, encoding: 'utf8' });
}

// Raw `context view --json` output, for callers (the dashboard's PRD graph
// tab) that need the whole claim graph rather than one explained use-case.
// Throws on failure — unlike explainUseCase/explainAc's route-level callers,
// which catch and degrade themselves.
export function viewContext(target) {
  const out = execFileSync('kane-cli', ['context', 'view', '--json'], { cwd: target, encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
  return JSON.parse(out);
}

function parseArgs(argv) {
  const args = { target: process.cwd(), task: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target') args.target = argv[++i];
    else if (argv[i] === '--task') args.task = argv[++i];
  }
  return args;
}

// This step is advisory context for the agent, never a verification gate —
// unlike the Stop hook's decide(), a failure here must never block the
// agent from starting the task. Every kane-cli call is wrapped so one bad
// call degrades gracefully instead of aborting the whole block.
export async function main(argv) {
  const args = parseArgs(argv);
  const trackerPath = path.join(args.target, '.testmuai', 'task-tracker.md');
  const tracker = readTracker(trackerPath);
  const task = args.task ? findTask(tracker.tasks, args.task) : (activeTask(tracker.tasks) || nextPlannedTask(tracker.tasks));
  if (!task) {
    console.error('kane-context: no task found (pass --task <id> or ensure one is IN_PROGRESS/PLANNED)');
    process.exitCode = 1;
    return;
  }

  let view;
  try {
    view = JSON.parse(execFileSync('kane-cli', ['context', 'view', '--json'], { cwd: args.target, encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 }));
  } catch (err) {
    console.log(`(context injection unavailable: ${err.message.split('\n')[0]} — continuing without it)`);
    return;
  }

  const useCases = findRelevantUseCases(view, task);
  const useCaseEntries = [];
  const acEntries = [];
  const driftWarnings = [];
  const currentAnchorsByUc = {};

  for (const uc of useCases) {
    try {
      const explained = explainUseCase(args.target, uc.slug);
      useCaseEntries.push({ slug: uc.slug, title: uc.title, entries: explained.entries });
    } catch (err) {
      console.log(`(could not explain ${uc.slug}: ${err.message.split('\n')[0]})`);
    }

    currentAnchorsByUc[uc.slug] = uc.anchors;
    const previous = task.last_seen_anchors?.[uc.slug];
    if (previous && detectAnchorDrift(previous, uc.anchors)) driftWarnings.push({ slug: uc.slug });

    for (const ac of findAcsForUseCase(view, uc.cid)) {
      try {
        acEntries.push({ slug: ac.slug, text: explainAc(args.target, ac.slug) });
      } catch (err) {
        console.log(`(could not explain ${ac.slug}: ${err.message.split('\n')[0]})`);
      }
    }
  }

  const graphPath = path.join(args.target, '.testmuai', 'graph.json');
  const graph = fs.existsSync(graphPath) ? JSON.parse(fs.readFileSync(graphPath, 'utf8')) : null;
  const compactMap = buildCompactMap(view, graph);

  console.log(formatContextBlock({ task, useCaseEntries, acEntries, driftWarnings, compactMap }));

  task.last_seen_anchors = { ...(task.last_seen_anchors || {}), ...currentAnchorsByUc };
  writeTracker(trackerPath, tracker);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
