---
name: guardian-kane
description: Use when the human types /guardian-kane start, sync, or open-pr. Turns a PRD into a sequence of Kane-CLI-verified tasks with a deterministic Stop-hook gate. Never invoked implicitly — only on the explicit slash command.
---

# GuardianKane

## `start ./PRD.md`

1. Run `kane-cli whoami`. If not authenticated, stop and tell the human to run `kane-cli login --oauth`. If `.context/` already exists in this project (a `start` run before the review-gate fix below existed), run `node lib/kane-review.js --repair-all` once now — this approves every use-case/AC/test left stranded unreviewed by that earlier bug (confirmed live: it lists everything `kane-cli context list --json --inferred` reports as pending and approves it in one atomic call) before continuing.
2. Read the PRD file the human pointed at (default `./PRD.md` if no path given).
3. Spawn the project's dev server as a background process (use the project's own `npm run dev` or equivalent — check `package.json` `scripts`). Write its PID to `.testmuai/devserver.pid`. Probe `http://localhost:<port>` with `curl` until it responds (max 10 tries, 2s apart) before continuing. Once it responds, run `node lib/config.js --set-app-url http://localhost:<port>` to write `.testmuai/guardian-kane.config.json` — this is the single source of truth the Stop hook reads for the app URL; never hardcode a port anywhere else, never copy a fallback port from another project, and never hand-write the config file (the CLI is the only writer this flow uses, so a missing/wrong URL is always traceable to this one command not having been run).
4. Consult the `kane-cli` skill for the exact current syntax, then run the PRD pipeline: `context ingest` on the PRD file, then `context extract` to get a structured list of use-cases/features.
5. **Grilling conversation** (this is the core value — do not skip or rush it):
   - For each extracted use-case, restate it back to the human in one sentence and ask them to confirm, edit, or split it.
   - For any use-case that **modifies or ports existing code** (not a from-scratch feature), explicitly ask: "Should I add a structural-preservation assertion — i.e., should Kane also check that `<specific existing element>` is still present/unchanged after this change?" If yes, record that as an extra assertion line to feed into `design tests` for that use-case in Step 7.
   - For any use-case whose restated text mentions authentication, login, permissions, roles, or access control (keyword match — human judgment still confirms), explicitly ask: "Should I add a negative-path assertion — i.e., should Kane also check what happens when this is attempted without authorization?" If yes, record that as an extra assertion line to feed into `design tests` for that use-case in Step 9.
   - Ask whether each use-case has a browser-observable surface. If no, mark it `verification_mode: manual` in the tracker instead of `kane`.
   - Do not proceed to Step 6 until every use-case has an explicit human confirmation.
   - Once every use-case is confirmed, land them all in one atomic approval: run `node lib/kane-review.js --repair-all`. This wraps `kane-cli context review --approve <refs...>` over every ref `kane-cli context list --json --inferred` currently reports as pending. **If this command fails, STOP** — surface its raw output to the human and do not proceed to Step 6. Skipping this step is the confirmed root cause of a fresh install's first task failing at `design tests` in Step 9 below (an unreviewed use-case blocks it) — never continue past a failure here.
6. Write `prd-sections.md`: one confirmed section per use-case, each with its exact wording as agreed in grilling, and its `verification_mode`.
7. **Propose phase groupings.** After use-cases are confirmed (Step 5) and
   `prd-sections.md` is written (Step 6), propose a grouping of the
   confirmed use-cases into ordered phases — e.g. "P0: Scaffold, P1:
   Priority badges (uc-3, uc-4), P2: Filtering (uc-5)". This is your own
   judgment call, not a `kane-cli` command — no Kane feature computes phase
   groupings. Present it as plain text and let the human confirm or edit it,
   the same way earlier grilling confirmations worked. Do not proceed to the
   next step until the human has confirmed a final grouping.
