---
assurance:
  id: t-12
  base: sha256:38fd3319defe63ca29544ae2a8a0ec2b623c402c89a502f0263e9f64753b60d7
---
# Reach checkout from a populated cart as a signed-in shopper

> Prove that a signed-in shopper with a non-empty cart reaches checkout and sees an order summary whose line items and total match the cart immediately before checkout.

## Step 1

Open {{store_base_url}} in a browser.

## Step 2

On the store site, sign in as the returning shopper {{returning_shopper_email}} with password {{returning_shopper_password}}.

## Step 3

On the storefront, ensure the cart contains exactly the purchasable products {{product_a}} and {{product_b}}, then open the cart page.

## Step 4

Store each cart line item's product name, quantity, and line total as baseline_cart_items, and store the cart grand total as baseline_cart_total.

## Step 5

capture baseline: checkout requested by a signed-in shopper with at least one cart item

## Step 6

From the cart page, invoke checkout.

## Step 7

Assert the browser has landed on the checkout page.

## Step 8

In the checkout page's order summary section, assert every displayed line item matches baseline_cart_items.

## Step 9

In the checkout page's order summary section, assert the displayed order total equals baseline_cart_total.

## Step 10 — assert @verifies ac-30, ac-29, ac-28

Confirm state-transition check: checkout page (equals) — the stated promise: A checkout attempt by a signed-in shopper with a non-empty cart lands on the checkout page.
