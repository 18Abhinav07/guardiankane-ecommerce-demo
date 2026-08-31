---
test: ../show-signed-in-identity-after-creating-a-new-shopper-account_test.md
status: passed
started: 2026-08-29T21:38:16.139Z
duration_s: 80
session_id: 4defb9af-ea56-48c2-b4f9-a5f0cc3c61e1
---

# Show signed-in identity after creating a new shopper account — Result

## Step 1 ✓ passed (1.83s)
md5: ade9f3b17ee05319a019f88fc75f8aeb
Open {{start_url}}; from the storefront home page, open the shopper account creation page and confirm the site header currently offers "Sign in".

## Step 2 ✓ passed (0.12s)
md5: f7c0e405b7c323bffe3b0233574e4615
Capture baseline: the site header shows "Sign in" before the new account is created.

## Step 3 ✓ passed (26.1s)
md5: ed926938870c5d7de326dbcd52de102b
On the shopper sign-up page, register a new shopper account with the unused email {{new_user_email}} and the password {{new_user_password}}.

## Step 4 ✓ passed (26.4s)
md5: 79c288ad0913737df3a053819d01d822
Assert the site header shows {{new_user_email}} instead of "Sign in", indicating the shopper is recognized as signed in for checkout.

## Step 5 — assert ✓ passed (23.2s)
md5: fecc5e161b48683b4ae30e3b0efb543f
Confirm state-transition check: header shows the shopper's email (equals) — the stated promise: A new shopper who signs up with an email and password becomes recognized as signed in for checkout.
