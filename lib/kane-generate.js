import { spawn, spawnSync } from 'node:child_process';

function buildStartArgs(objective, scenarioLimit) {
  return ['generate', objective, '--agent', ...(scenarioLimit ? ['--scenario-limit', String(scenarioLimit)] : [])];
}

function parseStartResult(status, stdout, stderr) {
  const lines = (stdout || '').split('\n').filter(Boolean);
  let done = null;
  const chatLines = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === 'generate_chat' && parsed.text) chatLines.push(parsed.text);
      if (parsed.type === 'generate_done') done = parsed;
    } catch {
      continue;
    }
  }
  if (!done) {
    const stderrTail = (stderr || '').slice(-500);
    throw new Error(`kane-cli generate produced no generate_done event (exit ${status}): ${stderrTail}`);
  }
  return {
    requestId: done.request_id,
    status: done.status,
    scenarioCount: done.scenario_count,
    caseCount: done.case_count,
    saveHint: done.save_hint,
    chat: chatLines.join('\n'),
  };
}

function buildSaveArgs(requestId, outDir) {
  return ['generate', '--save', '--req', requestId, '--out', outDir];
}

function parseSaveResult(status, stdout, stderr) {
  if (status !== 0) {
    const stderrTail = (stderr || '').slice(-500);
    throw new Error(`kane-cli generate --save failed (exit ${status}): ${stderrTail}`);
  }
  const match = /^saved \d+ test\(s\) to (.+)$/m.exec(stdout || '');
  if (!match) {
    throw new Error(`could not parse saved-to path from: ${(stdout || '').slice(-500)}`);
  }
  return { savedTo: match[1].trim(), stdout };
}

// spawn() with a callback-based collector, shared by the async generate
// calls below — see runKaneSweepAsync in lib/kane.js for why the dashboard
// server (a long-lived process) must never use spawnSync for these.
function spawnAsync(cmd, args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${cmd} ${args.join(' ')} timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({ status: code, stdout, stderr });
    });
  });
}

export function startGenerate(target, objective, scenarioLimit) {
  const result = spawnSync('kane-cli', buildStartArgs(objective, scenarioLimit), {
    cwd: target,
    encoding: 'utf8',
    timeout: 5 * 60 * 1000,
  });
  return parseStartResult(result.status, result.stdout, result.stderr);
}

export function saveGenerated(target, requestId, outDir) {
  const result = spawnSync('kane-cli', buildSaveArgs(requestId, outDir), {
    cwd: target,
    encoding: 'utf8',
    timeout: 2 * 60 * 1000,
  });
  return parseSaveResult(result.status, result.stdout, result.stderr);
}

export async function startGenerateAsync(target, objective, scenarioLimit) {
  const result = await spawnAsync('kane-cli', buildStartArgs(objective, scenarioLimit), target, 5 * 60 * 1000);
  return parseStartResult(result.status, result.stdout, result.stderr);
}

export async function saveGeneratedAsync(target, requestId, outDir) {
  const result = await spawnAsync('kane-cli', buildSaveArgs(requestId, outDir), target, 2 * 60 * 1000);
  return parseSaveResult(result.status, result.stdout, result.stderr);
}
