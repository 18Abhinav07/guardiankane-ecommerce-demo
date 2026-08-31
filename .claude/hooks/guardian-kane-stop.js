import { nextPlannedTask } from '../../lib/tracker.js';

const STALE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export function decide({ tasks }, { probeReady, runKane, runSweep, checkCoverage, checkTampering, checkSecrets, log, bugMemory, knowledgeMemory }) {
  const logLine = log || (() => {});
  const memory = bugMemory || null;
  const knowledge = knowledgeMemory || null;

  // Surfaces a "have we seen this before" note without changing any gating
  // decision — pure logging/context, safe to no-op if bugMemory isn't wired.
  function noteIfRegression(taskId, verdict, source) {
    if (!memory || !verdict) return '';
    const bugTitle = verdict.bug_title;
    const rootCause = verdict.root_cause;
    const matches = memory.findMatches(memory.memory, { taskId, bugTitle, rootCause });
    let note = '';
    if (matches.length > 0) {
      const top = matches[0];
      note = ` GuardianKane memory: this resembles a bug previously seen on T-${top.entry.taskId} ("${top.entry.bugTitle}", similarity ${top.score.toFixed(2)}) — check whether that earlier fix regressed or this is the same defect resurfacing elsewhere.`;
      logLine(taskId, `MEMORY: possible regression — resembles a bug previously seen on T-${top.entry.taskId} ("${top.entry.bugTitle}", similarity ${top.score.toFixed(2)}).`);
    }
    memory.recordBug(memory.memory, { taskId, bugTitle, rootCause, family: verdict.family, confidence: verdict.confidence, source });
    try {
      memory.saveMemory(memory.memory);
    } catch (err) {
      logLine(taskId, `BUG-MEMORY SAVE ERROR (failing open, note still surfaced this run): ${err.message}`);
    }
    return note;
  }

  // Records this verification's pass/fail outcome against the exact file set
  // the task declared (task-tracker.md's `files:` list) — this is what feeds
  // the code graph's per-node status border and the dashboard's Memory Graph
  // tab. Unlike bug-memory (failures only, for cross-task similarity), this
  // records every terminal outcome so a later pass can clear a prior fail.
  function recordKnowledgeRun(taskId, files, status, verdict) {
    if (!knowledge || !Array.isArray(files) || files.length === 0) return;
    const task = tasks.find(t => t.id === taskId);
    knowledge.recordRun(knowledge.memory, {
      nodeIds: files,
      objective: task?.prd_ref || task?.title || taskId,
      status,
      bugTitle: verdict?.bug_title,
      rootCause: verdict?.root_cause,
      family: verdict?.family,
      confidence: verdict?.confidence,
    });
    try {
      knowledge.saveMemory(knowledge.memory);
    } catch (err) {
      logLine(taskId, `KNOWLEDGE-MEMORY SAVE ERROR (failing open, state transition still proceeds): ${err.message}`);
    }
  }
  const claimed = tasks.find(t => t.state === 'CLAIMED_DONE');

  // Step 3: staleness check on any task stuck in KANE_VERIFYING
  const stale = tasks.find(t => t.state === 'KANE_VERIFYING' &&
    t.last_run && (Date.now() - new Date(t.last_run).getTime()) > STALE_MS);
  if (stale) {
    stale.state = 'IN_PROGRESS';
    logLine(stale.id, `STALE — stuck in KANE_VERIFYING >5min. Reset to IN_PROGRESS.`);
    return { decision: 'deny', permissionDecisionReason: `T-${stale.id} verification run appears to have crashed (stuck >5min). Reset to IN_PROGRESS — resume work on it.` };
  }

  // Step 1: nothing to verify
  if (!claimed) {
    return { decision: 'allow' };
  }

  // Step 2: manual verification mode
  if (claimed.verification_mode === 'manual') {
    // Claude signals confirmation via `manual_confirmed`, never by writing a
    // KANE_* state itself — the hook alone owns that transition.
    if (!claimed.manual_confirmed) {
      logLine(claimed.id, `manual verification mode — awaiting manual_confirmed: true.`);
      return { decision: 'allow', additionalContext: `T${claimed.id.replace('T', '')} is CLAIMED_DONE with no browser-observable surface for Kane to check. To confirm it, set manual_confirmed: true on its task-tracker.md row (do not change state directly), then stop again.` };
    }
    claimed.state = 'KANE_VERIFIED';
    claimed.last_verdict = { status: 'pass', summary: 'Manually confirmed — no browser-observable surface.', reason: null };
    logLine(claimed.id, `manual_confirmed: true received -> KANE_VERIFIED.`);
    const nextManual = nextPlannedTask(tasks);
    if (nextManual) {
      logLine(claimed.id, `next task: T-${nextManual.id} (${nextManual.title}).`);
      return { decision: 'deny', permissionDecisionReason: `T-${claimed.id} verified. Start T-${nextManual.id}: ${nextManual.title}. Mark it IN_PROGRESS in task-tracker.md before editing files.` };
    }
    logLine(claimed.id, `all tasks KANE_VERIFIED. Build complete.`);
    return { decision: 'allow', done: true, systemMessage: 'GuardianKane: all tasks KANE_VERIFIED. Build complete.' };
  }

  // Step 4: dev server readiness probe
  if (!probeReady()) {
    logLine(claimed.id, `dev server not responding — cannot verify.`);
    return { decision: 'allow', systemMessage: 'GuardianKane: dev server not responding — cannot verify. Check it manually and resume the session.' };
  }

  const hasTestFile = Array.isArray(claimed.test_file)
    ? claimed.test_file.length > 0
    : Boolean(claimed.test_file);

  // Step 4.5 (tampering detection): a disappearing @verifies assertion for
  // an AC that is otherwise unchanged in Kane's graph since this task's last
  // attempt is a distinct violation (test tampering/weakening) — not a
  // normal retry, and not something a normal test failure would ever
  // surface. Runs before any kane-cli test invocation since it only needs
  // the test file's own content plus the graph's current node roster.
  // checkTampering is optional, like runSweep/checkCoverage, so pre-existing
  // callers that don't wire it keep prior behavior.
  let acSnapshot;
  function withAcSnapshot(verdict) {
    const snap = acSnapshot || claimed.last_verdict?.ac_snapshot;
    return snap ? { ...verdict, ac_snapshot: snap } : verdict;
  }
  if (hasTestFile && checkTampering) {
    let tampering;
    try {
      tampering = checkTampering(claimed);
    } catch (err) {
      tampering = { tampered: [], acSnapshot: null, error: err.message };
      logLine(claimed.id, `TAMPERING CHECK ERROR (failing open, treating as no tampering this attempt): ${err.message}`);
    }
    if (tampering.tampered && tampering.tampered.length > 0) {
      claimed.state = 'BLOCKED_NEEDS_HUMAN';
      claimed.last_verdict = { ...(claimed.last_verdict || {}), tampering: tampering.tampered };
      logLine(claimed.id, `TEST TAMPERING DETECTED — assertion(s) for unchanged AC(s) dropped: ${tampering.tampered.join(', ')}. -> BLOCKED_NEEDS_HUMAN.`);
      return { decision: 'allow', systemMessage: `GuardianKane: T-${claimed.id}'s test file stopped asserting ${tampering.tampered.join(', ')} while that AC is unchanged in Kane's graph — this looks like test weakening, not a normal fix. Needs human review.` };
    }
    if (tampering.acSnapshot) {
      acSnapshot = tampering.acSnapshot;
    }
  }

  // Secret-scan gate (Phase 11): a lightweight regex/entropy scan over the
  // task's scoped diff, run before any kane-cli test invocation — same
  // placement rationale as the tampering check above. Unlike tampering
  // (instant block — weakening a test to hide a failure is deliberate),
  // this uses the normal retry-then-BLOCKED_NEEDS_HUMAN cadence: an
  // accidentally-committed secret is a mistake a normal fix-and-retry cycle
  // should be able to resolve. Not gated on hasTestFile — a secret can land
  // in a task with no generated test file too.
  if (checkSecrets) {
    let secretScan;
    try {
      secretScan = checkSecrets(claimed);
    } catch (err) {
      secretScan = { clean: true, findings: [] };
      logLine(claimed.id, `SECRET SCAN ERROR (failing open, treating as clean this attempt): ${err.message}`);
    }
    if (!secretScan.clean) {
      claimed.attempts += 1;
      const detail = secretScan.findings.join('; ') || '(no detail)';
      claimed.last_verdict = { ...(claimed.last_verdict || {}), secret_scan: secretScan };
      logLine(claimed.id, `SECRET SCAN FAILED (attempt ${claimed.attempts}/${MAX_ATTEMPTS}): ${detail}`);
      if (claimed.attempts < MAX_ATTEMPTS) {
        claimed.state = 'KANE_FAILED';
        return { decision: 'deny', permissionDecisionReason: `T-${claimed.id}'s diff appears to contain a secret/credential (attempt ${claimed.attempts}/${MAX_ATTEMPTS}): ${detail}. Flip T-${claimed.id} to IN_PROGRESS first, remove the secret, then re-claim done.` };
      }
      claimed.state = 'BLOCKED_NEEDS_HUMAN';
      logLine(claimed.id, `-> BLOCKED_NEEDS_HUMAN after ${MAX_ATTEMPTS} secret-scan failures.`);
      return { decision: 'allow', systemMessage: `GuardianKane: T-${claimed.id} failed the secret scan ${MAX_ATTEMPTS} times, needs human review.` };
    }
  }

  // Step 5: run kane's scripted test(s) — tasks with no generated test file
  // (e.g. T0's ad-hoc scaffold check) skip straight to the defect sweep,
  // which is their sole verification.
  claimed.state = 'KANE_VERIFYING';
  claimed.last_run = new Date().toISOString();

  let exitCode;
  let runEnd;
  let runResult;
  if (hasTestFile) {
    logLine(claimed.id, `running scripted test: ${JSON.stringify(claimed.test_file)}.`);
    runResult = runKane(claimed.test_file);
    ({ exitCode, runEnd } = runResult);
  } else {
    logLine(claimed.id, `no scripted test file — skipping to defect sweep.`);
    exitCode = 0;
    runEnd = null;
    runResult = null;
  }

  if (exitCode === 0) {
    // Step 6: scripted test passed. Before declaring KANE_VERIFIED, run a
    // second, ad-hoc general-defect sweep of the live app against this
    // task's PRD section — a scripted test only checks what it was told to
    // check; the sweep looks for anything else that's wrong.
    if (hasTestFile) {
      logLine(claimed.id, `scripted test PASSED. summary: ${runEnd?.summary || '(none)'}`);
    }

    // Step 5.5 (per-AC evidence integrity): an aggregate exit-0 can still
    // hide an unproven claim — e.g. an @verifies step that errored out
    // before completing rather than failing an assertion is simply absent
    // from the sealed evidence pack's rollup, not marked failed (confirmed
    // live). checkCoverage is optional, like runSweep, so older/unit-test
    // callers that don't wire it keep their pre-existing behavior.
    let coverageEvidence;
    if (hasTestFile && checkCoverage) {
      let coverage;
      try {
        coverage = checkCoverage(claimed, runResult);
      } catch (err) {
        coverage = { allVerified: false, missing: [`(evidence check error: ${err.message})`] };
      }
      if (!coverage.allVerified) {
        claimed.attempts += 1;
        const detail = coverage.missing.join(', ') || '(no detail)';
        claimed.last_verdict = withAcSnapshot({ ...runEnd, evidence_check: coverage });
        logLine(claimed.id, `AC EVIDENCE CHECK FAILED (attempt ${claimed.attempts}/${MAX_ATTEMPTS}): ${detail}`);
        recordKnowledgeRun(claimed.id, claimed.files, 'fail', null);
        if (claimed.attempts < MAX_ATTEMPTS) {
          claimed.state = 'KANE_FAILED';
          return { decision: 'deny', permissionDecisionReason: `T-${claimed.id} passed its scripted test, but the sealed evidence pack does not show these claimed AC(s) individually proven: ${detail} (attempt ${claimed.attempts}/${MAX_ATTEMPTS}). Flip T-${claimed.id} to IN_PROGRESS first, then fix and re-claim done.` };
        }
        claimed.state = 'BLOCKED_NEEDS_HUMAN';
        logLine(claimed.id, `-> BLOCKED_NEEDS_HUMAN after ${MAX_ATTEMPTS} AC-evidence failures.`);
        return { decision: 'allow', systemMessage: `GuardianKane: T-${claimed.id} failed the per-AC evidence check ${MAX_ATTEMPTS} times, needs human review.` };
      }
      coverageEvidence = coverage.evidence;
    }

    if (!runSweep) {
      // No sweep configured for this run (e.g. older/unit-test caller) —
      // fall back to the pre-sweep behavior unchanged.
      claimed.state = 'KANE_VERIFIED';
      claimed.last_verdict = withAcSnapshot(coverageEvidence ? { ...runEnd, evidence: coverageEvidence } : runEnd);
      recordKnowledgeRun(claimed.id, claimed.files, 'pass', null);
      logLine(claimed.id, `-> KANE_VERIFIED (no sweep configured).`);
      const next = nextPlannedTask(tasks);
      if (next) {
        logLine(claimed.id, `next task: T-${next.id} (${next.title}).`);
        return { decision: 'deny', permissionDecisionReason: `T-${claimed.id} verified. Start T-${next.id}: ${next.title}. Mark it IN_PROGRESS in task-tracker.md before editing files.` };
      }
      logLine(claimed.id, `all tasks KANE_VERIFIED. Build complete.`);
      return { decision: 'allow', done: true, systemMessage: 'GuardianKane: all tasks KANE_VERIFIED. Build complete.' };
    }

    logLine(claimed.id, `running general defect sweep against PRD section "${claimed.prd_ref || claimed.title}".`);
    const sweep = runSweep(claimed);

    if (!sweep.issueFound) {
      claimed.state = 'KANE_VERIFIED';
      claimed.last_verdict = withAcSnapshot(coverageEvidence ? { ...runEnd, evidence: coverageEvidence } : runEnd);
      recordKnowledgeRun(claimed.id, claimed.files, 'pass', null);
      logLine(claimed.id, `sweep found no issues. -> KANE_VERIFIED.`);
      const next = nextPlannedTask(tasks);
      if (next) {
        logLine(claimed.id, `next task: T-${next.id} (${next.title}).`);
        return { decision: 'deny', permissionDecisionReason: `T-${claimed.id} verified. Start T-${next.id}: ${next.title}. Mark it IN_PROGRESS in task-tracker.md before editing files.` };
      }
      logLine(claimed.id, `all tasks KANE_VERIFIED. Build complete.`);
      return { decision: 'allow', done: true, systemMessage: 'GuardianKane: all tasks KANE_VERIFIED. Build complete.' };
    }

    // Sweep flagged a confirmed issue — gate exactly like a scripted-test
    // failure (Step 7), sharing the same attempt cap.
    claimed.attempts += 1;
    claimed.last_verdict = withAcSnapshot(sweep.runEnd || runEnd);
    const sweepSummary = sweep.runEnd?.summary || '(no summary)';
    logLine(claimed.id, `sweep FOUND ISSUE (attempt ${claimed.attempts}/${MAX_ATTEMPTS}): ${sweepSummary}`);
    const sweepMemoryNote = noteIfRegression(claimed.id, sweep.runEnd?.verdict, 'sweep');
    recordKnowledgeRun(claimed.id, claimed.files, 'fail', sweep.runEnd?.verdict);
    if (claimed.attempts < MAX_ATTEMPTS) {
      claimed.state = 'KANE_FAILED';
      return { decision: 'deny', permissionDecisionReason: `T-${claimed.id} passed its scripted test but the general defect sweep found an issue (attempt ${claimed.attempts}/${MAX_ATTEMPTS}): ${sweepSummary}. Flip T-${claimed.id} to IN_PROGRESS first, then fix and re-claim done.${sweepMemoryNote}` };
    }
    claimed.state = 'BLOCKED_NEEDS_HUMAN';
    logLine(claimed.id, `-> BLOCKED_NEEDS_HUMAN after ${MAX_ATTEMPTS} sweep failures.`);
    return { decision: 'allow', systemMessage: `GuardianKane: T-${claimed.id} failed the defect sweep ${MAX_ATTEMPTS} times, needs human review.` };
  }

  if (exitCode === 1) {
    // Step 7
    claimed.attempts += 1;
    claimed.last_verdict = withAcSnapshot(runEnd);
    const remark = runEnd?.summary || '(no summary)';
    const reason = runEnd?.reason || '(no reason)';
    logLine(claimed.id, `scripted test FAILED (attempt ${claimed.attempts}/${MAX_ATTEMPTS}). summary: ${remark}. reason: ${reason}`);
    const testMemoryNote = noteIfRegression(claimed.id, runEnd?.verdict, 'scripted_test');
    recordKnowledgeRun(claimed.id, claimed.files, 'fail', runEnd?.verdict);
    if (claimed.attempts < MAX_ATTEMPTS) {
      claimed.state = 'KANE_FAILED';
      return { decision: 'deny', permissionDecisionReason: `T-${claimed.id} failed verification (attempt ${claimed.attempts}/${MAX_ATTEMPTS}). Summary: ${remark}. Reason: ${reason}. Flip T-${claimed.id} to IN_PROGRESS first, then fix and re-claim done.${testMemoryNote}` };
    }
    claimed.state = 'BLOCKED_NEEDS_HUMAN';
    logLine(claimed.id, `-> BLOCKED_NEEDS_HUMAN after ${MAX_ATTEMPTS} failures.`);
    return { decision: 'allow', systemMessage: `GuardianKane: T-${claimed.id} failed ${MAX_ATTEMPTS} times, needs human review.` };
  }

  // Step 8: exit 2/3, infra/timeout — never touch state further, allow
  const kind = exitCode === 2 ? 'infra/auth error' : 'timeout';
  logLine(claimed.id, `Kane run hit a ${kind} (exit ${exitCode}) — state unchanged.`);
  return { decision: 'allow', systemMessage: `GuardianKane: Kane verification hit a ${kind} (exit ${exitCode}), not a code failure. Check kane-cli auth/connectivity and resume manually.` };
}
