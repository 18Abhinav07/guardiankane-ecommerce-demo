---
assurance:
  id: t-8
  base: sha256:264045365d535a34fff5f206a758dc11837e8b20bb98c60d6c003c9447484070
---
# Keep the shopper signed out after a wrong-password sign-in attempt

> Prove that a wrong-password attempt fails visibly and does not authenticate the shopper.

## Step 1

Open {{start_url}}; from the storefront home page, open the shopper sign-in page and confirm the site header offers "Sign in" before any authentication attempt.

## Step 2

On the shopper sign-in page, submit the existing shopper email {{existing_user_email}} with the incorrect password {{wrong_password_for_existing_user}}.

## Step 3

Assert a visible sign-in error message is shown for the failed authentication attempt.

## Step 4

Assert the site header still offers "Sign in" and does not show the attempted shopper email as the signed-in identity.

## Step 5 — assert @verifies ac-22, ac-23

Confirm 'the header shows the attempted email instead of "Sign in"' does NOT appear (forbidden-presence) — the stated promise: A sign-in attempt with a correct email and wrong password does not leave the shopper recognized as signed in.
