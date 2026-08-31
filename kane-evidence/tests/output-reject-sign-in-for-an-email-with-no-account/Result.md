---
test: ../reject-sign-in-for-an-email-with-no-account_test.md
status: passed
started: 2026-08-30T06:37:28.666Z
duration_s: 106
session_id: 87397985-2eeb-4a90-9ddf-a42adf616f4c
---

# Reject sign-in for an email with no account — Result

## Step 1 ✓ passed (16.5s)
md5: 41b24b753c499a4d7666409efeeff6c8
Open the storefront at {{start_url}} and go to the shopper sign-in page.

## Step 2 ✓ passed (24.9s)
md5: 80d63d936787760c9cc453e3f17c1b04
On the sign-in form, submit the unknown email {{unknown_user_email}} with the password {{unknown_user_password}}.

## Step 3 ✓ passed (28.4s)
md5: 8680fb82d3757742d56ee8cc23da2a74
Assert the sign-in attempt is rejected with a clear on-page error message, and confirm the header does not show {{unknown_user_email}} as a signed-in identity.

## Step 4 — assert ✓ passed (35.2s)
md5: eadb5c50e2b3714e38956a4d5389522d
Confirm 'a signed-in header state for the attempted account' does NOT appear (forbidden-presence) — the stated promise: Signing in with an email that has no account does not establish a signed-in session.
