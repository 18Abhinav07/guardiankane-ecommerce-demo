---
test: ../recalculate-the-cart-in-place-after-changing-an-item-s_test.md
status: passed
started: 2026-08-29T18:47:44.375Z
duration_s: 492
session_id: d3844fe8-9fd1-42c3-a3c1-1f22062bfe00
---

# Recalculate the cart in place after changing an item's quantity — Result

## Step 1 ✓ passed (53.1s)
md5: 423c85317d0d304361d035e390e73017
On {{start_url}}, open Trailhead Goods in a fresh browser session, choose any visible product card on the product grid, add that product to the cart once, then open the cart page and confirm the cart shows that product as a visible cart line with quantity 1.

## Step 2 ✓ passed (165s)
md5: 1b71fe24565b8f0b51181719c8eeaab5
On the cart page, note the chosen cart line's item name, visible unit price, visible quantity, visible line-item subtotal, the cart-wide total, and the current cart page URL before making any edit.

## Step 3 ✓ passed (17s)
md5: ce1b4b3e1cc0e01bffe3d26952c8f0bb
In the chosen cart line on the cart page, change the displayed quantity from 1 to 2.

## Step 4 ✓ passed (147.7s)
md5: a60df71065988f6d2163433656cecef6
After the cart updates, inspect the changed cart line, every visible line-item subtotal, the cart-wide total, and the browser's observable navigation state for this page update, and confirm the changed line now shows quantity 2, its line-item subtotal matches its displayed unit price multiplied by 2, the cart-wide total matches the sum of the displayed line-item subtotals, and the page stayed on the same cart view without a full page reload.

## Step 5 ✓ passed (63.8s)
md5: 493ef2c9abc8d69183520b7ebc2f5364
Confirm absolute check: cart-wide total equals the sum of the displayed line-item subtotals (equals) — the stated promise: After a shopper changes an item's quantity, the cart-wide total equals the sum of the displayed line-item subtotals.

## Step 6 — assert ✓ passed (20.3s)
md5: 493ef2c9abc8d69183520b7ebc2f5364
Confirm absolute check: cart-wide total equals the sum of the displayed line-item subtotals (equals) — the stated promise: After a shopper changes an item's quantity, the cart-wide total equals the sum of the displayed line-item subtotals.
