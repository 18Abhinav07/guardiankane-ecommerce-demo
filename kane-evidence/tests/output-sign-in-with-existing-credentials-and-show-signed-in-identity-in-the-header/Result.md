---
test: ../sign-in-with-existing-credentials-and-show-signed-in-identity-in-the-header_test.md
status: passed
started: 2026-08-30T06:32:38.893Z
duration_s: 113
session_id: 2850f9e3-84fb-4e28-9458-a5172e222e2b
---

# Sign in with existing credentials and show signed-in identity in the header — Result

## Step 1 ✓ passed (14.9s)
md5: 41b24b753c499a4d7666409efeeff6c8
Open the storefront at {{start_url}} and go to the shopper sign-in page.

## Step 2 ✓ passed (25.9s)
md5: 375addbf976e181467ed9c920eeeb3d4
On the sign-in form, submit the existing account email {{existing_user_email}} with its correct password {{existing_user_password}}.

## Step 3 ✓ passed (40.4s)
md5: 328d80600d682ed8dabda03290306f19
Assert the shopper is signed in and the header shows {{existing_user_email}} instead of "Sign in".

## Step 4 — assert ✓ passed (30.1s)
md5: 8f3c3795e77e40faee1e5c3788aa3631
Confirm presence check: the header shows the signed-in shopper's email address (exists) — the stated promise: After a successful sign-in, the header shows the signed-in shopper's email address.
