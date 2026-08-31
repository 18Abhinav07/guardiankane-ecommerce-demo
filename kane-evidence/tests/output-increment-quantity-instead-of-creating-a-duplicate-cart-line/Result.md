---
test: ../increment-quantity-instead-of-creating-a-duplicate-cart-line_test.md
status: passed
started: 2026-08-29T16:48:08.017Z
duration_s: 53
session_id: aaebd910-8b76-459e-9bc7-3edd863e20e2
---

# Increment quantity instead of creating a duplicate cart line on repeated add — Result

## Step 1 ✓ passed (1.57s)
md5: b62afbe5b1c8f65c59a2c5470fa85ba7
On {{start_url}}, open the Trailhead Goods product grid in a fresh browser session, choose any visible product card, add that product to the cart once, then open the cart page and note that product's current quantity and that it appears on a single cart line.

## Step 2 ✓ passed (0.04s)
md5: 8c67497c25dd3d1bb98b9bf335d3bd34
capture baseline: baseline_product_qty = the current quantity of the repeated product in the cart before the second add

## Step 3 ✓ passed (3.13s)
md5: 679ef8945d8eb8bd49345e30ccf6842d
Return to the same product's card on the product grid and add that same product to the cart one more time.

## Step 4 ✓ passed (0.81s)
md5: 9c2ef8415d5ef34dedfebf8f96e0a1c9
Open the cart page again and inspect the chosen product line and the header cart-count badge, confirming the chosen product now has a higher quantity and still appears on only one cart line while the badge reflects the visible total item count.

## Step 5 — assert ✓ passed (45.5s)
md5: ae62147767c5817f1e917345a2558445
Confirm delta check: 1 (changed-by) — the stated promise: Adding the same product again increases that product's cart quantity by exactly 1.
