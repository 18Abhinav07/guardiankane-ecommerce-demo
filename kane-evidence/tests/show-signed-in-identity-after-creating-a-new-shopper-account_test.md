---
assurance:
  id: t-9
  base: sha256:059c5b43aeebc26fbdace94070c94a7c5901ffe2c56fa666890293ff0a22834c
---
# Show signed-in identity after creating a new shopper account

> Prove that a new shopper can register with email/password and enter the authenticated checkout identity state defined for this use-case.

## Step 1

Open {{start_url}}; from the storefront home page, open the shopper account creation page and confirm the site header currently offers "Sign in".

## Step 2

Capture baseline: the site header shows "Sign in" before the new account is created.

## Step 3

On the shopper sign-up page, register a new shopper account with the unused email {{new_user_email}} and the password {{new_user_password}}.

## Step 4

Assert the site header shows {{new_user_email}} instead of "Sign in", indicating the shopper is recognized as signed in for checkout.

## Step 5 — assert @verifies ac-20

Confirm state-transition check: header shows the shopper's email (equals) — the stated promise: A new shopper who signs up with an email and password becomes recognized as signed in for checkout.
