---
assurance:
  id: t-11
  base: sha256:b18b6f2b0087777dbccceaae76f5cb5979f7ca13ab278534858cb24b7ca4bafc
---
# Keep the shopper signed out after a no-account sign-in attempt

> Prove that an unknown-email attempt fails visibly and does not authenticate the shopper.

## Step 1

Open {{start_url}}; from the storefront home page, open the shopper sign-in page and confirm the site header offers "Sign in" before any authentication attempt.

## Step 2

On the shopper sign-in page, submit the unregistered email {{unknown_user_email}} with the password {{unknown_user_password}}.

## Step 3

Assert a visible sign-in error message is shown for the failed authentication attempt.

## Step 4

Assert the site header still offers "Sign in" and does not show the attempted shopper email as the signed-in identity.

## Step 5 — assert @verifies ac-24, ac-25

Confirm 'the header shows the attempted email instead of "Sign in"' does NOT appear (forbidden-presence) — the stated promise: A sign-in attempt with an email that has no account does not leave the shopper recognized as signed in.
