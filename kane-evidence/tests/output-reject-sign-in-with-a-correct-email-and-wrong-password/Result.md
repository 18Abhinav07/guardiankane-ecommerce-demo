---
test: ../reject-sign-in-with-a-correct-email-and-wrong-password_test.md
status: passed
started: 2026-08-30T06:35:13.026Z
duration_s: 109
session_id: c78394ab-57d9-465b-b2a8-6ec2d0d4b099
---

# Reject sign-in with a correct email and wrong password — Result

## Step 1 ✓ passed (18.6s)
md5: 41b24b753c499a4d7666409efeeff6c8
Open the storefront at {{start_url}} and go to the shopper sign-in page.

## Step 2 ✓ passed (22.1s)
md5: 84dea940dadc1e1ca94e1d2489d2a839
On the sign-in form, submit the existing account email {{existing_user_email}} with the wrong password {{wrong_password}}.

## Step 3 ✓ passed (25.1s)
md5: 0208d8d1e89152f98fe87aa7b294d640
Assert the sign-in attempt is rejected with a clear on-page error message, and confirm the header does not show {{existing_user_email}} as a signed-in identity.

## Step 4 — assert ✓ passed (41.7s)
md5: 3f51d8e184c37b52117a778794e0a368
Confirm 'a signed-in header state for the attempted account' does NOT appear (forbidden-presence) — the stated promise: Signing in with a correct email and a wrong password does not establish a signed-in session.
