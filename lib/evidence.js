import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';

// kane-cli prints a hint to stderr after a testmd/testrun invocation seals
// its evidence pack, naming the pack it just sealed — the only race-free way
// to know which pack a specific invocation produced; `.testmuai/evidence/`
// can hold packs from unrelated prior runs. Confirmed live (kane-cli 0.8.7)
// that `testmd run` (single file) and `testrun run` (batch) use two
// DIFFERENT wrappings around the same core command:
//   testmd run:  evidence: view locally with `kane-cli evidence serve <path>`
//   testrun run: Evidence — view locally:\n  kane-cli evidence serve <path>   # execution
// so this matches on the one substring both forms share — the literal
// command kane-cli prints for the user to copy-paste — rather than the
// surrounding prose, which is what actually differs between the two.
const EVIDENCE_HINT_RE = /kane-cli evidence serve ([^\s`]+)/g;

export function extractEvidencePackPaths(stderr) {
  const paths = [];
  for (const m of (stderr || '').matchAll(EVIDENCE_HINT_RE)) {
    paths.push(m[1]);
  }
  return paths;
}

function unzipEntries(packPath, pattern) {
  const result = spawnSync('unzip', ['-l', packPath], { encoding: 'utf8' });
  if (result.error) throw new Error(`could not list ${packPath}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`unzip -l ${packPath} failed (exit ${result.status})`);
  return result.stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/).pop())
    .filter((name) => name && name.endsWith(pattern));
}