8. Seed `.testmuai/task-tracker.md` using the schema in `.testmuai/task-tracker.example.md`. Write the top-level `phases:` list from Step 7's confirmed grouping (each `{id, title, order}`). T0 is always `{title: "Scaffold — clone + boot", verification_mode: kane, test_file: null, depends_on: [], state: PLANNED, phase: P0}` first — `P0` is always implicitly added to the `phases:` list as `{id: P0, title: Scaffold, order: 0}` even though it was never discussed during Step 7. Then one task per confirmed section, in dependency order as discussed with the human, `state: PLANNED`, `attempts: 0`, `files: []`, and `phase` set to whichever group Step 7's confirmed grouping assigned that section's use-case to.
9. For every task with `verification_mode: kane` (except T0, which uses an ad-hoc `kane-cli run` check, not a generated test file), run `kane-cli design tests --use-case <ref>` (consult the `kane-cli` skill for exact flag names) to generate its `test_file`, saved under `.testmuai/tests/<task-id>_test.md`. `<ref>` is the use-case's `id` from Step 4's extraction / `context list --json --inferred` (a slug like `uc-5`) — **never the restated section text**, which `design tests` does not accept as a use-case reference. Record the test file path in the task's `test_file` field. **Never hand-write a `_test.md` file** — always generate it via kane-cli's own pipeline. Immediately after each task's `design tests` call succeeds, run `node lib/kane-review.js --repair-all` again to approve every AC/scenario/test it just drafted before moving to the next task. If either call fails, STOP and surface the raw kane-cli error — do not record a `test_file` for a task whose design was never approved.
10. Install the Stop hook and PostToolUse hook into `.claude/settings.json` (paths: `.claude/hooks/guardian-kane-stop.sh`, `.claude/hooks/guardian-kane-post-tool-use.sh` — copy `lib/`, `.claude/hooks/guardian-kane-*.js`, `.claude/hooks/guardian-kane-*.sh`, and this skill directory from the GuardianKane repo into the target project). `.claude/settings.local.json` is globally gitignored on this machine, so hook registration must live in the tracked `settings.json` or a fresh clone won't have the hooks wired. `install.sh` already symlinks `.claude/hooks/guardian-kane-pre-commit.sh` to `.git/hooks/pre-commit` — verify that symlink is present (`ls -la .git/hooks/pre-commit`) rather than re-creating it; it blocks a commit that stages a file belonging to a task not yet `KANE_VERIFIED`.
11. Report to the human: task count, list of task titles, and "Starting T0."
12. **Before implementing any task** (T0, or any later task picked up from
    `task-tracker.md`), run `node lib/kane-context.js --task <task-id>` and
    read its output before touching any files. This replays Kane's
    recorded reasoning for the task's relevant use-cases and acceptance
    criteria (zero fresh model calls — it is not asking Kane to re-derive
    anything, only to recall what it already decided), flags if the
    claim's PRD anchors shifted since this task last ran the step, and
    gives a compact orientation of the current claim/code graph. This
    exists specifically so a decision made two sessions ago, or before a
    context-window compaction, is recovered from Kane's durable store
    rather than assumed lost. A T0-shaped task with no `prd_ref` will show
    an empty use-case/AC section — that's expected, not a failure.
13. Begin implementing T0 immediately (the skill's job past this point is:
    run Step 12, implement the active task's code, then just stop the
    turn — the Stop hook takes over from there; Step 12 repeats for every
    subsequent task the same way).

## `dashboard`

`install.sh` already copied a self-contained `dashboard/` into this project and wired an npm script — do not re-copy or re-wire it here. Just run `npm run dashboard` and tell the human it's live at `http://localhost:4173` (or whatever port they override with `--port`). It reads `.testmuai/graph.json` (code graph + PRD claim/feature graph + computed drift), `.testmuai/knowledge-memory.json` (past verification runs), and `.testmuai/quality.json` (mutation-test scores, if a scan has been run).

The graph itself rebuilds automatically — every Edit/Write fires a background rebuild via the PostToolUse hook (`triggerGraphRefresh` in `.claude/hooks/guardian-kane-post-tool-use-entry.js`), so there is no manual "regenerate the graph" step to run or remember. If a rebuild fails, `.testmuai/graph-status.json` records the real error and the dashboard shows it as a banner — check that file (or the banner) before assuming the graph is current. `.testmuai/guardian-kane.config.json`'s `srcDir`/`exclude` fields control what the graph scans; `install.sh` auto-detects `srcDir` (checks for `src/`, `app/`, `lib/`, `source/`, falling back to the project root), but correct it by hand if the detection was wrong for this project's layout.

## `chat` (dashboard ↔ agent)

The dashboard's chat panel is a real two-way bridge to this session, not a chatbot. `/api/chat/send` pushes whatever the human types straight into your input stream via the messaging socket — indistinguishable from them typing it in the terminal. The Stop hook automatically posts a reply back to `/api/chat/reply` on your very next turn-end, built from that run's own `permissionDecisionReason`/`systemMessage` (see `lib/dashboard-reply.js` and the Stop-hook section below) — you do not need to call `/api/chat/reply` yourself for a reply to happen; it fires regardless of what you did that turn. If a message deserves a fuller answer than that one-line gate outcome (an open-ended question, not a task instruction), you may also post your own reply proactively: `curl -s -X POST http://localhost:<port>/api/chat/reply -H 'Content-Type: application/json' -d '{"text":"<answer>"}'` — the port is in `.testmuai/dashboard-info.json`. The Stop hook's own auto-reply still fires afterward as a short second message; that's expected, not a bug.

The first time you start the dashboard on a project whose `.testmuai/chat-log.json` is empty or absent, post one short greeting there (same `curl`) introducing yourself and inviting the human to ask what GuardianKane does — this is the human's first signal that the chat is live, not decorative.

## Explaining GuardianKane (reference — answer from this, not from guessing)

When a human asks what GuardianKane is or how it works — in the dashboard chat or anywhere else:

