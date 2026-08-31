import fs from 'node:fs';
import path from 'node:path';

const CONFIG_REL_PATH = '.testmuai/guardian-kane.config.json';

// Every reader/writer below accepts an optional baseDir (defaults to cwd) so
// a process operating on a project other than its own cwd — the dashboard
// server, which serves an arbitrary --target — can still go through this
// one config implementation instead of re-reading the file itself.
function configPath(baseDir) {
  return path.join(baseDir || '.', CONFIG_REL_PATH);
}

function readConfig(baseDir) {
  try {
    return JSON.parse(fs.readFileSync(configPath(baseDir), 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(baseDir, patch) {
  const dir = path.join(baseDir || '.', '.testmuai');
  fs.mkdirSync(dir, { recursive: true });
  const cfg = { ...readConfig(baseDir), ...patch };
  fs.writeFileSync(configPath(baseDir), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  return cfg;
}

export function getAppUrl(baseDir) {
  if (process.env.GUARDIAN_KANE_APP_URL) return process.env.GUARDIAN_KANE_APP_URL;
  const cfg = readConfig(baseDir);
  if (cfg.appUrl) return cfg.appUrl;
  throw new Error(
    `GuardianKane: no app URL configured. Set GUARDIAN_KANE_APP_URL or run 'node lib/config.js --set-app-url http://localhost:<port>'.`
  );
}

export function writeAppUrl(appUrl, baseDir) {
  writeConfig(baseDir, { appUrl });
}

// Where the project's real source lives, for the graph builder and the
// mutation-test scanner. Defaults to 'src' (graph-build.js's own CLI
// default) so projects that never set this explicitly still work.
export function getSrcDir(baseDir) {
  return readConfig(baseDir).srcDir || 'src';
}

export function writeSrcDir(srcDir, baseDir) {
  writeConfig(baseDir, { srcDir });
}

// Regex fragments (madge excludeRegExp) for repos where srcDir has to be
// wide (e.g. this repo's own '.', so the graph covers lib/, dashboard/, and
// .claude/hooks/ together) and needs carve-outs for unrelated subtrees.
// Empty by default — most target projects have one clean src/ and need none.
// There is no writer for this: no part of the product infers an exclude
// pattern on its own, so setting one is a manual edit to the config file.
export function getExclude(baseDir) {
  return readConfig(baseDir).exclude || [];
}

// CLI mode — gives the skill (and a human) a real, testable way to write
// appUrl/srcDir instead of an ad-hoc inline write from prose instructions.
export function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--set-app-url') args.appUrl = argv[++i];
    else if (a === '--set-src') args.srcDir = argv[++i];
  }
  return args;
}

function runCli(argv) {
  const args = parseCliArgs(argv);
  if (!args.appUrl && !args.srcDir) {
    console.error('usage: node lib/config.js --set-app-url <url> | --set-src <dir>');
    process.exitCode = 1;
    return;
  }
  if (args.appUrl) writeAppUrl(args.appUrl);
  if (args.srcDir) writeSrcDir(args.srcDir);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(process.argv.slice(2));
}
