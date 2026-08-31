---
test: ../reject-invalid-card-details-at-checkout-without-confirmation_test.md
status: failed
started: 2026-08-30T08:54:52.600Z
duration_s: 47
session_id: d9e89796-7714-4121-99a3-0ef5f93efa3a
---

# Reject invalid card details at checkout without confirmation — Result

## Step 1 ✓ passed (0.12s)
md5: f4f1597aae00fd563c62b3b6038ddafa
Open {{store_base_url}} in a browser.

## Step 2 ✓ passed (2.48s)
md5: 0e7964093a06460650d6fab398410fcd
On the store site, sign in as the returning shopper {{returning_shopper_email}} with password {{returning_shopper_password}}.

## Step 3 ✗ failed (42.9s)
md5: 0e45c65b2fb34511319a53afaeb872b5
Reason: Final verification failed: "the cart contains exactly the purchasable products {{global.product_a}} and {{global.product_b}}" — bug verdict: Cart opened before required products were added [automation_bug/agent_misstep, confidence 0.97]
On the storefront, ensure the cart contains exactly the purchasable products {{product_a}} and {{product_b}}, then open the cart page.

## Step 4 ⏭ skipped

## Step 5 ⏭ skipped

## Step 6 ⏭ skipped

## Step 7 ⏭ skipped

## Step 8 ⏭ skipped

## Step 9 — assert ⏭ skipped
