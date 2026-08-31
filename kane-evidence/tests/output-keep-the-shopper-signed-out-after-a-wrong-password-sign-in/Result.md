---
test: ../keep-the-shopper-signed-out-after-a-wrong-password-sign-in_test.md
status: passed
started: 2026-08-29T21:46:15.826Z
duration_s: 65
session_id: 57d5d045-d330-4f71-a3e5-fc41225b805a
---

# Keep the shopper signed out after a wrong-password sign-in attempt — Result

## Step 1 ✓ passed (0.94s)
md5: 15634115a57fbae2751cd9d576337ae8
Open {{start_url}}; from the storefront home page, open the shopper sign-in page and confirm the site header offers "Sign in" before any authentication attempt.

## Step 2 ✓ passed (1.82s)
md5: 114bf9a7c2a0c1484bd71189b237a0cc
On the shopper sign-in page, submit the existing shopper email {{existing_user_email}} with the incorrect password {{wrong_password_for_existing_user}}.

## Step 3 ✓ passed (17s)
md5: 58ad72356040922538130d6d2aa14348
Assert a visible sign-in error message is shown for the failed authentication attempt.

## Step 4 ✓ passed (25.1s)
md5: 6a74da67cba41a0c09922f6d8c74eddb
Assert the site header still offers "Sign in" and does not show the attempted shopper email as the signed-in identity.

## Step 5 — assert ✓ passed (17.4s)
md5: 168dade1cf43c9327182a75b96cebff3
Confirm 'the header shows the attempted email instead of "Sign in"' does NOT appear (forbidden-presence) — the stated promise: A sign-in attempt with a correct email and wrong password does not leave the shopper recognized as signed in.
