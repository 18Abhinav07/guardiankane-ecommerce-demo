const ACTIVITY_LINE_RE = /^\[(.+?)\] \[(.+?)\] (.*)$/;

// Same log, a different question than lib/stuck-tasks.js's parseAttemptHistory:
// that one answers "what happened to task X" (filtered, chronological); this
// answers "what has Kane done, period" (unfiltered, newest first, capped) — the
// feed a dashboard tab polls to show the hooks are actually doing something,
// not just a per-task drill-down. Kept as its own small parser rather than
// generalizing parseAttemptHistory with an optional filter, matching this
// codebase's existing precedent of small single-purpose log parsers over one
// parameterized one (see stuck-tasks.js's own comment against reusing trace.js).
export function parseActivityFeed(logText, limit = 150) {
  const events = [];
  for (const line of (logText || '').split('\n')) {
    const m = ACTIVITY_LINE_RE.exec(line);
    if (!m) continue;
    const [, ts, taskId, detail] = m;
    events.push({ ts, taskId, detail });
  }
  return events.slice(-limit).reverse();
}
