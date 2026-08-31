---
assurance:
  id: t-16
  base: sha256:279a306471332297370f41af42e01e5e3647e1d130c5f2b9853786f89249944a
---
# Place a paid order and reach order confirmation

> Prove that a shopper already at checkout can submit valid payment details, place the order, land on an order confirmation page, see an order ID and the purchased items, and have the cart cleared.

## Step 1

Open {{store_base_url}} in a browser.

## Step 2

On the store site, sign in as the returning shopper {{returning_shopper_email}} with password {{returning_shopper_password}}.

## Step 3

On the storefront, ensure the cart contains exactly the purchasable products {{product_a}} and {{product_b}}, then open the cart page.

## Step 4

Store each cart line item's product name, quantity, and line total as baseline_cart_items, and store the cart item count as baseline_cart_count.

## Step 5

From the cart page, invoke checkout.

## Step 6

On the checkout page, assert the order summary shows the same items as baseline_cart_items.

## Step 7

capture baseline: checkout page with the current order pending payment submission

## Step 8

In the payment section of checkout, submit the order using {{valid_card_details}}.

## Step 9

Assert the browser has landed on the order confirmation page for the submitted order.

## Step 10

On the order confirmation page, assert an order ID is shown.

## Step 11

On the order confirmation page, assert the purchased items match baseline_cart_items.

## Step 12

From the order confirmation page, open the cart and assert it contains 0 items.

## Step 13 — assert @verifies ac-33, ac-36, ac-37, ac-38

Confirm state-transition check: order confirmation page for the submitted order (equals) — the stated promise: Submitting valid payment details on the checkout page transitions the shopper from checkout to an order confirmation state for the submitted order.
