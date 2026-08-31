import { spawnSync } from 'node:child_process';

// Wraps `kane-cli context review --approve <refs...>` — the fix for the
// confirmed P0 bug where a freshly extracted/drafted use-case or AC is never
// reviewed, so it stays queued as `--inferred` forever and `design tests`
// (or a later `cover gaps`) treats it as unresolved debt. Exact syntax and
// exit codes (0 = committed, 2 = one bad ref, atomic — nothing lands)
// confirmed by a live round-trip against a real kane-cli 0.8.7 session, not
// assumed: `context review` takes no `--mode` flag — that flag only applies
// to the conversational commands (context ingest/extract, design tests,
// maintain reconcile, cover).
export function approveReview(refs) {
  const list = Array.isArray(refs) ? refs : [refs];
  if (list.length === 0) {
    throw new Error('approveReview: at least one ref is required');
  }
  const result = spawnSync(
    'kane-cli',
    ['context', 'review', '--approve', ...list],
    { encoding: 'utf8', timeout: 60 * 1000 }
  );
  if (result.error) {
    throw new Error(`kane-cli context review --approve ${list.join(' ')} could not be run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `kane-cli context review --approve ${list.join(' ')} failed (exit ${result.status}): ${(result.stdout || result.stderr || '').trim()}`
    );
  }
  return { exitCode: result.status, stdout: result.stdout || '' };
}

// Enumerates every node in the store (confirmed live: `--json` prints one
// JSON object per line — id/cid/label/title/trust/fresh — not a single JSON
// array; `cid` is content-addressed, so it only changes when the node's own
// content changes). Used by the tampering check (lib/evidence.js's
// detectTamperedAcs) to tell "this AC was legitimately revised/retired"
// apart from "this AC is unchanged but the test quietly stopped asserting
// it," and by listPendingRefs below for the unreviewed-node repair sweep.
export function listContextNodes(extraArgs = []) {
  const result = spawnSync(
    'kane-cli',
    ['context', 'list', '--json', ...extraArgs],
    { encoding: 'utf8', timeout: 60 * 1000 }
  );
  const argsLabel = ['context', 'list', '--json', ...extraArgs].join(' ');
  if (result.error) {
    throw new Error(`kane-cli ${argsLabel} could not be run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `kane-cli ${argsLabel} failed (exit ${result.status}): ${(result.stdout || result.stderr || '').trim()}`
    );
  }
  return (result.stdout || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Every node still sitting unreviewed. Used for the one-time repair sweep on
// a project that already ran `start` before the P0 review-gate fix landed,
// so every use-case and AC left stranded in the derived/unreviewed state
// gets approved in one pass instead of requiring the human to hand-list
// every stale ref.
export function listPendingRefs() {
  return listContextNodes(['--inferred']).map((row) => row.id);
}

// One-time repair sweep: approve every ref still pending. No-op (returns
// null) if nothing is pending, since approveReview requires at least one ref.
export function approveAllPending() {
  const refs = listPendingRefs();
  if (refs.length === 0) return null;
  return approveReview(refs);
}

function runCli(argv) {
  const repair = argv.includes('--repair-all');
  const approveIdx = argv.indexOf('--approve');
  try {
    if (repair) {
      const result = approveAllPending();
      if (!result) {
        console.log('nothing pending — no unreviewed nodes found.');
        return;
      }
      process.stdout.write(result.stdout);
      return;
    }
    if (approveIdx !== -1) {
      const refs = argv.slice(approveIdx + 1);
      const { stdout } = approveReview(refs);
      process.stdout.write(stdout);
      return;
    }
    console.error('usage: node lib/kane-review.js --approve <ref1> [ref2 ...] | --repair-all');
    process.exitCode = 1;
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2));
}
