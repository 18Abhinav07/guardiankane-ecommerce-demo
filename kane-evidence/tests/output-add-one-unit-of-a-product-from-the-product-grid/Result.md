---
test: ../add-one-unit-of-a-product-from-the-product-grid_test.md
status: passed
started: 2026-08-29T18:08:44.047Z
duration_s: 440
session_id: fedd69e9-61ac-4272-a7f8-c9acb7650ac5
---

# Add one unit of a product from the product grid — Result

## Step 1 ✓ passed (191.4s)
md5: 132b789c25dd642885561713db5279d9
On {{start_url}}, open the Trailhead Goods product grid in a fresh browser session, choose a visible product card for a product that is not already present in the cart, then open the cart page and confirm that product is absent from the current cart contents.

## Step 2 ✓ passed (33.9s)
md5: 20c7c305432f31823083fbd62e32a4c4
capture baseline: baseline_product_qty = 0 (Step 1 already confirmed the chosen product is absent from the cart, so its quantity before the add is 0). Also capture baseline_badge_count = the header cart-count badge's current numeric item-count value (0 if the badge is hidden/absent).

## Step 3 ✓ passed (16.7s)
md5: 2d4735a090ee721c34b78c5954607c8e
Return to the same product's card on the product grid and add that chosen product to the cart once.

## Step 4 ✓ passed (36.1s)
md5: d0e855e0a55bd670b55a9ab62b06641c
Open the cart page and inspect the chosen product line and the header cart-count badge. Confirm the chosen product's line quantity now equals baseline_product_qty + 1 (that is, exactly 1). Confirm the header badge's item-count number (not a price or currency amount) now equals baseline_badge_count + 1.

## Step 5 — assert ✓ passed (159.4s)
md5: bafd0d7b2c750a3876ced4a67d34fa99
Confirm delta check: 1 (changed-by), computed against baseline_product_qty and baseline_badge_count captured in Step 2 — the stated promise: Clicking "Add to cart" on a product card increases that product's cart quantity by exactly 1, and increases the header badge's item-count by exactly 1.
