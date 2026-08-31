---
test: ../keep-the-shopper-signed-out-after-a-no-account-sign-in_test.md
status: passed
started: 2026-08-29T21:38:15.361Z
duration_s: 90
session_id: ebd0c4c5-278a-4f53-b112-d4d645f4b2a2
---

# Keep the shopper signed out after a no-account sign-in attempt — Result

## Step 1 ✓ passed (0.97s)
md5: 15634115a57fbae2751cd9d576337ae8
Open {{start_url}}; from the storefront home page, open the shopper sign-in page and confirm the site header offers "Sign in" before any authentication attempt.

## Step 2 ✓ passed (23.2s)
md5: 0d76c362ef8536ccde46ec2b6d8a22b7
On the shopper sign-in page, submit the unregistered email {{unknown_user_email}} with the password {{unknown_user_password}}.

## Step 3 ✓ passed (22s)
md5: 58ad72356040922538130d6d2aa14348
Assert a visible sign-in error message is shown for the failed authentication attempt.

## Step 4 ✓ passed (22.8s)
md5: 6a74da67cba41a0c09922f6d8c74eddb
Assert the site header still offers "Sign in" and does not show the attempted shopper email as the signed-in identity.

## Step 5 — assert ✓ passed (19s)
md5: 80d4792ea91c9e8cb677e9a7001b4296
Confirm 'the header shows the attempted email instead of "Sign in"' does NOT appear (forbidden-presence) — the stated promise: A sign-in attempt with an email that has no account does not leave the shopper recognized as signed in.
