import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const MEMORY_PATH = '.testmuai/knowledge-memory.json';

// Groups runs by the exact set of files a verification touched — two runs
// against the same file set are the same "thing being verified" even if the
// wording of the objective differs, so they accumulate history together
// instead of each starting a fresh, empty-looking entry.
export function nodeSetSignature(nodeIds) {
  return createHash('sha1').update([...nodeIds].sort().join('|')).digest('hex');
}

export function loadMemory(memoryPath = MEMORY_PATH) {
  try {
    return JSON.parse(fs.readFileSync(memoryPath, 'utf8'));
  } catch {
    return { entries: {} };
  }
}

export function saveMemory(memory, memoryPath = MEMORY_PATH) {
  fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2), 'utf8');
}

// Appends one verification-run outcome for a file set (§7.1 of the v2 design
// doc). `status` is constrained to 'pass'|'fail' — infra_error/timeout exit
// codes are never recorded here, only outcomes that actually judged the code.
// Entry-level status derives from run history: a fail after any earlier pass
// on this same file set is a regression, not a fresh failure.
export function recordRun(memory, { nodeIds, objective, status, bugTitle, rootCause, family, confidence, fixCommit, label, regressionOf }) {
  if (status !== 'pass' && status !== 'fail') {
    throw new Error(`recordRun: status must be 'pass' or 'fail', got ${JSON.stringify(status)}`);
  }
  const sig = nodeSetSignature(nodeIds);
  if (!memory.entries[sig]) memory.entries[sig] = { nodeIds: [...nodeIds].sort(), runs: [], status: 'failing' };
  const entry = memory.entries[sig];
  const hadPriorPass = entry.runs.some(r => r.status === 'pass');
  const run = { timestamp: new Date().toISOString(), objective: objective || null, status };
  if (bugTitle) run.bugTitle = bugTitle;
  if (rootCause) run.rootCause = rootCause;
  if (family) run.family = family;
  if (confidence !== undefined) run.confidence = confidence;
  if (fixCommit) run.fixCommit = fixCommit;
  if (label) run.label = label;
  if (regressionOf) run.regressionOf = regressionOf;
  entry.runs.push(run);
  entry.status = status === 'pass' ? 'fixed' : (hadPriorPass ? 'regressed' : 'failing');
  return memory;
}
