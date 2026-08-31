import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTracker, writeTracker } from '../../lib/tracker.js';
import { getSrcDir, getExclude } from '../../lib/config.js';
import { isBuildInProgress, toSrcRelative } from '../../lib/graph-build.js';
import { recordFileTouch, detectScopeDrift, detectFileLock } from './guardian-kane-post-tool-use.js';
import { classifyTool, describeToolCall, appendTraceEvent } from '../../lib/trace.js';

const TRACKER_PATH = '.testmuai/task-tracker.md';
const TRACE_PATH = '.testmuai/trace.json';
const GRAPH_BUILD_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../lib/graph-build.js');

// Fire-and-forget: the graph rebuild (madge scan + kane-cli context read)
// takes seconds, and this hook must return immediately so it never adds
// latency to the agent's own edit loop. Detached + unref'd so the child
// outlives this process; isBuildInProgress skips spawning a redundant one
// when a rebuild from a previous edit is still running (see graph-build.js).
function triggerGraphRefresh() {
  if (isBuildInProgress(process.cwd())) return;
  const exclude = getExclude();
  const args = [GRAPH_BUILD_SCRIPT, '--target', '.', '--src', getSrcDir()];
  if (exclude.length) args.push('--exclude', exclude.join(','));
  const child = spawn(process.execPath, args, { cwd: process.cwd(), detached: true, stdio: 'ignore' });
  child.unref();
}

let stdin = '';
process.stdin.on('data', d => stdin += d);
process.stdin.on('end', () => {
  const input = JSON.parse(stdin || '{}');

  // No tracker yet means GuardianKane hasn't been started on this project
  // (via /guardian-kane start) — nothing to record, not an error.
  if (!existsSync(TRACKER_PATH)) {
    process.exit(0);
  }
  // This hook must never block the agent's flow — readTracker is called
  // unconditionally on every tool call (trace logging needs it for
  // Read/Bash/etc., not just Edit/Write), so a tracker caught mid-write by
  // a concurrent hook invocation must not crash every tool call.
  let tasks, phases;
  try {
    ({ tasks, phases } = readTracker(TRACKER_PATH));
  } catch {
    process.exit(0);
  }
  const activeTaskBefore = tasks.find(t => t.state === 'IN_PROGRESS');

  const bucket = classifyTool(input.tool_name);
  if (bucket && activeTaskBefore) {
    appendTraceEvent(TRACE_PATH, {
      ts: new Date().toISOString(),
      taskId: activeTaskBefore.id,
      tool: input.tool_name,
      bucket,
      detail: describeToolCall(input.tool_name, input.tool_input),
    });
  }

  const filePath = input.tool_input?.file_path;
  if (!filePath || !['Edit', 'Write'].includes(input.tool_name)) {
    process.exit(0);
  }

  const alreadyTouchedByTask = activeTaskBefore ? activeTaskBefore.files.includes(filePath) : false;

  recordFileTouch(tasks, filePath);
  writeTracker(TRACKER_PATH, { tasks, phases });
  triggerGraphRefresh();

  const lockFlag = detectFileLock(tasks, filePath, activeTaskBefore?.id);
  writeFileSync(
    path.join('.testmuai', 'lock-status.json'),
    JSON.stringify({ flag: lockFlag, checkedAt: new Date().toISOString() }, null, 2)
  );

  const graphPath = path.join('.testmuai', 'graph.json');
  let graph = null;
  try {
    graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  } catch {
    // no graph built yet — nothing to compare against, skip silently
  }
  if (graph) {
    const srcAbs = path.resolve(process.cwd(), getSrcDir());
    const normalized = toSrcRelative(filePath, process.cwd(), srcAbs);
    const flag = detectScopeDrift(activeTaskBefore, normalized, graph, { alreadyTouchedByTask });
    writeFileSync(
      path.join('.testmuai', 'scope-status.json'),
      JSON.stringify({ flag, checkedAt: new Date().toISOString() }, null, 2)
    );
  }

  process.exit(0);
});
