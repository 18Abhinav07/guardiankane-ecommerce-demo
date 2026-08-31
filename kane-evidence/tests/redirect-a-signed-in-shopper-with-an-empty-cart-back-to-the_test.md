---
assurance:
  id: t-14
  base: sha256:1e96ee971ffdf364e0ddfcd1ddb1b38422dbce9e441085613c9835c380f6323b
---
# Redirect a signed-in shopper with an empty cart back to the cart

> Prove that a signed-in shopper with an empty cart attempting checkout lands on the cart page and is not shown an empty checkout page.

## Step 1

Open {{store_base_url}} in a browser.

## Step 2

On the store site, sign in as the returning shopper {{returning_shopper_email}} with password {{returning_shopper_password}}.

## Step 3

Open the cart page and remove any existing items until the cart shows its empty state.

## Step 4

capture baseline: checkout requested by a signed-in shopper whose cart is empty

## Step 5

From the empty cart page, invoke checkout.

## Step 6

Assert the browser has landed on the cart page.

## Step 7

Assert an empty checkout page is not shown after the checkout attempt.

## Step 8 — assert @verifies ac-31, ac-32

Confirm state-transition check: cart page (equals) — the stated promise: A checkout attempt by a signed-in shopper whose cart is empty lands on the cart page.
