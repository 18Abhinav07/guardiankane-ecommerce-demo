#!/usr/bin/env node
// Builds .testmuai/graph.json from three real sources: madge (code graph),
// .testmuai/task-tracker.md (feature graph), and kane-cli's .context/ store
// (claim graph). Each source degrades to zero nodes/edges, not a crash, when
// its input is absent — a fresh repo with no tasks and no .context/ yet is
// the normal first-run state, not an error.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import madgeFactory from 'madge';
import { readTracker } from './tracker.js';
import { logActivity } from './logger.js';

export function parseArgs(argv) {
  const args = { target: process.cwd(), exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') args.target = path.resolve(argv[++i]);
    else if (a === '--src') args.src = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--exclude') args.exclude = argv[++i].split(',').filter(Boolean);
  }
  args.src = args.src ? path.resolve(args.target, args.src) : path.join(args.target, 'src');
  args.out = args.out ? path.resolve(args.out) : path.join(args.target, '.testmuai', 'graph.json');
  return args;
}

const TEST_FILE_RE = /\.(test|spec)\.[jt]sx?$/;

// Test files import what they test, so madge's normal `imports` edges from a
// test file already encode `tests` — no separate parsing needed, just a
// naming-based reclassification of nodes already produced above.
async function buildCodeGraph(srcDir, excludeRegExp) {
  const nodes = [];
  const edges = [];
  if (!fs.existsSync(srcDir)) return { nodes, edges };
  const res = await madgeFactory(srcDir, { fileExtensions: ['js', 'jsx', 'ts', 'tsx'], excludeRegExp });
  const graphObj = res.obj();
  for (const file of Object.keys(graphObj)) {
    const isTest = TEST_FILE_RE.test(file);
    nodes.push({ id: file, type: isTest ? 'test' : 'code', dir: path.dirname(file) === '.' ? '' : path.dirname(file) });
  }
  for (const [file, deps] of Object.entries(graphObj)) {
    const edgeType = TEST_FILE_RE.test(file) ? 'tests' : 'imports';
    for (const dep of deps) {
      edges.push({ from: file, to: dep, type: edgeType, confidence: 'confirmed' });
    }
  }
  return { nodes, edges };
}

