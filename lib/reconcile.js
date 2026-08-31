import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

// Impure — real spawnSync against the kane-cli binary. Deliberately not
// unit-tested (matches lib/review-card.js's getScopedDiff precedent);
// verified live this session and by manual CLI run during implementation.
export function findSourceId(target) {
  const result = spawnSync('kane-cli', ['context', 'list', '--json', '--type', 'source'], {
    cwd: target,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`kane-cli context list failed: ${result.stderr || result.error}`);
  }
  const sources = JSON.parse(result.stdout);
  if (sources.length === 0) {
    throw new Error('no source found — run `kane-cli context ingest` first');
  }
  if (sources.length > 1) {
    throw new Error(
      'multiple sources found; guardian-kane sync currently supports a single-PRD project'
    );
  }
  return sources[0].id;
}

// Impure — real spawnSync against the kane-cli binary. Deliberately not
// unit-tested; parses the plan path from the subprocess's own stdout so it
// can never pick up a different, concurrently-running reconcile's file.
export function runReconcile(target, fromPath, sourceId) {
  const result = spawnSync(
    'kane-cli',
    ['maintain', 'reconcile', '--from', fromPath, '--source-id', sourceId, '--plan', '--mode', 'ci'],
    { cwd: target, encoding: 'utf8' }
  );
  if (result.error || result.status !== 0) {
    throw new Error(`kane-cli maintain reconcile failed: ${result.stderr || result.error}`);
  }
  const match = /^plan stored: (.+)$/m.exec(result.stdout);
  if (!match) {
    throw new Error('kane-cli maintain reconcile did not print a "plan stored:" line');
  }
  return match[1].trim();
}

export function readReconcilePlan(planPath) {
  return JSON.parse(fs.readFileSync(planPath, 'utf8'));
}

export function buildReconcileSummary(planJson) {
  return {
    sourceId: planJson.sourceId,
    headPin: planJson.headPin,
    changeset: planJson.changeset || [],
    rows: (planJson.rows || []).map(r => ({
      kind: r.kind,
      ref: r.ref,
      reason: r.reason,
      action: r.action,
      runnable: typeof r.action === 'string' && r.action.startsWith('kane-cli '),
    })),
  };
}

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') args.target = argv[++i];
    else if (a === '--from') args.from = argv[++i];
  }
  return args;
}

function runCli(argv) {
  const args = parseCliArgs(argv);
  if (!args.target || !args.from) {
    console.error('usage: node lib/reconcile.js --target <dir> --from <path>');
    process.exitCode = 1;
    return;
  }
  let sourceId, planPath;
  try {
    sourceId = findSourceId(args.target);
    planPath = runReconcile(args.target, args.from, sourceId);
  } catch (err) {
    console.error(`guardian-kane sync failed: ${err.message}`);
    process.exitCode = 1;
    return;
  }
  const statusPath = `${args.target}/.testmuai/reconcile-status.json`;
  fs.mkdirSync(`${args.target}/.testmuai`, { recursive: true });
  fs.writeFileSync(
    statusPath,
    JSON.stringify({ planPath, sourceId, ts: new Date().toISOString() }, null, 2)
  );
  const plan = readReconcilePlan(planPath);
  const runnableCount = (plan.rows || []).filter(
    r => typeof r.action === 'string' && r.action.startsWith('kane-cli ')
  ).length;
  console.log(
    `sync complete: ${(plan.rows || []).length} row(s), ${runnableCount} runnable via kane-cli. Plan stored at ${planPath}`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2));
}
