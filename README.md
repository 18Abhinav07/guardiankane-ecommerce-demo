# Trailhead Goods — a GuardianKane build

A small e-commerce app (product catalog, cart, signup/signin, checkout, order
confirmation) built end-to-end by Claude Code — with every task gated by
[GuardianKane](https://github.com/18Abhinav07/adventures-with-kane), a
Stop-hook that refuses to let the agent claim a task "done" until
[`kane-cli`](https://testmuai.com) has actually opened a browser and proven it.

**This repo is not the product.** It's the test subject — the thing the agent
built while GuardianKane watched, caught real regressions, and forced fixes
before the agent was allowed to move on. GuardianKane itself lives at
[github.com/18Abhinav07/adventures-with-kane](https://github.com/18Abhinav07/adventures-with-kane);
this repo has it installed in-place (`.claude/`, `lib/`, `dashboard/`) so the
whole loop is runnable from a single clone.

## Run it in under 30 seconds

```bash
git clone https://github.com/18Abhinav07/guardiankane-ecommerce-demo.git
cd guardiankane-ecommerce-demo
npm install
npm run dev
```

Open `http://localhost:3500`. Sign up, add a product to the cart, check out
with any Luhn-valid test card (`4111 1111 1111 1111`, any future expiry,
any 3-digit CVV) — you'll land on a real order confirmation page with a
generated order ID.

To see the verification dashboard (graph of the codebase, live Kane activity
feed, drift/gaps against the PRD):

```bash
npm run dashboard
```

Open `http://localhost:4173`. It opens with a first-run guide explaining
what each tab and panel means.

## Kane caught a real regression during this build

This app was built task-by-task against `PRD.md`, one task per PRD use case,
tracked in `.testmuai/task-tracker.md`. Every time Claude claimed a task
done, GuardianKane's Stop hook ran `kane-cli` against the actual running app
before letting it stop. The full, unedited log is at
[`kane-evidence/kane-activity.log`](kane-evidence/kane-activity.log); the
task states are at [`kane-evidence/task-tracker.md`](kane-evidence/task-tracker.md).

The clearest example — task T5, "Payment & order confirmation":

```
[2026-08-30T08:47:44.891Z] [T5] scripted test FAILED (attempt 1/3).
  summary: testrun batch: 0/3 passed. reason: all members passed
[2026-08-30T08:53:48.053Z] [T5] scripted test FAILED (attempt 2/3).
  summary: testrun batch: 1/3 passed.
  reason: failed members: reject-invalid-card-details-at-checkout-without-confirmation_test.md (failed),
  place-a-paid-order-and-reach-order-confirmation_test.md (failed)
[2026-08-30T08:59:08.135Z] [T5] scripted test FAILED (attempt 3/3).
  summary: testrun batch: 1/3 passed. reason: failed members: [same two tests]
[2026-08-30T08:59:08.137Z] [T5] -> BLOCKED_NEEDS_HUMAN after 3 failures.
```

Kane replayed the generated checkout test against the real running app three
times, failed it three times with a specific reason each time, and — per
GuardianKane's `MAX_ATTEMPTS = 3` cap — escalated to a human instead of
looping forever or letting the agent quietly mark it done anyway. The actual
checkout flow ("place a paid order and reach order confirmation") was
genuinely broken at that point in the build.

That failure is real and left exactly as Kane produced it — this repo does
not retroactively "fix the log." The checkout flow has since been corrected;
you can verify it yourself with the run-it steps above, or by running
`kane-cli testmd run kane-evidence/tests/place-a-paid-order-and-reach-order-confirmation_test.md --agent --headless`
against a running `npm run dev` instance.

## The closed loop

This is the mechanism the log above is a trace of, not a one-off script:

1. **Agent claims a task done.** Claude edits `server.js`/`views/checkout.html`
   etc., marks task `T5` `CLAIMED_DONE` in the tracker, and tries to stop.
2. **The Stop hook intercepts it** (`.claude/hooks/guardian-kane-stop.js`).
   It shells out to `kane-cli testmd run` against the task's generated test
   file(s), running a real headless browser against the app on its actual
   port.
3. **Kane fails it with a reason.** The hook returns
   `{ decision: 'deny', permissionDecisionReason: '<Kane's exact failure> ' }` —
   in Claude Code's Stop-hook semantics this blocks the agent from stopping
   and injects the reason straight into its context.
4. **The agent reads the reason and fixes the real code** — not the test —
   then saves again, which re-triggers the same Stop hook automatically.
5. **This repeats up to 3 times.** If it still fails, GuardianKane stops
   retrying and flips the task to `BLOCKED_NEEDS_HUMAN`, surfaced on the
   dashboard's Stuck Tasks panel, instead of looping forever.

No separate "run tests" step, no CI job, no human triggering Kane by hand —
every save is a save-and-verify, and the failure reason is what actually
drives the agent's next edit.

## What's in this repo

| Path | What it is |
|---|---|
| `server.js`, `views/`, `public/` | The app itself — Express backend, static frontend |
| `PRD.md`, `prd-sections.md` | The spec the app was built against |
| `.claude/`, `lib/`, `dashboard/` | GuardianKane's engine, installed in-place via its own `install.sh` |
| `.testmuai/task-tracker.md` | Live task state (gitignored — regenerated per run; a snapshot is committed at `kane-evidence/task-tracker.md`) |
| `kane-evidence/` | A committed snapshot of the real verification log, tracker state, and every generated Kane test file, so the evidence above doesn't require re-running the build to inspect |

## Built with

Claude Code, gated by GuardianKane, verified by `kane-cli`.
