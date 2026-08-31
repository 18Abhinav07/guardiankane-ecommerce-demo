#!/usr/bin/env node
// Phase 2: read-only dashboard (GET /api/graph, GET /api/memory) plus a
// chat bridge (§4 of the agent-loop design) that pushes node-selection
// context into the live Claude Code session via agent-bridge.js's confirmed
// socket protocol, and lets that same session post replies back into a
// shared log file the dashboard UI polls. No verify/fix endpoints yet
// (that's phase 4/6).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { notifyAgent } from './lib/agent-bridge.js';
import { getSrcDir, getExclude } from '../lib/config.js';
import { readTracker, findTask } from '../lib/tracker.js';
import { fetchGapsData } from '../lib/graph-build.js';
import { getScopedDiff, gatherAcRollup, buildReviewCard } from '../lib/review-card.js';
import { explainUseCase, explainAc, viewContext } from '../lib/kane-context.js';
import { readReconcilePlan, buildReconcileSummary } from '../lib/reconcile.js';
import { groupTraceByTask, parseActivityLogForTask, readTrace } from '../lib/trace.js';
import { buildStuckTasksReport } from '../lib/stuck-tasks.js';
import { parseActivityFeed } from '../lib/activity-feed.js';
import { runKaneSweepAsync } from '../lib/kane.js';
import { startGenerateAsync, saveGeneratedAsync } from '../lib/kane-generate.js';
import { readCoverageFromPack, readResultFromPack } from '../lib/evidence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const QUALITY_SCAN_SCRIPT = path.join(__dirname, '..', 'lib', 'quality-scan.js');

let scanRunning = false;
let sweepRunning = false;
let generateRunning = false;

