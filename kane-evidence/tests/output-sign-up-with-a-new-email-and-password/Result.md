---
test: ../sign-up-with-a-new-email-and-password_test.md
status: passed
started: 2026-08-30T06:30:00.828Z
duration_s: 128
session_id: 66cf7d82-c5a1-4d59-bc99-04311346e19d
---

# Sign up with a new email and password — Result

## Step 1 ✓ passed (25.4s)
md5: eeb7f7e54874db2a4c9b12e32a4d92f6
Open the storefront at {{start_url}} and go to the shopper account sign-up page.

## Step 2 ✓ passed (21.3s)
md5: 0ffc905299691f909f8caf87aace5fc0
On the sign-up form, submit the unused email {{new_user_email}} with the password {{new_user_password}}.

## Step 3 ✓ passed (40s)
md5: 6cddc91fe2e788eb32959d331140056f
Assert the site completes account creation for {{new_user_email}} and recognizes the new shopper as signed in for checkout, with the header showing {{new_user_email}} instead of "Sign in".

## Step 4 — assert ✓ passed (40.1s)
md5: 439816d0cc4d6e8f456896fc3bac90f1
Confirm presence check: a new shopper account can be created by submitting an unused email address and a password (exists) — the stated promise: A new user can create an account by submitting an email address and a password.