- It's a Stop-hook gate wrapped around `kane-cli`. An agent can mark a task `CLAIMED_DONE`, but `.claude/hooks/guardian-kane-stop.js` intercepts every attempt to end the turn and only allows `KANE_VERIFIED` after Kane's real browser-based test genuinely passes against the actual running app — twice: a scripted test, then a free-form defect sweep (exact mechanics in the section below).
- Failures are capped at `MAX_ATTEMPTS = 3` per task; the failure after that flips the task to `BLOCKED_NEEDS_HUMAN` instead of looping forever or letting the agent self-report success.
- Every decision is logged to `.testmuai/kane-activity.log` by the hook itself, never by the agent self-reporting — that's the independent audit trail; read it directly to verify a claim rather than trusting the tracker's summary.
- Two separate memory stores exist and answer different questions: `.testmuai/bug-memory.json` is cross-task bug-pattern matching, used only internally by the hook to flag "resembles a bug from T-N"; `.testmuai/knowledge-memory.json` is per-file-set pass/fail history, and is the one the dashboard's Memory graph tab actually renders.
- The dashboard (`npm run dashboard`) has four real tabs — Code graph, Memory graph, PRD graph, Kane activity — plus a Gaps/drift panel fed by `kane-cli cover gaps --json` (design-completeness/proven status per use-case; this is about missing or unproven coverage, not a code-correctness scanner) and a Trace panel (per-tool-call log while a task is active). The graph rebuilds automatically after every Edit/Write via `triggerGraphRefresh` — there is no manual regenerate step.
- The chat bridge above is how a human on the dashboard talks directly to this live agent session — not a separate, dumber assistant.

## What the Stop hook does on every stop (for reference — you never call this yourself)

When a task is `CLAIMED_DONE`, the hook (`.claude/hooks/guardian-kane-stop.js`) does two verification passes before marking it `KANE_VERIFIED`, not one:

1. **Scripted test** — runs the task's generated `_test.md` via `kane-cli testmd run`. This only checks what it was explicitly written to check.
2. **General defect sweep** — if the scripted test passes, the hook immediately runs one more ad-hoc `kane-cli run` (`lib/kane.js`'s `runKaneSweep`) with `--bug-detection stop`, pointed at the same PRD section, asking Kane to freely inspect the live app for anything else wrong (visual defects, console errors, broken elements, PRD mismatches) that the scripted test didn't think to check. A confirmed issue here (`verdict.confirmed === true`) is gated exactly like a scripted-test failure: attempt incremented, task set to `KANE_FAILED` with the sweep's finding as the reason, capped at the same `MAX_ATTEMPTS = 3` before `BLOCKED_NEEDS_HUMAN`.

Every decision the hook makes — what it ran, what it found, what passed, what failed, what state it wrote — is appended as a plain timestamped line to `.testmuai/kane-activity.log` (via `lib/logger.js`). This is the append-only audit trail: it is written **only by the hook itself**, never by Claude self-reporting, so it stands as independent proof of what was actually checked and what the result was — read it directly if you want to verify a claim rather than trust the tracker's summary alone.

## `sync`

When the PRD has changed since the last `start`/`sync`:

1. Run `node lib/reconcile.js --target . --from PRD.md`. This discovers the project's source id live (`kane-cli context list --json --type source`) and runs `kane-cli maintain reconcile --from PRD.md --source-id <id> --plan --mode ci`, staging every detected change into a plan file and recording it in `.testmuai/reconcile-status.json`.
2. If the command fails (no source found, or more than one), stop and report the raw error to the human — do not guess a source id.
3. Read the printed summary. For each row whose command is a literal `kane-cli ...` invocation, you may run it directly (same as any gap-fix command) or leave it for the human to run from the dashboard's Sync plan panel.
4. For rows whose guidance is plain English (not a `kane-cli` command), surface them to the human as-is — these require a human decision before any command applies. Do not attempt to interpret or auto-execute them.
5. Report back to the human: row count, how many were auto-applied, and what remains for their review.

This replaces PRD-diffing entirely — `maintain reconcile` tracks the source's head/version chain internally, so there is no `.testmuai/PRD.snapshot.md` file to maintain anymore.

## `open-pr <task-id>`

1. Run `node .claude/hooks/guardian-kane-open-pr.js <task-id>` (the exact `id` from `task-tracker.md`, e.g. `T3`). It reads the task, refuses with "<id> is not yet KANE_VERIFIED, cannot open a PR for it." if not `KANE_VERIFIED`, refuses if any of the task's `files` show uncommitted changes (tell the human to commit first), and otherwise prints the composed PR body on stdout via its `buildPrBody(task)` (built from the task's `last_verdict`, `prd_ref`, `test_file`, and title — never hand-compose the body text yourself). If it exits non-zero, stop and surface its exact stderr line to the human.
2. Run `gh pr create --title "<task.title>" --body "<the composed body from step 1>"`.