function unzipRead(packPath, entry) {
  const result = spawnSync('unzip', ['-p', packPath, entry], { encoding: 'utf8' });
  if (result.error) throw new Error(`could not read ${entry} from ${packPath}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`unzip -p ${packPath} ${entry} failed (exit ${result.status})`);
  return result.stdout;
}

// coverage/usecases.yaml (sealed inside every evidence pack) already carries
// kane-cli's own per-AC verified/unverified rollup — confirmed live — so
// there's no need to hand-cross-reference test-file @verifies tags against
// result.yaml step ordinals ourselves. Use the "strict" aspect
// (latest_only, verified_threshold: 1) since Phase 1's requirement is "every
// claimed AC individually passed," not a lenient rolling average.
export function readCoverageFromPack(packPath) {
  const entries = unzipEntries(packPath, 'coverage/usecases.yaml');
  if (entries.length === 0) {
    throw new Error(`${packPath} has no coverage/usecases.yaml — cannot verify per-AC evidence`);
  }
  return load(unzipRead(packPath, entries[0]));
}

export function readResultFromPack(packPath) {
  return unzipEntries(packPath, 'result.yaml').map((entry) => load(unzipRead(packPath, entry)));
}

// Parses a generated test file's body for `@verifies ac-1, ac-2` tags —
// confirmed live to be attached per-step-heading (e.g.
// "## Step 7 — assert @verifies ac-4, ac-5"), never as file-level frontmatter.
export function parseVerifiesTags(testMdContent) {
  const refs = new Set();
  const headingRe = /^##\s+Step\s+\d+.*@verifies\s+(.+)$/gm;
  let m;
  while ((m = headingRe.exec(testMdContent))) {
    for (const ref of m[1].split(',')) {
      const trimmed = ref.trim();
      if (trimmed) refs.add(trimmed);
    }
  }
  return [...refs];
}

// Requires every expected AC ref to show up `verified: true` under the
// pack's own strict rollup — missing from the rollup at all counts the same
// as explicitly unverified. Returns evidence identity (definition_id /
// execution_id, confirmed to match the test file's own frontmatter
// `assurance: {id, base}`) for tamper-evident recording on last_verdict.
export function checkAcCoverage(coverageDoc, expectedAcRefs) {
  const acs = coverageDoc?.rollup?.aspects?.strict?.acs || {};
  const missing = expectedAcRefs.filter((ac) => acs[ac]?.verified !== true);
  return { allVerified: missing.length === 0, missing, expected: expectedAcRefs };
}

// Confirmed live (kane-cli 0.8.7) that `result.yaml`'s `definition_id` is
// the one identifier present under BOTH `testmd run` (sequential) and
// `testrun run` (batch) — it always equals the test file's own frontmatter
// `assurance.base` content hash. `assurance_id` (matched against
// frontmatter's `assurance.id`, a short human-authored label like "t-3")
// also appears in sequential-run result.yaml, but a live batch-run capture
// this session had no `assurance_id` field at all — using it as the match
// key silently failed every batched task's evidence check ("no matching
// evidence pack found" despite a real, correctly-sealed pack existing).
function matchesDefinition(resultDoc, definitionHash) {
  return resultDoc?.definition_id === definitionHash;
}

// Parses a generated test file's YAML frontmatter block (between the two
// `---` fences) properly, rather than pattern-matching raw text — a regex
// anchored on `assurance:` being the very first frontmatter key breaks the
// moment another key precedes it, and `\S+` for the id value picks up
// literal quote characters when the YAML author quotes it.
function parseDefinitionHash(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return null;
  try {
    const frontmatter = load(match[1]);
    return frontmatter?.assurance?.base ?? null;
  } catch {
    return null;
  }
}

// Real, disk/process-touching implementation wired in
// guardian-kane-stop-entry.js. Given the task's test file path(s) and the
// evidence pack path(s) kane-cli reported sealing during this verification
// run, requires every @verifies AC across all of the task's test files to be
// individually proven in its own test's sealed pack.
export function verifyTaskEvidence(testFilePaths, evidencePackPaths) {
  const files = Array.isArray(testFilePaths) ? testFilePaths : [testFilePaths];
  const packs = Array.isArray(evidencePackPaths) ? evidencePackPaths : [evidencePackPaths];
  const missing = [];
  const evidence = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const acRefs = parseVerifiesTags(content);
    if (acRefs.length === 0) continue;

    const definitionHash = parseDefinitionHash(content);

    let matchedPack = null;
    let coverageDoc = null;
    for (const pack of packs) {
      try {
        const results = readResultFromPack(pack);
        if (!definitionHash || !results.some((r) => matchesDefinition(r, definitionHash))) continue;
        // Only commit to this pack once its coverage doc is actually
        // readable — a pack matched by definition hash but with a
        // missing/corrupt coverage/usecases.yaml is not usable evidence,
        // so fall through to the next pack (or "no matching pack found")
        // instead of leaving matchedPack/coverageDoc in a partial state.
        coverageDoc = readCoverageFromPack(pack);
        matchedPack = pack;
        break;
      } catch {
        continue;
      }
    }

    if (!matchedPack) {
      missing.push(...acRefs.map((ac) => `${ac} (${file}: no matching evidence pack found)`));
      continue;
    }

    const result = checkAcCoverage(coverageDoc, acRefs);
    if (!result.allVerified) {
      missing.push(...result.missing.map((ac) => `${ac} (${file})`));
    }
    evidence.push({ file, definitionHash, pack: matchedPack });
  }

  return { allVerified: missing.length === 0, missing, evidence };
}

// A disappearing @verifies assertion between two attempts on the same task
// is only "test tampering / weakening" if the AC it used to verify is still
// present, unchanged, in Kane's graph — an AC that was legitimately retired
// or revised (e.g. via a later reconcile) is a real drop, not a violation.
// `acNodes` is `kane-cli context list --json`'s full roster (confirmed live,
// one node per line, each carrying a content-addressed `cid` that only
// changes when the node's own content changes) — the AC-labeled subset gives
// a ref -> cid map to tell "unchanged" apart from "revised" or "gone".
//
// `previousSnapshot` is the `{ ref: cid }` map captured on the task's prior
// attempt (see verifyTaskEvidence-adjacent wiring in
// guardian-kane-stop-entry.js's checkTampering); pass `null` on a task's
// first attempt, when there is nothing yet to compare against.
export function detectTamperedAcs(previousSnapshot, currentAcRefs, acNodes) {
  const acCids = new Map(
    (acNodes || []).filter((n) => n?.label === 'ac').map((n) => [n.id, n.cid])
  );
  const currentSet = new Set(currentAcRefs);
  const currentSnapshot = {};
  for (const ref of currentAcRefs) {
    if (acCids.has(ref)) currentSnapshot[ref] = acCids.get(ref);
  }

  const tampered = [];
  if (previousSnapshot) {
    for (const [ref, prevCid] of Object.entries(previousSnapshot)) {
      if (currentSet.has(ref)) continue; // still claimed — no drop to evaluate
      if (acCids.get(ref) === prevCid) tampered.push(ref); // still exists, same content, but no longer asserted
    }
  }

  return { tampered, acSnapshot: currentSnapshot };
}
