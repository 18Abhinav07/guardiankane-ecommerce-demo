---
assurance:
  id: t-13
  base: sha256:e345e50218fe194e3d58dcc43258e674e715c6106e6c62c6af5fdbc8c6c1fae3
---
# Redirect an unauthenticated checkout attempt to sign in

> Prove that an unauthenticated shopper attempting checkout from a non-empty cart lands on sign in and never exposes the checkout page.

## Step 1

Open {{store_base_url}} in a browser.

## Step 2

If the site already shows a signed-in shopper session, sign out so the browser is anonymous.

## Step 3

On the storefront, ensure the cart contains at least one purchasable product {{anonymous_checkout_product}}, then open the cart page.

## Step 4

capture baseline: checkout requested without an authenticated shopper session

## Step 5

From the cart page, invoke checkout.

## Step 6

Assert the browser has landed on the sign-in page.

## Step 7

Assert the checkout page is not shown after the checkout attempt.

## Step 8 — assert @verifies ac-26, ac-27

Confirm state-transition check: sign-in page (equals) — the stated promise: A checkout attempt without an authenticated shopper session lands on the sign-in page.