// Static external-dependency scan (design §6): pattern-matches each file's
// own text for known call shapes. Cheap and deterministic — catches nothing
// it wasn't told to look for, which is why the design pairs it with an
// agent-assisted refinement pass at test-plan time, not attempted here.
const EXTERNAL_PATTERNS = [
  { id: 'external:http', label: 'HTTP / fetch', re: /\bfetch\(|\baxios[.(]|\bhttp\.(?:request|get)\(|\bhttps\.(?:request|get)\(/ },
  { id: 'external:fs', label: 'filesystem', re: /from ['"]node:fs['"]|from ['"]fs['"]|require\(['"]fs['"]\)|require\(['"]node:fs['"]\)/ },
  { id: 'external:child_process', label: 'child_process', re: /from ['"]node:child_process['"]|from ['"]child_process['"]|require\(['"]child_process['"]\)|require\(['"]node:child_process['"]\)/ },
  { id: 'external:db', label: 'database client', re: /from ['"](?:pg|mongoose|prisma|mysql2?|sequelize|knex|redis|ioredis)['"]/ },
  { id: 'external:blockchain', label: 'blockchain / wallet', re: /from ['"](?:wagmi|viem|ethers|web3)['"]/ },
  { id: 'external:browser-storage', label: 'browser storage (localStorage/sessionStorage)', re: /\b(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem|clear)\(/ },
  { id: 'external:browser-nav', label: 'browser navigation (window.location)', re: /\bwindow\.location\b/ },
];

function buildExternalDepsGraph(codeNodes, srcDir) {
  const nodesById = new Map();
  const edges = [];
  for (const node of codeNodes) {
    const fullPath = path.join(srcDir, node.id);
    let text;
    try {
      text = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }
    for (const pattern of EXTERNAL_PATTERNS) {
      if (pattern.re.test(text)) {
        if (!nodesById.has(pattern.id)) nodesById.set(pattern.id, { id: pattern.id, type: 'external', label: pattern.label });
        edges.push({ from: node.id, to: pattern.id, type: 'external', confidence: 'inferred' });
      }
    }
  }
  return { nodes: [...nodesById.values()], edges };
}

// Task files are recorded repo-root-relative (whatever Claude Code's
// tool_input.file_path gives recordFileTouch — see
// guardian-kane-post-tool-use.js), but madge's code-node ids are relative
// to --src, not the repo root. Without this normalization, every touches
// edge for a project with srcDir !== '.' silently fails to match any code
// node — dropped as a dangling edge by graph.js, and misread by
// computeDrift as "task touched a file that no longer exists" even though
// the file is right there. Absolute paths (a rare recordFileTouch anomaly)
// and files genuinely outside srcDir are left as-is; they correctly won't
// match a code node.
export function toSrcRelative(file, targetAbs, srcAbs) {
  const abs = path.isAbsolute(file) ? file : path.resolve(targetAbs, file);
  const rel = path.relative(srcAbs, abs);
  if (rel.startsWith('..')) return file;
  return rel.split(path.sep).join('/');
}

function buildFeatureGraph(target, srcAbs) {
  const nodes = [];
  const edges = [];
  const trackerPath = path.join(target, '.testmuai', 'task-tracker.md');
  if (!fs.existsSync(trackerPath)) return { nodes, edges };
  const { tasks } = readTracker(trackerPath);
  for (const task of tasks) {
    nodes.push({ id: task.id, type: 'feature', label: task.title || task.id, state: task.state, phases: task.phase ? [task.phase] : [] });
    for (const file of task.files || []) {
      edges.push({ from: task.id, to: toSrcRelative(file, target, srcAbs), type: 'touches', confidence: 'confirmed' });
    }
  }
  return { nodes, edges };
}

// Next.js Pages Router only (§4.3 of the v2 design doc): pages/api/cart.js
// <-> /api/cart, pages/api/cart/[id].js <-> /api/cart/:id. Anything that
// doesn't reduce to that shape produces no edge, never a wrong one.
function buildCallsGraph(srcDir) {
  const edges = [];
  const apiDir = path.join(srcDir, 'pages', 'api');
  if (!fs.existsSync(apiDir)) return { nodes: [], edges };

  const routeFiles = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|ts)x?$/.test(entry.name)) routeFiles.push(full);
    }
  })(apiDir);

  const routeMap = new Map();
  for (const file of routeFiles) {
    const rel = path.relative(srcDir, file);
    const normalized = rel
      .replace(/^pages[/\\]api[/\\]/, '/api/')
      .replace(/\.(js|ts)x?$/, '')
      .replace(/\\/g, '/')
      .replace(/\[[^\]]+\]/g, ':wild');
    routeMap.set(normalized, path.relative(srcDir, file).replace(/\\/g, '/'));
  }

  const literalCallRe = /(?:fetch|axios\.(?:get|post|put|delete|patch))\(\s*['"`]([^'"`]+)['"`]/g;
  (function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'pages') continue;
        scan(full);
        continue;
      }
      if (!/\.(js|ts)x?$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      let m;
      while ((m = literalCallRe.exec(text))) {
        const url = m[1].split('?')[0].replace(/\/$/, '');
        const normalized = url.replace(/\/[^/]+$/, m => (routeMap.has(url) ? m : '/:wild'));
        const target = routeMap.get(url) || routeMap.get(normalized);
        if (target) {
          edges.push({
            from: path.relative(srcDir, full).replace(/\\/g, '/'),
            to: target,
            type: 'calls',
            confidence: 'confirmed',
          });
        }
      }
    }
  })(srcDir);

  return { nodes: [], edges };
}

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const ACTIVE_TASK_STATES = new Set(['IN_PROGRESS', 'CLAIMED_DONE', 'KANE_VERIFIED', 'KANE_FAILED', 'BLOCKED_NEEDS_HUMAN']);

// A phase counts as "active" once any of its tasks has left PLANNED — used
// to scope drift-checking to work that's actually underway, not the whole
// project (Phase 4's real-time scope guard reuses this).
export function activePhases(tasks) {
  const set = new Set();
  for (const t of tasks || []) {
    if (t.phase && ACTIVE_TASK_STATES.has(t.state)) set.add(t.phase);
  }
  return set;
}

// anchors format is "L<start>-L<end>" (an L on each side) — confirmed live
// from a real `context view --json` DERIVES edge.
export function anchorToRange(anchor) {
  const m = /^L(\d+)-L(\d+)$/.exec(anchor);
  return m ? { start: Number(m[1]), end: Number(m[2]) } : null;
}

// prd_ref format is "PRD.md#L<start>-<end>" (a single L) — confirmed from
// .testmuai/task-tracker.example.md's real schema example. This is a
// different format from anchors above and needs its own regex.
export function prdRefToRange(prdRef) {
  if (!prdRef) return null;
  const m = /#L(\d+)-(\d+)/.exec(prdRef);
  return m ? { start: Number(m[1]), end: Number(m[2]) } : null;
}

export function rangesOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

// Pure — no I/O — so it's directly testable against the real, live-verified
// context view --json shape without mocking execSync. Matches a use-case's
// PRD-source anchor (from its DERIVES edge) against every task's prd_ref
// range using "any overlap counts" (approved heuristic, not majority overlap
// or exact containment).
//
// Limitation (accepted, time-bound — see Phase 2 design doc §4, Limitation
// 1): prd_ref is captured once, at task-creation time; anchors reflects
// kane-cli's *current* read of PRD.md. If PRD.md is edited after a task is
// created but before Phase 7 (`maintain reconcile`) lands, the two ranges
// can drift apart with no signal — a claim could be silently misattributed
// or drop out of overlap. Not fixed here; Phase 7 is the only planned fix.
export function attributeClaimPhases(view, useCases, tasks) {
  const nodesByCid = new Map((view.nodes || []).map(n => [n.cid, n]));
  const anchorRangesBySlug = new Map();
  for (const edge of view.edges || []) {
    if (edge.type !== 'DERIVES') continue;
    const dstNode = nodesByCid.get(edge.dst);
    if (!dstNode || dstNode.label !== 'usecase') continue;
    const ranges = (edge.anchors || []).map(anchorToRange).filter(Boolean);
    const existing = anchorRangesBySlug.get(dstNode.slug) || [];
    anchorRangesBySlug.set(dstNode.slug, existing.concat(ranges));
  }

  const taskRanges = (tasks || [])
    .map(t => ({ phase: t.phase, range: prdRefToRange(t.prd_ref) }))
    .filter(t => t.phase && t.range);

  const phasesByUcId = new Map();
  for (const uc of useCases) {
    const ranges = anchorRangesBySlug.get(uc.id) || [];
    const phases = new Set();
    for (const { phase, range } of taskRanges) {
      if (ranges.some(r => rangesOverlap(r, range))) phases.add(phase);
    }
    phasesByUcId.set(uc.id, [...phases]);
  }
  return phasesByUcId;
}

// A code/test file's phase(s) are derived from whichever feature (task)
// touches it via the existing `touches` edges — never stored independently,
// so it can't drift from the tracker's own `phase` field. Mutates each node
// in place (matches how buildGraph already builds these node arrays
// incrementally before assembling the final graph).
export function attributeFilePhases(codeOrTestNodes, featureNodes, touchesEdges) {
  const phasesByFeatureId = new Map(featureNodes.map(f => [f.id, f.phases || []]));
  const phasesByFile = new Map();
  for (const e of touchesEdges) {
    const phases = phasesByFeatureId.get(e.from) || [];
    if (phases.length === 0) continue;
    const set = phasesByFile.get(e.to) || new Set();
    for (const p of phases) set.add(p);
    phasesByFile.set(e.to, set);
  }
  for (const n of codeOrTestNodes) {
    n.phases = [...(phasesByFile.get(n.id) || [])];
  }
}

async function buildClaimGraph(target, codeNodes) {
  const nodes = [];
  const edges = [];
  const contextDir = path.join(target, '.context');
  if (!fs.existsSync(contextDir)) return { nodes, edges };

  let listOut, viewOut;
  try {
    listOut = execSync('kane-cli context list --json --type usecase', { cwd: target, encoding: 'utf8' });
    viewOut = execSync('kane-cli context view --json', { cwd: target, encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
  } catch (err) {
    console.error(`graph-build: claim graph skipped, kane-cli context read failed: ${err.message.split('\n')[0]}`);
    return { nodes, edges };
  }

  const useCases = listOut.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const view = JSON.parse(viewOut);
  const contentHtml = view.contentHtml || {};

  const trackerPath = path.join(target, '.testmuai', 'task-tracker.md');
  const tasks = fs.existsSync(trackerPath) ? readTracker(trackerPath).tasks : [];
  const phasesByUcId = attributeClaimPhases(view, useCases, tasks);

  for (const uc of useCases) {
    nodes.push({ id: uc.id, type: 'claim', title: uc.title, trust: uc.trust, fresh: uc.fresh, phases: phasesByUcId.get(uc.id) || [] });
    const text = stripHtml(contentHtml[uc.cid] || '').toLowerCase();
    if (!text) continue;
    for (const codeNode of codeNodes) {
      const base = path.basename(codeNode.id, path.extname(codeNode.id));
      if (base.length > 2 && text.includes(base.toLowerCase())) {
        edges.push({ from: uc.id, to: codeNode.id, type: 'about', confidence: 'inferred' });
      }
    }
  }
  return { nodes, edges };
}

// `cover gaps --json` gives a real design-completeness/proven-coverage
// rollup per use-case, including a ready_command per pending item — richer
// than the about-edge substring-match heuristic computeDrift used before
// this existed. Same execSync-in-target-cwd, degrade-to-null pattern
// buildClaimGraph already uses above: no .context/ store, an
// unauthenticated session, or malformed kane-cli output all degrade to "no
// gaps data" rather than crashing the build.
export function fetchGapsData(target) {
  const contextDir = path.join(target, '.context');
  if (!fs.existsSync(contextDir)) return null;
  try {
    const out = execSync('kane-cli cover gaps --json', { cwd: target, encoding: 'utf8', maxBuffer: 1024 * 1024 * 20 });
    return JSON.parse(out);
  } catch (err) {
    console.error(`graph-build: gaps data skipped, kane-cli cover gaps failed: ${err.message.split('\n')[0]}`);
    return null;
  }
}

// Compares the PRD graph (claim/feature nodes, from kane-cli's grilled
// use-cases and the task tracker) against the code graph to surface where
// the two disagree — the actual "unify the two graphs" ask, not just
// coloring them differently on the same canvas. Pure function of the
// already-built graph so it's cheap to test without a real .context/ store.
export function computeDrift(graph, activePhaseIds, gapsData) {
  const inScope = (n) => !activePhaseIds || (n.phases || []).some(p => activePhaseIds.has(p));
  const codeIds = new Set(graph.nodes.filter(n => n.type === 'code').map(n => n.id));
  const claimNodes = graph.nodes.filter(n => n.type === 'claim' && inScope(n));
  const featureNodes = graph.nodes.filter(n => n.type === 'feature' && inScope(n));

  const touchesByFeature = new Map();
  for (const e of graph.edges.filter(e => e.type === 'touches')) {
    if (!touchesByFeature.has(e.from)) touchesByFeature.set(e.from, []);
    touchesByFeature.get(e.from).push(e.to);
  }

  // `cover gaps --json`'s own design-completeness/proven rollup replaces the
  // old about-edge substring-match heuristic for orphanClaims/lowTrustClaims
  // whenever it's available — a real kane-cli computation instead of "does
  // any file's text happen to contain this use-case's basename." Falls back
  // to the about-edge heuristic when gapsData is absent (no .context/ store,
  // or the kane-cli call failed). inScopeClaimIds keeps this consistent with
  // the same phase-scoping every other drift category already respects —
  // gapsData's own use-cases carry no `phases` field (that's a
  // GuardianKane-computed property of the graph's claim nodes, not part of
  // kane-cli's own output), so scoping is applied by cross-referencing each
  // use-case's id against the already-phase-filtered claimNodes.
  const inScopeClaimIds = new Set(claimNodes.map(n => n.id));
  const gapsUsecases = (gapsData?.usecases || []).filter(uc => inScopeClaimIds.has(uc.id));

  let orphanClaims, lowTrustClaims;
  if (gapsData) {
    orphanClaims = gapsUsecases
      .filter(uc => uc.design_completeness?.status !== 'complete')
      .map(uc => ({ id: uc.id, title: uc.title, pct: uc.design_completeness?.pct }));
    lowTrustClaims = gapsUsecases
      .filter(uc => uc.proven?.status !== 'proven')
      .map(uc => ({ id: uc.id, title: uc.title, pct: uc.proven?.pct }));
  } else {
    const claimsWithCoverage = new Set(graph.edges.filter(e => e.type === 'about').map(e => e.from));
    // A PRD claim (grilled use-case) that no code file's text matches at all —
    // either the feature was never built, or the match heuristic can't see it.
    orphanClaims = claimNodes
      .filter(c => !claimsWithCoverage.has(c.id))
      .map(c => ({ id: c.id, title: c.title }));
    // kane-cli's own confidence/staleness metadata on each claim, surfaced
    // rather than silently discarded (it was captured in buildClaimGraph but
    // never read anywhere before this).
    lowTrustClaims = claimNodes
      .filter(c => c.fresh === false || (typeof c.trust === 'number' && c.trust < 0.5))
      .map(c => ({ id: c.id, title: c.title, trust: c.trust, fresh: c.fresh }));
  }

  // A tracked task with no files ever recorded against it — planned but,
  // per the tracker, never actually touched.
  const orphanFeatures = featureNodes
    .filter(f => !(touchesByFeature.get(f.id) || []).length)
    .map(f => ({ id: f.id, label: f.label }));

  // A task's declared files no longer exist in the current code graph —
  // the file was renamed/deleted after the task recorded touching it.
  const staleFeatureFiles = [];
  for (const f of featureNodes) {
    for (const file of touchesByFeature.get(f.id) || []) {
      if (!codeIds.has(file)) staleFeatureFiles.push({ featureId: f.id, file });
    }
  }

  // Code with no PRD claim and no tracked feature pointing at it — either
  // undocumented work, or the PRD/tracker is behind the actual codebase.
  const coveredCode = new Set([
    ...graph.edges.filter(e => e.type === 'touches').map(e => e.to),
    ...graph.edges.filter(e => e.type === 'about').map(e => e.to),
  ]);
  const uncoveredCode = graph.nodes.filter(n => n.type === 'code' && !coveredCode.has(n.id) && inScope(n)).map(n => n.id);

  // The dedicated Gaps panel's actual content: every pending[] entry across
  // in-scope use-cases, each carrying its own ready_command plus the owning
  // use-case's title (a pending entry's own `title` is sometimes the
  // use-case's, sometimes an AC's — usecaseTitle disambiguates for the UI).
  const gaps = gapsUsecases.flatMap(uc => (uc.pending || []).map(p => ({ ...p, usecaseTitle: uc.title })));
  const coverage = gapsData ? { design: gapsData.design_completeness, proven: gapsData.proven } : null;

  return { orphanClaims, orphanFeatures, staleFeatureFiles, uncoveredCode, lowTrustClaims, gaps, coverage };
}

// Shared by the CLI entry point below and by any caller that needs a graph
// rebuilt in-process (e.g. the PostToolUse hook's auto-refresh) without
// paying for a child-process spawn on every file edit.
export async function buildGraph(args) {
  const { nodes: allCodeNodes, edges: codeEdges } = await buildCodeGraph(args.src, args.exclude);
  const codeNodes = allCodeNodes.filter(n => n.type === 'code');
  const testNodes = allCodeNodes.filter(n => n.type === 'test');
  const { nodes: featureNodes, edges: touchesEdges } = buildFeatureGraph(args.target, args.src);
  const { edges: callsEdges } = buildCallsGraph(args.src);
  const { nodes: claimNodes, edges: aboutEdges } = await buildClaimGraph(args.target, codeNodes);
  const { nodes: externalNodes, edges: externalEdges } = buildExternalDepsGraph(allCodeNodes, args.src);
  const gapsData = fetchGapsData(args.target);

  attributeFilePhases([...codeNodes, ...testNodes], featureNodes, touchesEdges);

  const graph = {
    generatedAt: new Date().toISOString(),
    target: args.target,
    nodes: [...codeNodes, ...testNodes, ...featureNodes, ...claimNodes, ...externalNodes],
    edges: [...codeEdges, ...touchesEdges, ...callsEdges, ...aboutEdges, ...externalEdges],
  };
  graph.drift = computeDrift(graph, undefined, gapsData);

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(graph, null, 2));

  return {
    graph,
    summary:
      `graph written: ${graph.nodes.length} nodes ` +
      `(${codeNodes.length} code, ${testNodes.length} test, ${featureNodes.length} feature, ${claimNodes.length} claim, ${externalNodes.length} external), ` +
      `${graph.edges.length} edges ` +
      `(${codeEdges.filter(e => e.type === 'imports').length} imports, ${codeEdges.filter(e => e.type === 'tests').length} tests, ` +
      `${touchesEdges.length} touches, ${callsEdges.length} calls, ${aboutEdges.length} about, ${externalEdges.length} external), ` +
      `drift (${graph.drift.orphanClaims.length} orphan claims, ${graph.drift.orphanFeatures.length} orphan features, ` +
      `${graph.drift.staleFeatureFiles.length} stale files, ${graph.drift.uncoveredCode.length} uncovered code, ${graph.drift.lowTrustClaims.length} low-trust claims, ` +
      `${graph.drift.gaps.length} pending gaps) ` +
      `-> ${args.out}`,
  };
}

// Auto-refresh support: the PostToolUse hook spawns this file's CLI mode as
// a detached background process after every Edit/Write, so the graph never
// goes stale from someone forgetting to re-run it by hand. A lock file
// (with a staleness timeout, in case a build crashed mid-run without
// cleaning up) stops a burst of rapid edits from piling up redundant
// concurrent madge scans; a status file records the outcome — success or
// failure — so the dashboard can show it rather than have the rebuild fail
// silently in a background process nobody is watching.
const STALE_LOCK_MS = 30000;

function lockPath(target) {
  return path.join(target, '.testmuai', '.graph-build.lock');
}

function statusPath(target) {
  return path.join(target, '.testmuai', 'graph-status.json');
}

// Exported so the PostToolUse hook can skip spawning a wasted child process
// when a build is already in flight, without duplicating this logic.
export function isBuildInProgress(target) {
  const p = lockPath(target);
  if (!fs.existsSync(p)) return false;
  try {
    const age = Date.now() - fs.statSync(p).mtimeMs;
    return age < STALE_LOCK_MS;
  } catch {
    return false;
  }
}

function writeStatus(target, status) {
  fs.mkdirSync(path.join(target, '.testmuai'), { recursive: true });
  fs.writeFileSync(statusPath(target), JSON.stringify(status, null, 2) + '\n', 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const lock = lockPath(args.target);
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  fs.writeFileSync(lock, String(process.pid), 'utf8');
  try {
    const { graph, summary } = await buildGraph(args);
    writeStatus(args.target, {
      ok: true,
      generatedAt: graph.generatedAt,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      summary,
    });
    console.log(summary);
  } catch (err) {
    writeStatus(args.target, {
      ok: false,
      attemptedAt: new Date().toISOString(),
      error: err.message,
    });
    logActivity('graph', `auto-refresh failed: ${err.message}`);
    throw err;
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('graph-build failed:', err);
    process.exit(1);
  });
}
