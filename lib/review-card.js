import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseVerifiesTags, readCoverageFromPack, checkAcCoverage } from './evidence.js';

// Scoped to exactly the task's declared files — never a whole-repo diff.
// Degrades to null (not a thrown error) when git is unavailable, the
// target isn't a repo, or there are no files to diff (a manual-mode task),
// matching the degrade-not-crash discipline every other kane-cli/git
// integration in this codebase already follows.
export function getScopedDiff(target, files) {
  if (!files || files.length === 0) return null;
  const result = spawnSync('git', ['diff', 'HEAD', '--', ...files], { cwd: target, encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return result.stdout || null;
}

// For each {file, pack} entry already recorded in last_verdict.evidence by
// Phase 1's checkCoverage wiring, re-derives the file's @verifies AC refs
// and cross-checks them against that pack's own coverage rollup — reusing
// lib/evidence.js's exports verbatim, no new evidence-parsing logic. A
// single bad entry (unreadable file, corrupt pack) is skipped rather than
// aborting the whole rollup.
export function gatherAcRollup(evidenceEntries) {
  const rollup = [];
  for (const { file, pack } of evidenceEntries || []) {
    try {
      const acRefs = parseVerifiesTags(readFileSync(file, 'utf8'));
      const coverageDoc = readCoverageFromPack(pack);
      const { missing } = checkAcCoverage(coverageDoc, acRefs);
      const missingSet = new Set(missing);
      for (const ref of acRefs) rollup.push({ ref, verified: !missingSet.has(ref), file, pack });
    } catch {
      continue;
    }
  }
  return rollup;
}

// Pure — no I/O — so it's directly testable without mocking spawnSync/fs.
export function buildReviewCard({ task, diff, acRollup, evidenceAvailable, usecaseCoverage, explanations, acks }) {
  const acksByRef = acks || {};
  return {
    taskId: task.id,
    title: task.title,
    prdRef: task.prd_ref || null,
    verdictSummary: task.last_verdict?.summary || null,
    verdictReason: task.last_verdict?.reason || null,
    diff: diff || null,
    evidenceAvailable: !!evidenceAvailable,
    acs: (acRollup || []).map(a => ({
      ref: a.ref,
      verified: a.verified,
      file: a.file,
      pack: a.pack,
      acked: acksByRef[a.ref] || null,
    })),
    coverage: usecaseCoverage || null,
    explanations: explanations || null,
    testFile: task.test_file || null,
  };
}
