---
test: ../empty-cart-checkout-redirects-to-cart_test.md
status: passed
started: 2026-08-30T07:38:58.496Z
duration_s: 158
session_id: d7572087-6a91-4988-bd1c-dcdcf2546a43
---

# Return a signed-in shopper with an empty cart to the cart instead of checkout — Result

## Step 1 ✓ passed (24.6s)
md5: 61833154e46081ce65fe9697869bfd37
Open {{storefront_url}} in a new browser session.

## Step 2 ✓ passed (32.6s)
md5: 44ffbc8162cc337124695fd7e8afacf5
On the Trailhead Goods storefront, sign up for a new shopper account with {{new_user_email}} / {{new_user_password}}.

## Step 3 ✓ passed (14.1s)
md5: 1ff81d1d2ddeb7ea6dcdcb013ce71d0a
Open the cart page and remove each visible cart line item until the cart is empty.

## Step 4 ✓ passed (17.2s)
md5: 603061038ac5e7547a92ec0fc568ab6f
Assert the cart shows a clear "your cart is empty" state.

## Step 5 ✓ passed (18.6s)
md5: 261da2bdcdcf1a4b38856c87166aa554
From the empty-cart state, attempt to open the checkout page.

## Step 6 ✓ passed (12.5s)
md5: 64c2f18855d32a73242119ac82302bb3
Assert the cart page is shown.

## Step 7 ✓ passed (17.5s)
md5: 1bc0a2040591808fb034707a09217645
Assert the checkout page is not shown.

## Step 8 — assert ✓ passed (18.5s)
md5: b18f81ee1069eed18b9cb2d80c65e976
Confirm presence check: cart page is shown (exists) — the stated promise: A signed-in shopper with an empty cart who attempts to reach checkout is shown the cart.
