---
test: ../reject-missing-card-details-at-checkout-without-confirmation_test.md
status: passed
started: 2026-08-30T08:49:58.426Z
duration_s: 183
session_id: 74cc1ddc-8eff-45f7-99a8-c310c3c53406
---

# Reject missing card details at checkout without confirmation — Result

## Step 1 ✓ passed (0.09s)
md5: f4f1597aae00fd563c62b3b6038ddafa
Open {{store_base_url}} in a browser.

## Step 2 ✓ passed (2.46s)
md5: 0e7964093a06460650d6fab398410fcd
On the store site, sign in as the returning shopper {{returning_shopper_email}} with password {{returning_shopper_password}}.

## Step 3 ✓ passed (55.3s)
md5: 0e45c65b2fb34511319a53afaeb872b5
On the storefront, ensure the cart contains exactly the purchasable products {{product_a}} and {{product_b}}, then open the cart page.

## Step 4 ✓ passed (13.3s)
md5: 7f8697ae2ade9b3e4441a45f8e3df984
From the cart page, invoke checkout.

## Step 5 ✓ passed (19.4s)
md5: 84273a9cce880e78f10239ef0b622afd
On the checkout page, assert the order summary shows at least one pending item for purchase.

## Step 6 ✓ passed (25.1s)
md5: 39f5bd50d7ed186bb755ba101047ff2a
In the payment section of checkout, attempt payment using {{valid_card_details}} while leaving {{missing_card_field}} blank.

## Step 7 ✓ passed (22.8s)
md5: c039705ad69678aae61a8ef4a8de675c
After submission, assert the browser remains on the checkout page and a payment error message is shown on the page.

## Step 8 ✓ passed (22s)
md5: 8eb75aa504ad24cda254906029e70413
Assert no order confirmation page for the attempted payment submission is shown.

## Step 9 — assert ✓ passed (20.7s)
md5: 2d7af387dd5199373229959ab9d0c855
Confirm 'order confirmation page for the attempted payment submission' does NOT appear (forbidden-presence) — the stated promise: Submitting the payment form with a required card detail missing does not show an order confirmation page for the attempted payment submission.
