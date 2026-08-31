---
assurance:
  id: t-5
  base: sha256:215fa3c43a14f4df9d61143ba003a941a2906a24c800c2d3eacdd0ac2a26577b
---
# Block an unauthenticated shopper from opening checkout

> Prove that checkout access is blocked for an unauthenticated shopper and the shopper is sent to sign in instead of seeing checkout.

## Step 1

Open {{storefront_url}} in a new browser session with no signed-in shopper session.

## Step 2

From the Trailhead Goods storefront, attempt to open the checkout page.

## Step 3

Assert the sign-in page is shown.

## Step 4

Assert the checkout page is not shown.

## Step 5 — assert @verifies ac-9, ac-10

Confirm presence check: sign-in page is shown (exists) — the stated promise: An unauthenticated shopper who attempts to reach checkout is shown sign-in.
