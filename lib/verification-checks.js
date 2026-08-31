import { existsSync, readFileSync } from 'node:fs';
import { verifyTaskEvidence, parseVerifiesTags, detectTamperedAcs } from './evidence.js';
import { listContextNodes } from './kane-review.js';
import { getScopedDiff } from './review-card.js';

// Requires every @verifies AC across a task's test file(s) to be individually
// proven in the sealed evidence pack this run reported sealing (see
// lib/evidence.js's verifyTaskEvidence for what "proven" means). `runResult`
// is runKaneTest's own return value — it carries `.results`, one entry per
// test file with that file's own `evidencePackPaths`. A file with no
// `@verifies` tags at all has nothing to prove and is skipped, matching
// verifyTaskEvidence's own no-op behavior for such files — a purely
// navigational test file reporting no evidence-pack hint is not a coverage
// failure.
export function checkCoverage(claimed, runResult) {
  const files = Array.isArray(claimed.test_file) ? claimed.test_file : [claimed.test_file];
  const perFileResults = runResult?.results || [];
  const missing = [];
  const evidence = [];
  for (const file of files) {
    if (!file || !existsSync(file)) continue;
    if (parseVerifiesTags(readFileSync(file, 'utf8')).length === 0) continue;

    const fileResult = perFileResults.find((r) => r.testFilePath === file);
    const packs = fileResult?.evidencePackPaths || [];
    if (packs.length === 0) {
      missing.push(`${file}: no evidence pack path reported by this run`);
      continue;
    }
    const check = verifyTaskEvidence(file, packs);
    if (!check.allVerified) missing.push(...check.missing);
    evidence.push(...check.evidence);
  }
  return { allVerified: missing.length === 0, missing, evidence };
}

// Compares this attempt's @verifies tags against the snapshot recorded on
// the task's last attempt (claimed.last_verdict.ac_snapshot) to catch a
// dropped assertion for an AC that's otherwise unchanged in Kane's graph —
// a distinct test-tampering/weakening violation, not a normal retry.
export function checkTampering(claimed) {
  const files = Array.isArray(claimed.test_file) ? claimed.test_file : [claimed.test_file];
  const currentRefs = new Set();
  for (const file of files) {
    if (!file || !existsSync(file)) continue;
    for (const ref of parseVerifiesTags(readFileSync(file, 'utf8'))) currentRefs.add(ref);
  }
  const acNodes = listContextNodes();
  return detectTamperedAcs(claimed.last_verdict?.ac_snapshot || null, [...currentRefs], acNodes);
}

const KNOWN_FORMAT_PATTERNS = [
  { label: 'AWS access key', regex: /AKIA[0-9A-Z]{16}/ },
  { label: 'GitHub token', regex: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { label: 'Slack token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/ },
  { label: 'private key', regex: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
];

const GENERIC_ASSIGNMENT_RE = /\b(api[_-]?key|secret|token|password|passwd|credential)\s*[:=]\s*['"]([^'"]{20,})['"]/i;
const PLACEHOLDER_DENYLIST = ['xxx', 'changeme', 'your_', 'example', 'placeholder', '<', 'todo', 'test'];
const ENTROPY_THRESHOLD = 3.5;

function shannonEntropy(value) {
  const counts = {};
  for (const ch of value) counts[ch] = (counts[ch] || 0) + 1;
  return Object.values(counts).reduce((sum, count) => {
    const p = count / value.length;
    return sum - p * Math.log2(p);
  }, 0);
}

function looksLikePlaceholder(value) {
  const lower = value.toLowerCase();
  return PLACEHOLDER_DENYLIST.some((word) => lower.includes(word));
}

// Scans only added (+-prefixed, non-+++-header) lines of a unified diff —
// gitleaks-style: known-format regexes need no entropy check (format alone
// is signal enough), a generic high-entropy-assignment heuristic catches
// unlabelled secrets but skips obvious placeholders, which otherwise read
// as high-entropy from digit/letter mixing without being real.
export function scanDiffForSecrets(diffText) {
  const findings = [];
  let currentFile = '(unknown file)';
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      currentFile = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const added = line.slice(1);

    for (const { label, regex } of KNOWN_FORMAT_PATTERNS) {
      if (regex.test(added)) {
        findings.push(`${currentFile}: possible ${label}`);
      }
    }

    const match = added.match(GENERIC_ASSIGNMENT_RE);
    if (match) {
      const value = match[2];
      if (!looksLikePlaceholder(value) && shannonEntropy(value) > ENTROPY_THRESHOLD) {
        findings.push(`${currentFile}: high-entropy value assigned to "${match[1]}"`);
      }
    }
  }
  return { clean: findings.length === 0, findings };
}

// Thin wrapper matching checkCoverage/checkTampering's own convention —
// cwd-relative ('.'), since the Stop hook always runs with cwd already set
// to the target project root.
export function checkSecrets(claimed) {
  const diff = getScopedDiff('.', claimed.files) || '';
  return scanDiffForSecrets(diff);
}
