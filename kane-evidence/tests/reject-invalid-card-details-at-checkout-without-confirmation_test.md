---
assurance:
  id: t-17
  base: sha256:78f3c41fa64933fb993da06dfc1089b7d3fe86e52205c901482f2a3ecb662944
---
# Reject invalid card details at checkout without confirmation

> Prove that a checkout submission with malformed or otherwise invalid card details is rejected with a clear error and does not create an order.

## Step 1

Open {{store_base_url}} in a browser.

## Step 2

On the store site, sign in as the returning shopper {{returning_shopper_email}} with password {{returning_shopper_password}}.

## Step 3

On the storefront, ensure the cart contains exactly the purchasable products {{product_a}} and {{product_b}}, then open the cart page.

## Step 4

From the cart page, invoke checkout.

## Step 5

On the checkout page, assert the order summary shows at least one pending item for purchase.

## Step 6

In the payment section of checkout, attempt payment using {{invalid_card_details}}.

## Step 7

After submission, assert the browser remains on the checkout page and a payment error message is shown on the page.

## Step 8

Assert no order confirmation page for the attempted payment submission is shown.

## Step 9 — assert @verifies ac-39, ac-40, ac-35

Confirm 'order confirmation page for the attempted payment submission' does NOT appear (forbidden-presence) — the stated promise: Submitting invalid card details does not show an order confirmation page for the attempted payment submission.
