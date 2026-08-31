export function findStuckTasks(tasks) {
  return tasks.filter(t => t.state === 'BLOCKED_NEEDS_HUMAN');
}

const ACTIVITY_LINE_RE = /^\[(.+?)\] \[(.+?)\] (.*)$/;

export function parseAttemptHistory(logText, taskId) {
  const result = [];
  for (const line of (logText || '').split('\n')) {
    const m = ACTIVITY_LINE_RE.exec(line);
    if (!m) continue;
    const [, ts, lineTaskId, detail] = m;
    if (lineTaskId !== taskId) continue;
    result.push({ ts, detail });
  }
  return result;
}

export function buildStuckTasksReport(tasks, logText) {
  return findStuckTasks(tasks).map(t => ({
    id: t.id,
    title: t.title,
    attempts: t.attempts,
    lastVerdict: t.last_verdict || null,
    history: parseAttemptHistory(logText, t.id),
  }));
}
