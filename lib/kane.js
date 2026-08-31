import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { getAppUrl } from './config.js';
import { extractEvidencePackPaths } from './evidence.js';

// kane-cli spawns further descendants of its own (node dist/index.js ->
// v16-runner -> the actual headless Chrome instances) that inherit its
// process group rather than becoming children Node tracks directly.
// Confirmed live: sending SIGKILL to just the tracked spawnSync child (via
// its `killSignal` option) leaves those descendants running indefinitely as
// orphans, still holding a CDP debug port and a live Chrome instance, even
// well after this function has already returned a timeout verdict. Spawning
// with `detached: true` makes the immediate child its own process-group
// leader (pgid === pid), so killing the *negative* pid reaches every
// descendant still in that group — this must run after every call, timed
// out or not, since a normal exit can still leave stray children (the
// lambdatest playground Chrome instances observed live were not timeouts).
function killProcessGroup(pid) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    // ESRCH: group already empty — nothing left to clean up.
  }
}

export function parseRunEnd(stdout) {
  const lines = stdout.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed.type === 'run_end') return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

function runSingleKaneTest(testFilePath) {
  const appUrl = getAppUrl();
  const variables = JSON.stringify({
    start_url: { value: appUrl },
    portfolio_overview_url: { value: appUrl },
    dashboard_url: { value: appUrl },
  });
  const result = spawnSync(
    'kane-cli',
    ['testmd', 'run', testFilePath, '--agent', '--headless', '--variables', variables],
    { encoding: 'utf8', timeout: 5 * 60 * 1000, killSignal: 'SIGKILL', detached: true }
  );
  killProcessGroup(result.pid);
  const runEnd = parseRunEnd(result.stdout || '');
  // kane-cli's own process exit code can be 1 even when its run_end JSON
  // reports a full pass (status: 'passed', result_code: 100, reason_code:
  // 'success.complete', every step's assertion PASS) — confirmed live on a
  // real testmd run. Trust the structured verdict over the raw exit code
  // here, the same way buildSweepResult already does for sweeps below.
  const exitCode = runEnd?.status === 'passed' ? 0 : result.status;
  return {
    exitCode,
    runEnd,
    stdout: result.stdout || '',
    testFilePath,
    // kane-cli prints the sealed evidence pack's path as a stderr hint, not
    // on stdout (confirmed live) — this is what Phase 1's per-AC coverage
    // check reads to find the exact pack this run sealed.
    evidencePackPaths: extractEvidencePackPaths(result.stderr || ''),
  };
}

const KNOWN_URL_VARS = ['start_url', 'portfolio_overview_url', 'dashboard_url'];
const TEMPLATE_TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

// A generated test can reference any URL-shaped token name kane-cli's
// `design tests` invents for the project's own vocabulary (e.g.
// storefront_url for an e-commerce app) — not just the fixed KNOWN_URL_VARS
// list, which was written for a different project type. Confirmed live: an
// unrecognized `{{storefront_url}}` fell through to fakeValueForToken's
// generic string fallback, so the browser launched with no real URL and got
// stuck on an unrelated playground page instead of the app under test. Any
// token ending in `_url` is assumed to want the real app URL, never a fake
// one — there's no legitimate reason a *_url token should resolve to
// anything else.
function isUrlToken(name) {
  return KNOWN_URL_VARS.includes(name) || /_url$/i.test(name);
}

// A test file can reference any {{token}} its author chose (e.g.
// {{new_user_email}}) with nothing else in the project ever binding it —
// confirmed live to hang the runner indefinitely rather than fail fast,
// since kane-cli has no way to know the token will never resolve. Generate
// a plausible value per unbound token instead, so a run can never stall on
// this specific cause. Patterns are matched on the token name, most
// specific first, falling back to a generic string.
// The token's own name is always embedded in its value, not just its
// category — two differently-named tokens (e.g. existing_user_password vs.
// wrong_password_for_existing_user) must never collide on the same literal
// value, or a negative-path test (submit the WRONG password) can end up
// accidentally submitting the correct one and passing/failing for the
// wrong reason. Confirmed live: an earlier version of this function
// returned the same constant for every password-shaped token, which made
// a wrong-password test silently authenticate.
// Some tokens don't name a role that gets a fresh per-run value (like
// new_user_email) — they name a fixture the app under test already seeds
// (a pre-existing account, a named product in its catalog) or a
// deliberately-shaped test input that only makes sense as a fixed string
// (a valid vs. invalid card, a field name to leave blank). A generic fake
// value for these would never match what the app actually has, so a
// sign-in-as-existing-shopper or add-this-named-product test could never
// genuinely pass. Confirmed live against guardiankane-ecommerce-demo's own
// server.js: it seeds exactly this shopper account and these two product
// names, and its checkout tests reference them by these exact token names.
const FIXED_TOKEN_VALUES = {
  returning_shopper_email: 'existing.shopper@example.com',
  returning_shopper_password: 'ExistingPass1!',
  product_a: 'Trail Runner Sneakers',
  product_b: 'Insulated Steel Bottle',
  valid_card_details: 'card number 4242 4242 4242 4242, expiry 12/29, CVV 123',
  invalid_card_details: 'card number 1111 2222 3333 4445, expiry 01/20, CVV 000',
  missing_card_field: 'CVV',
};

