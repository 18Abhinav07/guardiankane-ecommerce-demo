---
assurance:
  id: t-4
  base: sha256:e2721e6d5370c51e3e3f7276bb61b111c4b9fa36c931a4caa5c6cccd0cf1796e
---
# Sign up with a new email and password

> Prove a shopper can create a new account by submitting an unused email address and a password.

## Step 1

Open the storefront at {{start_url}} and go to the shopper account sign-up page.

## Step 2

On the sign-up form, submit the unused email {{new_user_email}} with the password {{new_user_password}}.

## Step 3

Assert the site completes account creation for {{new_user_email}} and recognizes the new shopper as signed in for checkout, with the header showing {{new_user_email}} instead of "Sign in".

## Step 4 — assert @verifies ac-8

Confirm presence check: a new shopper account can be created by submitting an unused email address and a password (exists) — the stated promise: A new user can create an account by submitting an email address and a password.
