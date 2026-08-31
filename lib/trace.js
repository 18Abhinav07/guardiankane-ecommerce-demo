import fs from 'node:fs';
import path from 'node:path';

export function classifyTool(toolName) {
  if (toolName === 'Read' || toolName === 'Grep' || toolName === 'Glob') return 'inspected';
  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'Bash') return 'changed';
  return null;
}

export function describeToolCall(toolName, toolInput) {
  const input = toolInput || {};
  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'Read') {
    return input.file_path || '(unknown)';
  }
  if (toolName === 'Grep' || toolName === 'Glob') {
    if (!input.pattern) return '(unknown)';
    return input.path ? `pattern: ${input.pattern} in ${input.path}` : `pattern: ${input.pattern}`;
  }
  if (toolName === 'Bash') {
    return input.command ? `command: ${input.command}` : '(unknown)';
  }
  return '(unknown)';
}

export function readTrace(tracePath) {
  try {
    return JSON.parse(fs.readFileSync(tracePath, 'utf8'));
  } catch {
    return [];
  }
}

// appendTraceEvent's read-modify-write is not atomic — under concurrent
// PostToolUse hook invocations (e.g. parallel tool calls in one turn), two
// processes can read the same on-disk state and the second write silently
// clobbers the first process's event. An exclusive lock file (atomic create
// via 'wx') serializes writers without changing trace.json's on-disk format,
// so no downstream reader needs to change.
function acquireLock(lockPath, timeoutMs = 2000) {
  const start = Date.now();
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lockPath, 'wx'));
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() - start > timeoutMs) {
        throw new Error(`timed out waiting for trace lock at ${lockPath}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

function releaseLock(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch {
    // already released
  }
}

export function appendTraceEvent(tracePath, event) {
  fs.mkdirSync(path.dirname(tracePath), { recursive: true });
  const lockPath = `${tracePath}.lock`;
  acquireLock(lockPath);
  try {
    const events = readTrace(tracePath);
    events.push(event);
    fs.writeFileSync(tracePath, JSON.stringify(events, null, 2));
  } finally {
    releaseLock(lockPath);
  }
}

export function groupTraceByTask(events, taskId) {
  const grouped = { inspected: [], changed: [], proved: [] };
  for (const e of events) {
    if (e.taskId !== taskId) continue;
    if (e.bucket === 'inspected' || e.bucket === 'changed') grouped[e.bucket].push(e);
  }
  return grouped;
}

const ACTIVITY_LINE_RE = /^\[(.+?)\] \[(.+?)\] (.*)$/;

export function parseActivityLogForTask(logText, taskId) {
  const result = [];
  for (const line of (logText || '').split('\n')) {
    const m = ACTIVITY_LINE_RE.exec(line);
    if (!m) continue;
    const [, ts, lineTaskId, detail] = m;
    if (lineTaskId !== taskId) continue;
    result.push({ ts, taskId, bucket: 'proved', detail });
  }
  return result;
}
