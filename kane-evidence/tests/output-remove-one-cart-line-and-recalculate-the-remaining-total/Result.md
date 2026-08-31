---
test: ../remove-one-cart-line-and-recalculate-the-remaining-total_test.md
status: passed
started: 2026-08-29T18:47:42.773Z
duration_s: 143
session_id: 472fe6f6-c7f4-4b87-9bd4-81c8804ca717
---

# Remove one cart line and recalculate the remaining total — Result

## Step 1 ✓ passed (2.16s)
md5: 0b7ad49d95ace03391c49137531625d3
On {{start_url}}, open Trailhead Goods in a fresh browser session, choose two different visible product cards on the product grid, add each product to the cart once, then open the cart page and confirm both products appear as separate visible cart lines.

## Step 2 ✓ passed (0.1s)
md5: 26f2dac45a2e2340d85de44b0848c95d
On the cart page, choose one of the two visible cart lines as the removal target and note that cart line's item name together with the visible remaining line-item subtotals and the current cart-wide total.

## Step 3 ✓ passed (0.58s)
md5: a060d9249298f5017c3d94bdeafe160b
Remove the chosen cart line from the cart page.

## Step 4 ✓ passed (50.7s)
md5: 5c46de6456240456b646c09d25185785
After the cart updates, inspect the cart page and confirm the removed product no longer appears, at least one other cart line still appears, each remaining cart line still shows item name, unit price, quantity, and line-item subtotal, and the cart-wide total matches the sum of the displayed remaining line-item subtotals.

## Step 5 ✓ passed (27.2s)
md5: 5851d81eb184adf5878453f6951ede26
Confirm absolute check: cart-wide total equals the sum of the displayed remaining line-item subtotals (equals) — the stated promise: After a shopper removes an item, the cart-wide total equals the sum of the displayed remaining line-item subtotals.

## Step 6 — assert ✓ passed (28.3s)
md5: 5851d81eb184adf5878453f6951ede26
Confirm absolute check: cart-wide total equals the sum of the displayed remaining line-item subtotals (equals) — the stated promise: After a shopper removes an item, the cart-wide total equals the sum of the displayed remaining line-item subtotals.
