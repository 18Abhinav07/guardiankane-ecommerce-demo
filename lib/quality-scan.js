#!/usr/bin/env node
// Reads Stryker's raw mutation.json (produced by `npx stryker run` with the
// "json" reporter) and reduces it to per-file mutation scores keyed the same
// way graph-build.js keys code nodes (relative to --src), so the dashboard
// can join scores onto graph nodes with a plain object lookup. Degrades to
// zero files, not a crash, when no mutation run has happened yet — quality
// data is optional overlay, not a graph-build dependency.
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { target: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') args.target = path.resolve(argv[++i]);
    else if (a === '--report') args.report = argv[++i];
    else if (a === '--src') args.src = argv[++i];
  }
  args.src = args.src ? path.resolve(args.target, args.src) : path.join(args.target, 'src');
  args.reportPath = args.report ? path.resolve(args.report) : path.join(args.target, 'reports', 'mutation', 'mutation.json');
  args.out = path.join(args.target, '.testmuai', 'quality.json');
  return args;
}

function scoreFile(mutants) {
  const counts = { killed: 0, survived: 0, timeout: 0, noCoverage: 0 };
  for (const m of mutants) {
    if (m.status === 'Killed') counts.killed++;
    else if (m.status === 'Survived') counts.survived++;
    else if (m.status === 'Timeout') counts.timeout++;
    else if (m.status === 'NoCoverage') counts.noCoverage++;
  }
  const total = counts.killed + counts.survived + counts.timeout + counts.noCoverage;
  const mutationScore = total > 0 ? Math.round(((counts.killed + counts.timeout) / total) * 10000) / 100 : null;
  return { mutationScore, total, ...counts };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.reportPath)) {
    console.log(`quality-scan: no mutation report at ${args.reportPath} — run 'npx stryker run' first`);
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify({ generatedAt: new Date().toISOString(), files: {} }, null, 2));
    return;
  }
  const report = JSON.parse(fs.readFileSync(args.reportPath, 'utf8'));
  const files = {};
  for (const [filePath, info] of Object.entries(report.files || {})) {
    const relToSrc = path.relative(args.src, path.resolve(args.target, filePath));
    files[relToSrc] = scoreFile(info.mutants || []);
  }
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2));
  console.log(`quality-scan: wrote ${Object.keys(files).length} file score(s) -> ${args.out}`);
}

main();