function runToCompletion(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

// Like runToCompletion, but for callers that need the subprocess's stdout
// back (runToCompletion discards it — fine for stryker/quality-scan, not
// fine for kane-cli testmd export, which prints the exported path on
// success).
function runCapturingStdout(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      // kane-cli inconsistently prints some success output (e.g. testmd
      // export's "exported to <path>" line) to stderr rather than stdout —
      // confirmed live, same pattern already documented in lib/kane.js's
      // evidence-pack-path extraction. Combine both streams so callers
      // don't have to guess which one carries the line they need.
      if (code === 0) resolve(stdout + stderr);
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export function parseArgs(argv) {
  const args = { port: 4173, target: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--target') args.target = path.resolve(argv[++i]);
    else if (a === '--src') args.src = argv[++i];
  }
  // Reads the same guardian-kane.config.json the hooks write, via
  // lib/config.js's own reader — this process's cwd is wherever it was
  // launched from, not necessarily the target project, so baseDir is passed
  // explicitly rather than relying on cwd-relative defaults.
  if (!args.src) args.src = getSrcDir(args.target);
  args.exclude = getExclude(args.target);
  args.graphPath = path.join(args.target, '.testmuai', 'graph.json');
  args.graphStatusPath = path.join(args.target, '.testmuai', 'graph-status.json');
  args.scopeStatusPath = path.join(args.target, '.testmuai', 'scope-status.json');
  args.lockStatusPath = path.join(args.target, '.testmuai', 'lock-status.json');
  args.memoryPath = path.join(args.target, '.testmuai', 'knowledge-memory.json');
  args.qualityPath = path.join(args.target, '.testmuai', 'quality.json');
  args.chatLogPath = path.join(args.target, '.testmuai', 'chat-log.json');
  args.chatPendingPath = path.join(args.target, '.testmuai', 'chat-pending.json');
  args.dashboardInfoPath = path.join(args.target, '.testmuai', 'dashboard-info.json');
  args.taskTrackerPath = path.join(args.target, '.testmuai', 'task-tracker.md');
  args.reviewAcksPath = path.join(args.target, '.testmuai', 'review-acks.json');
  args.reconcileStatusPath = path.join(args.target, '.testmuai', 'reconcile-status.json');
  args.tracePath = path.join(args.target, '.testmuai', 'trace.json');
  args.activityLogPath = path.join(args.target, '.testmuai', 'kane-activity.log');
  return args;
}

function readChatLog(chatLogPath) {
  try {
    return JSON.parse(fs.readFileSync(chatLogPath, 'utf8'));
  } catch {
    return [];
  }
}

function appendChatLog(chatLogPath, entry) {
  const log = readChatLog(chatLogPath);
  log.push(entry);
  fs.mkdirSync(path.dirname(chatLogPath), { recursive: true });
  fs.writeFileSync(chatLogPath, JSON.stringify(log, null, 2));
  return log;
}

function readReviewAcks(reviewAcksPath) {
  try {
    return JSON.parse(fs.readFileSync(reviewAcksPath, 'utf8'));
  } catch {
    return [];
  }
}

function appendReviewAck(reviewAcksPath, entry) {
  const acks = readReviewAcks(reviewAcksPath);
  acks.push(entry);
  fs.mkdirSync(path.dirname(reviewAcksPath), { recursive: true });
  fs.writeFileSync(reviewAcksPath, JSON.stringify(acks, null, 2));
  return acks;
}

// Folds an append-only ack log down to one {ackedAt} per acRef for a given
// task — last write wins, matching the design's "append-only log, not a
// set" decision (acking twice is not an error, the GET side just sees the
// newer timestamp).
function latestAcksByRef(acks, taskId) {
  const byRef = {};
  for (const a of acks) {
    if (a.taskId === taskId && a.acRef) byRef[a.acRef] = { ackedAt: a.ackedAt };
  }
  return byRef;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function serveJsonFile(res, filePath, emptyShape) {
  fs.readFile(filePath, 'utf8', (err, data) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (err) {
      res.end(JSON.stringify(emptyShape));
      return;
    }
    res.end(data);
  });
}

function jsonResponse(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

export function createServer(args) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/graph') {
      serveJsonFile(res, args.graphPath, { nodes: [], edges: [] });
      return;
    }
    // Polled by the UI so a failed or in-flight auto-refresh (see
    // guardian-kane-post-tool-use-entry.js) is visible instead of the graph
    // just silently going stale in the background.
    if (url.pathname === '/api/graph-status') {
      serveJsonFile(res, args.graphStatusPath, { ok: null });
      return;
    }
    // Polled by the UI to surface a scope-drift flag the instant it's
    // written by guardian-kane-post-tool-use-entry.js — kept in its own
    // file, never merged into graph-status.json, because graph-build.js's
    // async background rebuild unconditionally overwrites that file and
    // would silently wipe a flag written moments earlier.
    if (url.pathname === '/api/scope-status') {
      serveJsonFile(res, args.scopeStatusPath, { flag: null });
      return;
    }
    if (url.pathname === '/api/lock-status') {
      serveJsonFile(res, args.lockStatusPath, { flag: null });
      return;
    }
    if (url.pathname === '/api/memory') {
      serveJsonFile(res, args.memoryPath, { entries: {} });
      return;
    }
    if (url.pathname === '/api/quality') {
      serveJsonFile(res, args.qualityPath, { files: {} });
      return;
    }
    // Reshapes graph.json's drift.gaps/drift.coverage (computed at build
    // time by computeDrift from kane-cli's own `cover gaps --json` rollup)
    // into a dedicated endpoint — same graph.json /api/graph already
    // serves, just pre-extracted so the Gaps panel doesn't have to re-parse
    // the whole graph client-side to find these two fields.
    if (url.pathname === '/api/gaps') {
      fs.readFile(args.graphPath, 'utf8', (err, data) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (err) {
          res.end(JSON.stringify({ gaps: [], coverage: null }));
          return;
        }
        let graph;
        try {
          graph = JSON.parse(data);
        } catch {
          res.end(JSON.stringify({ gaps: [], coverage: null }));
          return;
        }
        res.end(JSON.stringify({ gaps: graph.drift?.gaps || [], coverage: graph.drift?.coverage || null }));
      });
      return;
    }

    // Runs the real Stryker mutation suite (whatever `mutate` lists in the
    // target repo's stryker.conf.json) then reduces its report with
    // quality-scan.js. Synchronous per-request rather than a background job
    // with polling: on the demo repo's 2 mutated files this completes in a
    // few seconds, well inside an HTTP request's patience.
    if (url.pathname === '/api/quality/scan' && req.method === 'POST') {
      if (scanRunning) {
        jsonResponse(res, 409, { error: 'a mutation scan is already running' });
        return;
      }
      scanRunning = true;
      try {
        await runToCompletion('npx', ['stryker', 'run'], args.target);
        await runToCompletion('node', [QUALITY_SCAN_SCRIPT, '--target', args.target, '--src', args.src], args.target);
        const quality = JSON.parse(fs.readFileSync(args.qualityPath, 'utf8'));
        jsonResponse(res, 200, { ok: true, quality });
      } catch (err) {
        jsonResponse(res, 502, { error: `mutation scan failed: ${err.message}` });
      } finally {
        scanRunning = false;
      }
      return;
    }

    // Executes one pending[] gap's ready_command — a string that ultimately
    // came from kane-cli's own stdout (external tool output, not something
    // GuardianKane generated). Never shelled through a string, which would
    // open a shell-metacharacter injection surface — split into an argv
    // array and spawned directly via the same runToCompletion() the
    // mutation-scan endpoint above already uses. Anything not starting with
    // the literal "kane-cli " prefix is refused before it's ever split or
    // spawned. The plain .split(' ') is a known limitation: every
    // ready_command captured live so far is a flat, space-separated argv
    // with no quoted arguments (see the kane-cli reference doc) — this does
    // not attempt to parse quoted/escaped arguments.
    if (url.pathname === '/api/gaps/run' && req.method === 'POST') {
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { error: 'invalid JSON body' });
        return;
      }
      const cmd = payload.ready_command;
      if (typeof cmd !== 'string' || !cmd.startsWith('kane-cli ')) {
        jsonResponse(res, 400, { error: 'ready_command must be a literal kane-cli invocation' });
        return;
      }
      const argv = cmd.split(' ').filter(Boolean);
      // Word-boundary match (not a bare ^...$ exact match) so a compound
      // verb like "delete-all" or "force-drop" is caught too — confirmed
      // live these otherwise sail past the confirm gate untouched.
      const DESTRUCTIVE_VERBS = /(^|[-_])(delete|drop|revoke)([-_]|$)/i;
      const destructiveToken = argv.slice(1).find((token) => DESTRUCTIVE_VERBS.test(token));
      if (destructiveToken && payload.confirm !== true) {
        jsonResponse(res, 409, {
          error: `${destructiveToken} is destructive — resend with confirm: true to proceed`,
          requiresConfirm: true,
        });
        return;
      }
      try {
        await runToCompletion(argv[0], argv.slice(1), args.target);
        jsonResponse(res, 200, { ok: true });
      } catch (err) {
        jsonResponse(res, 502, { error: `command failed: ${err.message}` });
      }
      return;
    }

    // Serves the plan produced by the last `guardian-kane sync` run (see
    // lib/reconcile.js's CLI mode). Reads the reconcile-status.json pointer
    // file the sync command itself wrote — never globs
    // .context/reconcile/plans/ for "the latest", which would race a second
    // concurrent sync. Row actions are executed via the existing
    // /api/gaps/run endpoint above (same kane-cli-prefix execution guard),
    // not a new endpoint.
    if (url.pathname === '/api/reconcile-plan' && req.method === 'GET') {
      let status;
      try {
        status = JSON.parse(fs.readFileSync(args.reconcileStatusPath, 'utf8'));
      } catch {
        jsonResponse(res, 200, { sourceId: null, headPin: null, changeset: [], rows: [] });
        return;
      }
      try {
        const plan = readReconcilePlan(status.planPath);
        jsonResponse(res, 200, buildReconcileSummary(plan));
      } catch {
        jsonResponse(res, 200, { sourceId: null, headPin: null, changeset: [], rows: [] });
      }
      return;
    }

    // Merges the structured trace log (inspected/changed, written by the
    // PostToolUse hook) with a fresh parse of kane-activity.log (proved,
    // written by the Stop hook's decide()) — no new persisted "proved" data,
    // since decide() already logs every verdict-relevant event there.
    if (url.pathname === '/api/trace' && req.method === 'GET') {
      const taskId = url.searchParams.get('taskId');
      if (!taskId) {
        jsonResponse(res, 400, { error: 'taskId query param is required' });
        return;
      }
      const events = readTrace(args.tracePath);
      const grouped = groupTraceByTask(events, taskId);
      let logText = '';
      try {
        logText = fs.readFileSync(args.activityLogPath, 'utf8');
      } catch {
        // no activity log yet — proved stays empty
      }
      grouped.proved = parseActivityLogForTask(logText, taskId);
      jsonResponse(res, 200, grouped);
      return;
    }

    // Surfaces every task currently in BLOCKED_NEEDS_HUMAN with its full
    // attempt history — no new state-machine logic, MAX_ATTEMPTS and every
    // BLOCKED_NEEDS_HUMAN transition already exist in guardian-kane-stop.js.
    // Unlike /api/trace and /api/review-card, this route takes no taskId:
    // its whole purpose is "show me everything currently stalled."
    if (url.pathname === '/api/stuck-tasks' && req.method === 'GET') {
      let tasks = [];
      try {
        ({ tasks } = readTracker(args.taskTrackerPath));
      } catch {
        // no tracker yet — nothing stuck
      }
      let logText = '';
      try {
        logText = fs.readFileSync(args.activityLogPath, 'utf8');
      } catch {
        // no activity log yet
      }
      jsonResponse(res, 200, { tasks: buildStuckTasksReport(tasks, logText) });
      return;
    }

    // The dashboard's "what is Kane actually doing" feed: a live-polled,
    // newest-first read of kane-activity.log — the same append-only file
    // /api/trace and /api/stuck-tasks already read, just unfiltered and
    // capped instead of scoped to one task, since this route's job is to
    // prove the hooks are running at all, not analyze one task's history.
    if (url.pathname === '/api/activity-feed' && req.method === 'GET') {
      let logText = '';
      try {
        logText = fs.readFileSync(args.activityLogPath, 'utf8');
      } catch {
        // no activity log yet
      }
      jsonResponse(res, 200, { events: parseActivityFeed(logText) });
      return;
    }

    // Bundles one KANE_VERIFIED task's evidence for human review: a diff
    // scoped to its declared files, per-AC pass/fail derived from the sealed
    // evidence pack(s) it produced, the matching claim's *current* cover-gaps
    // coverage (fetched fresh, not the graph.json snapshot — this endpoint is
    // click-triggered per task, not polled, so the extra kane-cli round trip
    // per click is an acceptable cost for freshness), and replayed
    // context/design explain reasoning. Every kane-cli-touching call degrades
    // to null/[] on failure rather than 500ing the whole card.
    if (url.pathname === '/api/review-card' && req.method === 'GET') {
      const taskId = url.searchParams.get('taskId');
      if (!taskId) {
        jsonResponse(res, 400, { error: 'taskId query param is required' });
        return;
      }
      let tracker;
      try {
        tracker = readTracker(args.taskTrackerPath);
      } catch {
        jsonResponse(res, 404, { error: `no task tracker found for ${taskId}` });
        return;
      }
      const task = findTask(tracker.tasks, taskId);
      if (!task) {
        jsonResponse(res, 404, { error: `task ${taskId} not found` });
        return;
      }
      if (task.state !== 'KANE_VERIFIED') {
        jsonResponse(res, 409, { error: `task ${taskId} has not reached KANE_VERIFIED yet (state: ${task.state})` });
        return;
      }

      const diff = getScopedDiff(args.target, task.files);
      const evidence = task.last_verdict?.evidence || [];
      const evidenceAvailable = evidence.length > 0;
      const acRollup = gatherAcRollup(evidence);

      let usecaseCoverage = null;
      let explanations = null;
      try {
        const graph = JSON.parse(fs.readFileSync(args.graphPath, 'utf8'));
        const matchedClaim = (graph.nodes || []).find(
          n => n.type === 'claim' && (n.phases || []).includes(task.phase)
        );
        if (matchedClaim) {
          const gapsData = fetchGapsData(args.target);
          const gapsUc = gapsData?.usecases?.find(uc => uc.id === matchedClaim.id);
          if (gapsUc) usecaseCoverage = { design: gapsUc.design_completeness, proven: gapsUc.proven };
          try {
            const explained = explainUseCase(args.target, matchedClaim.id);
            const acExplanations = {};
            for (const ac of acRollup) {
              try { acExplanations[ac.ref] = explainAc(args.target, ac.ref); } catch { /* skip this one AC */ }
            }
            explanations = { useCase: explained.entries, acs: acExplanations };
          } catch { /* explanations stay null */ }
        }
      } catch { /* usecaseCoverage/explanations stay null — no graph.json yet */ }

      const acks = latestAcksByRef(readReviewAcks(args.reviewAcksPath), taskId);
      const card = buildReviewCard({ task, diff, acRollup, evidenceAvailable, usecaseCoverage, explanations, acks });
      jsonResponse(res, 200, card);
      return;
    }

    // The only write path for per-AC acknowledgment — deliberately no
    // "ack all ACs for this task" endpoint, so a blanket approve-all isn't
    // possible even at the API layer.
    if (url.pathname === '/api/review-card/ack' && req.method === 'POST') {
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { error: 'invalid JSON body' });
        return;
      }
      if (typeof payload.taskId !== 'string' || !payload.taskId || typeof payload.acRef !== 'string' || !payload.acRef) {
        jsonResponse(res, 400, { error: 'taskId and acRef are required' });
        return;
      }
      appendReviewAck(args.reviewAcksPath, { taskId: payload.taskId, acRef: payload.acRef, ackedAt: new Date().toISOString() });
      jsonResponse(res, 200, { ok: true });
      return;
    }

    if (url.pathname === '/api/chat/log' && req.method === 'GET') {
      jsonResponse(res, 200, readChatLog(args.chatLogPath));
      return;
    }

    // Dashboard -> agent: user picks node(s) + types a message; we push the
    // combined context into the live Claude Code session via the confirmed
    // socket bridge and record the outgoing message so the UI can render it
    // immediately without waiting on the agent's (async, out-of-band) reply.
    if (url.pathname === '/api/chat/send' && req.method === 'POST') {
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { error: 'invalid JSON body' });
        return;
      }
      const { text, nodeIds, recommendation } = payload;
      if (typeof text !== 'string' || !text.trim()) {
        jsonResponse(res, 400, { error: 'text is required' });
        return;
      }
      const entry = { role: 'user', text, nodeIds: nodeIds || [], recommendation: recommendation || '', ts: new Date().toISOString() };
      const log = appendChatLog(args.chatLogPath, entry);

      const lines = ['[GuardianKane dashboard]'];
      if ((nodeIds || []).length) lines.push(`selected node(s): ${nodeIds.join(', ')}`);
      if (recommendation) lines.push(`graph-derived recommendation: ${recommendation}`);
      lines.push('', text);
      const contextLine = lines.join('\n');
      try {
        await notifyAgent(contextLine);
      } catch (err) {
        jsonResponse(res, 502, { error: `push to agent failed: ${err.message}`, log });
        return;
      }
      // Marks that a reply is owed. The Stop hook checks this on the
      // agent's very next turn-end and posts a summary to /api/chat/reply
      // regardless of whether the agent itself remembers to — see
      // lib/dashboard-reply.js for why this can't be left to agent memory.
      try {
        fs.mkdirSync(path.dirname(args.chatPendingPath), { recursive: true });
        fs.writeFileSync(args.chatPendingPath, JSON.stringify({ pending: true, sentAt: new Date().toISOString() }));
      } catch {
        // best-effort — a missed marker just means no auto-reply this round
      }
      jsonResponse(res, 200, { ok: true, log });
      return;
    }

    // Agent -> dashboard: the live Claude Code session calls this (e.g. via
    // curl) to post its reply, which the chat panel picks up on its next poll.
    if (url.pathname === '/api/chat/reply' && req.method === 'POST') {
      let payload;
      try {
        payload = JSON.parse(await readBody(req));
      } catch {
        jsonResponse(res, 400, { error: 'invalid JSON body' });
        return;
      }
      if (typeof payload.text !== 'string' || !payload.text.trim()) {
        jsonResponse(res, 400, { error: 'text is required' });
        return;
      }
      const entry = { role: 'agent', text: payload.text, ts: new Date().toISOString() };
      const log = appendChatLog(args.chatLogPath, entry);
      jsonResponse(res, 200, { ok: true, log });
      return;
    }

    // On-request browser inspection — separate from the Stop hook's
    // automatic per-task verification, which is untouched by this route.
    // Runs against a real task's PRD context when taskId is given, or a
    // synthetic "whole app" descriptor when it isn't (a general defect
    // sweep against whatever's currently live, not scoped to one task).
    if (url.pathname === '/api/browser-review' && req.method === 'POST') {
      if (sweepRunning) {
        jsonResponse(res, 409, { error: 'a browser review is already running' });
        return;
      }
      sweepRunning = true;
      try {
        let payload = {};
        try { payload = JSON.parse(await readBody(req) || '{}'); } catch { payload = {}; }
        const tracker = readTracker(args.taskTrackerPath);
        let task;
        if (payload.taskId) {
          task = findTask(tracker.tasks, payload.taskId);
          if (!task) {
            jsonResponse(res, 404, { error: `task ${payload.taskId} not found` });
            return;
          }
        } else {
          task = { id: 'whole-app', title: 'the whole application' };
        }
        const result = await runKaneSweepAsync(task, payload.wsEndpoint || undefined);
        if (result.exitCode !== 0 && !result.runEnd) {
          jsonResponse(res, 502, { error: 'browser review failed to run' });
          return;
        }
        jsonResponse(res, 200, {
          exitCode: result.exitCode,
          runEnd: result.runEnd,
          issueFound: result.issueFound,
          summary: result.runEnd?.summary || null,
          reason: result.runEnd?.reason || null,
        });
      } catch (err) {
        jsonResponse(res, 502, { error: err.message });
      } finally {
        sweepRunning = false;
      }
      return;
    }

    // Renders kane-cli's own PRD claim graph (context view --json) through
    // the dashboard's existing Cytoscape rendering, rather than iframing
    // Kane's standalone HTML output. Whole-response degradation (ok:false,
    // still HTTP 200) rather than per-field, since there's no partial view
    // to salvage on failure.
    if (url.pathname === '/api/prd-graph' && req.method === 'GET') {
      try {
        const view = viewContext(args.target);
        jsonResponse(res, 200, { ok: true, view });
      } catch (err) {
        jsonResponse(res, 200, { ok: false, error: err.message });
      }
      return;
    }

    // Zero-fresh-AI recall of Kane's own recorded reasoning — the cheap
    // first attempt "ask about tests" tries before falling back to a full
    // chat push into the live agent session.
    if (url.pathname === '/api/explain' && req.method === 'GET') {
      const ref = url.searchParams.get('ref');
      const kind = url.searchParams.get('kind');
      if (!ref || (kind !== 'usecase' && kind !== 'ac')) {
        jsonResponse(res, 400, { error: 'ref and kind (usecase|ac) are required' });
        return;
      }
      try {
        const data = kind === 'usecase' ? explainUseCase(args.target, ref) : explainAc(args.target, ref);
        jsonResponse(res, 200, { ok: true, data });
      } catch (err) {
        jsonResponse(res, 200, { ok: false, error: err.message });
      }
      return;
    }

    // Two-step kane-cli generate flow (generate --agent, then generate
    // --save once a request id exists) orchestrated here rather than in a
    // single library wrapper, since --out depends on the first call's
    // returned save_hint/requestId.
    if (url.pathname === '/api/quick-generate' && req.method === 'POST') {
      if (generateRunning) {
        jsonResponse(res, 409, { error: 'a generate is already running' });
        return;
      }
      generateRunning = true;
      try {
        let payload = {};
        try { payload = JSON.parse(await readBody(req) || '{}'); } catch { payload = {}; }
        if (!payload.objective) {
          jsonResponse(res, 400, { error: 'objective is required' });
          return;
        }
        const started = await startGenerateAsync(args.target, payload.objective, payload.scenarioLimit);
        const outDir = started.saveHint || '.testmuai/tests';
        const saved = await saveGeneratedAsync(args.target, started.requestId, outDir);
        jsonResponse(res, 200, {
          requestId: started.requestId,
          scenarioCount: started.scenarioCount,
          caseCount: started.caseCount,
          chat: started.chat,
          savedTo: saved.savedTo,
        });
      } catch (err) {
        jsonResponse(res, 502, { error: err.message });
      } finally {
        generateRunning = false;
      }
      return;
    }

    // Reads a sealed evidence pack's coverage/result docs directly — gated
    // on the pack path actually appearing in this task's own recorded
    // evidence, since `pack` is a filesystem path taken from a query
    // param and must never be usable to read an arbitrary file.
    if (url.pathname === '/api/evidence-view' && req.method === 'GET') {
      const taskId = url.searchParams.get('taskId');
      const pack = url.searchParams.get('pack');
      let tracker;
      try {
        tracker = readTracker(args.taskTrackerPath);
      } catch {
        jsonResponse(res, 404, { error: `no task tracker found for ${taskId}` });
        return;
      }
      const task = findTask(tracker.tasks, taskId);
      if (!task) {
        jsonResponse(res, 404, { error: `task ${taskId} not found` });
        return;
      }
      const knownPacks = (task.last_verdict?.evidence || []).map(e => e.pack);
      if (!pack || !knownPacks.includes(pack)) {
        jsonResponse(res, 403, { error: 'pack is not recognized for this task' });
        return;
      }
      try {
        const coverage = readCoverageFromPack(pack);
        const results = readResultFromPack(pack);
        jsonResponse(res, 200, { ok: true, coverage, results });
      } catch (err) {
        jsonResponse(res, 200, { ok: false, error: err.message });
      }
      return;
    }

    // Exports a generated _test.md to a real Playwright script. testFilePath
    // is gated on membership in the tracker's own recorded test_file
    // fields, for the same reason evidence-view gates on pack membership —
    // it's a filesystem path arriving via a request body.
    if (url.pathname === '/api/export-test' && req.method === 'POST') {
      let payload = {};
      try { payload = JSON.parse(await readBody(req) || '{}'); } catch { payload = {}; }
      if (payload.language !== 'python' && payload.language !== 'javascript') {
        jsonResponse(res, 400, { error: 'language must be python or javascript' });
        return;
      }
      let tracker;
      try {
        tracker = readTracker(args.taskTrackerPath);
      } catch {
        jsonResponse(res, 404, { error: 'no task tracker found' });
        return;
      }
      const knownTestFiles = tracker.tasks.map(t => t.test_file).filter(Boolean);
      if (!payload.testFilePath || !knownTestFiles.includes(payload.testFilePath)) {
        jsonResponse(res, 403, { error: 'testFilePath is not a recognized test file' });
        return;
      }
      try {
        const stdout = await runCapturingStdout('kane-cli', ['testmd', 'export', payload.testFilePath, '--language', payload.language], args.target);
        // Confirmed live: kane-cli prints "exported to <path>" on a fresh
        // export but "reusing existing export at <path>" when the local
        // output dir from a prior export already exists — both are exit-0
        // successes with a real path, so both must be recognized.
        const match = /^(?:exported to|reusing existing export at) (.+)$/m.exec(stdout);
        if (!match) {
          jsonResponse(res, 502, { error: `could not parse export path from: ${stdout.slice(-500)}` });
          return;
        }
        jsonResponse(res, 200, { ok: true, exportedTo: match[1].trim() });
      } catch (err) {
        jsonResponse(res, 502, { error: err.message });
      }
      return;
    }

    const reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
    const filePath = path.join(PUBLIC_DIR, reqPath);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    serveStatic(res, filePath);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const server = createServer(args);
  server.listen(args.port, () => {
    console.log(`GuardianKane dashboard: http://localhost:${args.port}`);
    console.log(`  reading graph from  ${args.graphPath}`);
    console.log(`  reading memory from ${args.memoryPath}`);
    // Lets the Stop hook (a separate process, running from the target
    // project's own cwd) find this dashboard's port to post chat replies
    // back to, without hardcoding or guessing it — see lib/dashboard-reply.js.
    try {
      fs.mkdirSync(path.dirname(args.dashboardInfoPath), { recursive: true });
      fs.writeFileSync(args.dashboardInfoPath, JSON.stringify({ port: args.port, pid: process.pid, startedAt: new Date().toISOString() }));
    } catch (err) {
      console.error(`  warning: could not write ${args.dashboardInfoPath}: ${err.message}`);
    }
  });
}
