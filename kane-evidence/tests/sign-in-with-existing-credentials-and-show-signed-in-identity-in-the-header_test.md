---
assurance:
  id: t-3
  base: sha256:eb8ecc656dc905219edd49fbc97341c10f1c3ab2450da96d1b683695b9aa3abb
---
# Sign in with existing credentials and show signed-in identity in the header

> Prove a returning shopper can sign in with the same credentials and is recognized as signed in by the header showing their email instead of "Sign in".

## Step 1

Open the storefront at {{start_url}} and go to the shopper sign-in page.

## Step 2

On the sign-in form, submit the existing account email {{existing_user_email}} with its correct password {{existing_user_password}}.

## Step 3

Assert the shopper is signed in and the header shows {{existing_user_email}} instead of "Sign in".

## Step 4 — assert @verifies ac-5, ac-6, ac-7

Confirm presence check: the header shows the signed-in shopper's email address (exists) — the stated promise: After a successful sign-in, the header shows the signed-in shopper's email address.