function fakeValueForToken(name) {
  if (Object.prototype.hasOwnProperty.call(FIXED_TOKEN_VALUES, name)) return FIXED_TOKEN_VALUES[name];
  const lower = name.toLowerCase();
  if (lower.includes('email')) return `kane-${name}-${Date.now()}@example.com`;
  if (lower.includes('password')) return `KaneTest!${name}`;
  if (lower.includes('username') || lower.includes('user_name')) return `kane_${name}_${Date.now()}`;
  if (lower.includes('phone')) return '555-0100';
  return `kane-test-${name}`;
}

function mapTokensByFile(testFilePaths) {
  const map = new Map();
  for (const path of testFilePaths || []) {
    let text;
    try {
      text = fs.readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    const tokens = new Set();
    for (const match of text.matchAll(TEMPLATE_TOKEN_RE)) {
      const name = match[1];
      if (!isUrlToken(name)) tokens.add(name);
    }
    map.set(path, tokens);
  }
  return map;
}

function findUnboundTokens(testFilePaths) {
  const tokens = new Set();
  for (const set of mapTokensByFile(testFilePaths).values()) {
    for (const token of set) tokens.add(token);
  }
  return [...tokens];
}

// A common cross-file test pattern: one file creates an account with
// {{new_user_X}}, a separate file signs back in as that "existing" or
// "returning" shopper with {{existing_user_X}} / {{returning_user_X}} —
// confirmed live in this exact shape (new_user_email / existing_user_email
// across two files in the same batch). Without aliasing, each name gets its
// own independent random value, so "existing_user_email" never actually
// matches an account the signup file created — an existing-account sign-in
// test can never genuinely pass. Alias existing_*/returning_* to new_* (same
// suffix) when both are present in the same batch so they refer to one
// real identity. A token with more than just the role prefix in common
// (e.g. wrong_password_for_existing_user) doesn't match this pattern and
// keeps its own independent value, which is required for negative-path
// tests to actually test the wrong credential.
function resolveTokenAliases(tokens) {
  const aliasOf = new Map();
  for (const token of tokens) {
    const match = token.match(/^(?:existing|returning)_(.+)$/);
    if (!match) continue;
    const canonical = `new_${match[1]}`;
    if (tokens.includes(canonical)) aliasOf.set(token, canonical);
  }
  return aliasOf;
}

// `testrun run` has no --variables flag, but kane-cli auto-loads
// {cwd}/.testmuai/variables/*.json for every subcommand — write the same
// url bindings there once so a batched run resolves {{start_url}} etc.
// the same way the sequential --variables path does. Also auto-binds any
// other {{token}} the given test files reference, so an unbound variable
// can never stall the run (see findUnboundTokens above).
function writeVariablesFile(testFilePaths) {
  const appUrl = getAppUrl();
  const variables = {};
  for (const name of KNOWN_URL_VARS) variables[name] = { value: appUrl };
  // mapTokensByFile excludes url-like names from its returned sets, so
  // recover them by re-scanning: any *_url token found in the file text
  // gets bound to the real app URL, whatever kane-cli chose to name it.
  for (const path of testFilePaths || []) {
    let text;
    try {
      text = fs.readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(TEMPLATE_TOKEN_RE)) {
      if (isUrlToken(match[1])) variables[match[1]] = { value: appUrl };
    }
  }
  const tokens = findUnboundTokens(testFilePaths);
  const aliasOf = resolveTokenAliases(tokens);
  const generated = {};
  for (const token of tokens) {
    if (!aliasOf.has(token)) generated[token] = fakeValueForToken(token);
  }
  for (const [token, canonical] of aliasOf) {
    generated[token] = generated[canonical];
  }
  for (const token of tokens) {
    variables[token] = { value: generated[token] };
  }
  fs.mkdirSync('.testmuai/variables', { recursive: true });
  fs.writeFileSync('.testmuai/variables/app.json', JSON.stringify(variables, null, 2) + '\n', 'utf8');
}

// kane-cli's `testrun run` batch endpoint does not preserve the order test
// files were given in — confirmed live: passing [creating-account,
// returning-shopper, wrong-password, no-account] came back in the plan
// sorted as [no-account, wrong-password, returning-shopper, creating-account]
// (alphabetical by path), not the argv order. When one file creates a
// fixture (e.g. signs up {{new_user_email}}) that another file's aliased
// token depends on (e.g. {{existing_user_email}}), the batch can run the
// consumer before the producer and the fixture won't exist yet —
// confirmed live, the returning-shopper test failed with "no account with
// that email" even after resolveTokenAliases made the values match. The
// sequential fallback path in runKaneTest preserves the caller's array
// order, so any real cross-file producer/consumer dependency must force
// that path instead of batching.
function hasCrossFileDependency(tokensByFile, aliasOf) {
  for (const [aliasToken, canonicalToken] of aliasOf) {
    let producerFile = null;
    let consumerFile = null;
    for (const [file, tokens] of tokensByFile) {
      if (tokens.has(canonicalToken)) producerFile = file;
      if (tokens.has(aliasToken)) consumerFile = file;
    }
    if (producerFile && consumerFile && producerFile !== consumerFile) return true;
  }
  return false;
}

function parseTestrunEvents(stdout) {
  return (stdout || '')
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

// Batches a task's test files into one `testrun run --parallel` invocation
// instead of N sequential `testmd run` processes. Returns
// { batchable: false } if the plan was rejected (unauthored member, org
// mismatch, etc.) so the caller can fall back to the sequential path.
function runTestrunBatch(testFilePaths) {
  writeVariablesFile(testFilePaths);
  const tokensByFile = mapTokensByFile(testFilePaths);
  const tokens = [...new Set([].concat(...[...tokensByFile.values()].map((set) => [...set])))];
  const aliasOf = resolveTokenAliases(tokens);
  if (hasCrossFileDependency(tokensByFile, aliasOf)) {
    return { batchable: false };
  }
  const parallel = String(Math.min(3, testFilePaths.length));
  const result = spawnSync(
    'kane-cli',
    ['testrun', 'run', ...testFilePaths, '--headless', '--parallel', parallel],
    // SIGKILL, not the default SIGTERM: a hung kane-cli process (e.g. stuck
    // waiting on its own detached runner daemon) can ignore or fail to act
    // on SIGTERM in time, which is how this timeout was observed live to
    // not actually bound the wall-clock time of a real hang.
    { encoding: 'utf8', timeout: 10 * 60 * 1000, killSignal: 'SIGKILL', detached: true }
  );
  killProcessGroup(result.pid);
  const events = parseTestrunEvents(result.stdout);
  const plan = events.find((e) => e.type === 'testrun_plan');
  if (!plan || plan.valid === false) {
    return { batchable: false };
  }
  const summary = events.find((e) => e.type === 'testrun_summary');
  const memberEnds = events.filter((e) => e.type === 'testrun_member_end');
  const failedMembers = memberEnds.filter((e) => e.status && e.status !== 'passed');
  // A run that ends (whether killed by our own timeout or crashed/exited on
  // its own) before every planned member produced a testrun_member_end event
  // is not "all members passed" — memberEnds is simply incomplete, and
  // failedMembers (derived from memberEnds) can be empty in this case even
  // though the batch clearly didn't succeed. Confirmed live: a batch that
  // crashed early with 0 member-end events but a testrun_summary reporting
  // 0/3 passed fell through to this exact misleading "all members passed"
  // text before this check covered the no-signal case too. Report the
  // incomplete outcome as its own distinct, honest verdict regardless of
  // whether a signal caused it.
  const incomplete = memberEnds.length < plan.members.length;
  let runEnd;
  if (incomplete) {
    const finished = new Set(memberEnds.map((m) => m.path));
    const stalled = plan.members.map((m) => m.path).filter((p) => !finished.has(p));
    const killedNote = result.signal ? ` killed by ${result.signal} after timeout` : ' ended early';
    runEnd = {
      summary: `testrun batch:${killedNote} (${memberEnds.length}/${plan.members.length} members finished)`,
      reason: `testrun did not complete — stalled member(s): ${stalled.join(', ')}`,
    };
  } else {
    runEnd = {
      summary: summary ? `testrun batch: ${summary.totals.passed}/${summary.totals.tests} passed` : '',
      reason: failedMembers.length
        ? `failed members: ${failedMembers.map((m) => `${m.path} (${m.status})`).join(', ')}`
        : 'all members passed',
    };
  }
  // The batch call's evidence-hint(s) aren't verified to map 1:1 by position
  // to testFilePaths (untested: whether testrun emits one hint per member or
  // one for the whole batch) — hand every hint found to each member as a
  // matching candidate instead. verifyTaskEvidence matches a test file to
  // its pack by content (definition_id), not by position, so this is safe
  // either way and never silently drops a real pack.
  const evidencePackPaths = extractEvidencePackPaths(result.stderr || '');
  const results = testFilePaths.map((testFilePath) => ({ testFilePath, evidencePackPaths }));
  // Same exit-code/verdict mismatch guarded against in runSingleKaneTest:
  // kane-cli's testrun process can exit non-zero even when its own event
  // stream shows every member finished and passed. Trust that structured
  // outcome over the raw exit code.
  const allMembersPassed = !incomplete && failedMembers.length === 0 && memberEnds.length > 0;
  const exitCode = allMembersPassed ? 0 : result.status;
  return { batchable: true, exitCode, runEnd, stdout: result.stdout || '', results };
}

// A task may have more than one generated test file (e.g. separate
// default-value and explicit-value cases). For 2+ files, try running them
// as one testrun batch first (parallel workers, one kane-cli startup cost
// instead of N); fall back to the sequential short-circuiting loop if the
// batch plan is rejected. A single file always uses the sequential path —
// there's nothing to parallelize.
export function runKaneTest(testFilePath) {
  const files = Array.isArray(testFilePath) ? testFilePath : [testFilePath];

  if (files.length > 1) {
    const batch = runTestrunBatch(files);
    if (batch.batchable) {
      return { exitCode: batch.exitCode, runEnd: batch.runEnd, stdout: batch.stdout, results: batch.results };
    }
  }

  let combinedStdout = '';
  const results = [];
  let last;
  for (const file of files) {
    last = runSingleKaneTest(file);
    results.push(last);
    combinedStdout += last.stdout;
    if (last.exitCode !== 0) {
      return { exitCode: last.exitCode, runEnd: last.runEnd, stdout: combinedStdout, results };
    }
  }
  return { exitCode: last.exitCode, runEnd: last.runEnd, stdout: combinedStdout, results };
}

// Ad-hoc general defect sweep run after a task's scripted test(s) pass.
// Not a re-run of the scripted assertions — a free-form inspection of the
// live app for anything (visual, console, broken element) that doesn't
// match the PRD section, using kane-cli's own bug-detection mode rather
// than a hand-written pass/fail condition.
function buildSweepArgs(task, wsEndpoint) {
  const appUrl = getAppUrl();
  const prdRef = task.prd_ref ? ` (${task.prd_ref})` : '';
  const objective =
    `Go to ${appUrl} and thoroughly inspect the current implementation of ` +
    `"${task.title}"${prdRef}. Look for visual defects, layout problems, ` +
    `missing or broken elements, console errors, or anything that does not ` +
    `match the stated requirement. Report any issue found.`;
  return [
    'run', objective, '--agent', '--headless', '--bug-detection', 'stop', '--url', appUrl,
    ...(wsEndpoint ? ['--ws-endpoint', wsEndpoint] : []),
  ];
}

function buildSweepResult(exitCode, stdout) {
  const runEnd = parseRunEnd(stdout || '');
  // Trust verdict.confirmed over the raw pass/fail status: a sweep can end
  // with exit 0 (the objective "completed") while still reporting a
  // confirmed bug, and can fail on automation flakiness with no real defect.
  const issueFound = runEnd?.verdict?.confirmed === true || (exitCode !== 0 && !runEnd);
  return { exitCode, runEnd, issueFound, stdout: stdout || '' };
}

// Used by the Stop hook, which is its own short-lived process per
// invocation — blocking it for the sweep's duration is fine, it has
// nothing else to do meanwhile.
export function runKaneSweep(task, wsEndpoint) {
  const result = spawnSync('kane-cli', buildSweepArgs(task, wsEndpoint), {
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
    killSignal: 'SIGKILL',
    detached: true,
  });
  killProcessGroup(result.pid);
  return buildSweepResult(result.status, result.stdout);
}

// Used by the dashboard server, a long-lived process that must keep
// serving other requests (status polls, chat, etc.) while a sweep runs.
// spawnSync would block Node's single event loop for the sweep's full
// duration — confirmed live: a concurrent GET /api/graph-status hung for
// the entire 61s of a real sweep run before this existed.
export function runKaneSweepAsync(task, wsEndpoint) {
  const args = buildSweepArgs(task, wsEndpoint);
  return new Promise((resolve, reject) => {
    const child = spawn('kane-cli', args, { detached: true });
    let stdout = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child.pid);
    }, 5 * 60 * 1000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      killProcessGroup(child.pid);
      if (timedOut) {
        reject(new Error('kane-cli run timed out after 5 minutes'));
        return;
      }
      resolve(buildSweepResult(code, stdout));
    });
  });
}
