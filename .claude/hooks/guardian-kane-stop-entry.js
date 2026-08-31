import { existsSync } from 'node:fs';
import { readTracker, writeTracker } from '../../lib/tracker.js';
import { runKaneTest, runKaneSweep } from '../../lib/kane.js';
import { checkCoverage, checkTampering, checkSecrets } from '../../lib/verification-checks.js';
import { getAppUrl } from '../../lib/config.js';
import { logActivity } from '../../lib/logger.js';
import { loadMemory, saveMemory, recordBug, findMatches } from '../../lib/bug-memory.js';
import { loadMemory as loadKnowledgeMemory, saveMemory as saveKnowledgeMemory, recordRun } from '../../lib/knowledge-memory.js';
import { consumeDashboardPending, postDashboardReply } from '../../lib/dashboard-reply.js';
import { decide } from './guardian-kane-stop.js';
import { execSync } from 'node:child_process';

const TRACKER_PATH = '.testmuai/task-tracker.md';

function probeReady() {
  // No hardcoded fallback port: a wrong silent guess here is worse than a
  // loud, visible "not ready" — see lib/config.js.
  let appUrl;
  try {
    appUrl = getAppUrl();
  } catch {
    logActivity('system', "app URL not configured — run: node lib/config.js --set-app-url http://localhost:<port>");
    return false;
  }
  try {
    execSync(`curl -sf ${appUrl} -o /dev/null`, { timeout: 3000 });
    return true;
  } catch {
    try {
      execSync(`sleep 3 && curl -sf ${appUrl} -o /dev/null`, { timeout: 6000 });
      return true;
    } catch {
      return false;
    }
  }
}

// Best-effort: closes the dashboard-chat loop (see lib/dashboard-reply.js)
// by posting a summary back whenever a dashboard message is still awaiting
// a reply, reusing whatever human-readable text this Stop run already
// produced — never a separate summarization pass, never something the
// agent has to remember to do itself.
async function replyToDashboardIfPending(summary) {
  if (!consumeDashboardPending()) return;
  const text = `${summary}\n\n— See the Claude Code session for full details.`;
  await postDashboardReply(text);
}

let stdin = '';
process.stdin.on('data', d => stdin += d);
process.stdin.on('end', async () => {
  // No tracker yet means GuardianKane hasn't been started on this project
  // (via /guardian-kane start) — let Claude Code stop normally.
  if (!existsSync(TRACKER_PATH)) {
    await replyToDashboardIfPending('No GuardianKane task tracker found on this project yet — nothing to verify.');
    process.stdout.write('{}');
    process.exit(0);
  }
  const { tasks, phases } = readTracker(TRACKER_PATH);
  const bugMemory = { memory: loadMemory(), recordBug, findMatches, saveMemory: (m) => saveMemory(m) };
  const knowledgeMemory = { memory: loadKnowledgeMemory(), recordRun, saveMemory: (m) => saveKnowledgeMemory(m) };
  const result = decide({ tasks }, { probeReady, runKane: runKaneTest, runSweep: runKaneSweep, checkCoverage, checkTampering, checkSecrets, log: logActivity, bugMemory, knowledgeMemory });
  writeTracker(TRACKER_PATH, { tasks, phases });

  const summary = result.permissionDecisionReason || result.systemMessage || 'No task state changed this turn.';
  await replyToDashboardIfPending(summary);

  if (result.decision === 'deny') {
    // Stop hooks use the top-level decision/reason shape (not
    // hookSpecificOutput.permissionDecision, which is PreToolUse-only).
    const out = { decision: 'block', reason: result.permissionDecisionReason };
    if (result.systemMessage) out.systemMessage = result.systemMessage;
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  } else {
    const out = {};
    if (result.additionalContext) {
      out.hookSpecificOutput = { hookEventName: 'Stop', additionalContext: result.additionalContext };
    }
    if (result.systemMessage) out.systemMessage = result.systemMessage;
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }
});
