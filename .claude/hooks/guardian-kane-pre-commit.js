import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readTracker } from '../../lib/tracker.js';

const TRACKER_PATH = '.testmuai/task-tracker.md';

// Pure: for each staged file, find the task (if any) that declared it in its
// `files` list, and flag it if that task isn't yet verified. A file with no
// owning task (not part of any GuardianKane task yet) is not this guard's
// concern — it neither blocks nor clears a commit on its own.
export function checkStagedFiles(stagedFiles, tasks) {
  const violations = [];
  for (const file of stagedFiles) {
    // A file can legitimately be declared by more than one task — checking
    // only the first owner (tasks.find) let a second, unverified owner slip
    // a commit through as long as some earlier task in the array happened
    // to already be verified. Check every owner.
    const owners = tasks.filter((t) => Array.isArray(t.files) && t.files.includes(file));
    for (const owner of owners) {
      // manual_confirmed can be true before the Stop hook has run (and thus
      // before state itself flips to KANE_VERIFIED) if the agent commits in
      // the same turn it set the flag — that's still a real human sign-off,
      // not an unverified claim, so it clears the guard on its own.
      const manuallyOk = owner.verification_mode === 'manual' && owner.manual_confirmed === true;
      if (owner.state !== 'KANE_VERIFIED' && !manuallyOk) {
        violations.push({ file, taskId: owner.id, state: owner.state });
      }
    }
  }
  return violations;
}

// task ids already carry their own "T" (T0, T1, T3...) — no extra "T-"
// prefix here, unlike an earlier draft of this message which doubled it.
export function formatViolation(v) {
  return `  ${v.file} — ${v.taskId} is ${v.state}, not KANE_VERIFIED`;
}

function getStagedFiles() {
  const output = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
  return output.split('\n').filter(Boolean);
}

function runCli() {
  if (!existsSync(TRACKER_PATH)) {
    // GuardianKane hasn't been started on this project yet — nothing to gate.
    return;
  }
  const { tasks } = readTracker(TRACKER_PATH);
  const staged = getStagedFiles();
  const violations = checkStagedFiles(staged, tasks);
  if (violations.length === 0) {
    return;
  }
  console.error('GuardianKane: commit blocked — staged file(s) belong to an unverified task:');
  for (const v of violations) {
    console.error(formatViolation(v));
  }
  console.error('Finish verification (or set manual_confirmed: true for a manual-mode task) before committing.');
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
