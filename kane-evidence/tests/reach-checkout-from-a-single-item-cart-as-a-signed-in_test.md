---
assurance:
  id: t-15
  base: sha256:9a18df4674b3be1e3e7f937a6ad3fa2c00c22d7dc98d76e2d2b9e294e5b7a985
---
# Reach checkout from a single-item cart as a signed-in shopper

> Prove that the minimum non-empty cart still allows a signed-in shopper to reach checkout.

## Step 1

Open {{store_base_url}} in a browser.

## Step 2

On the store site, sign in as the returning shopper {{returning_shopper_email}} with password {{returning_shopper_password}}.

## Step 3

On the storefront, ensure the cart contains exactly one purchasable product {{single_item_product}}, then open the cart page.

## Step 4

Store the single cart line item's product name, quantity, and line total as baseline_single_item_cart_item, and store the cart grand total as baseline_single_item_cart_total.

## Step 5

capture baseline: checkout requested by a signed-in shopper with at least one cart item

## Step 6

From the cart page, invoke checkout.

## Step 7

Assert the browser has landed on the checkout page.

## Step 8

In the checkout page's order summary section, assert the single displayed line item matches baseline_single_item_cart_item.

## Step 9

In the checkout page's order summary section, assert the displayed order total equals baseline_single_item_cart_total.

## Step 10 — assert @verifies ac-30, ac-29, ac-28

Confirm absolute check: cart total captured immediately before checkout was invoked (equals) — the stated promise: When the checkout page is shown, the order summary total equals the cart total captured immediately before checkout was invoked.
