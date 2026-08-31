---
assurance:
  id: t-2
  base: sha256:ca7af217bd9c610c017608f700d56b35194ed46f99451cffb627eaabc0352d94
---
# Increment quantity instead of creating a duplicate cart line on repeated add

> Prove a second add for the same product increments quantity by 1 instead of creating a duplicate cart line item, and the header badge still matches the total items in the cart.

## Step 1

On {{start_url}}, open the Trailhead Goods product grid in a fresh browser session, choose any visible product card, add that product to the cart once, then open the cart page and note that product's current quantity and that it appears on a single cart line.

## Step 2

capture baseline: baseline_product_qty = the current quantity of the repeated product in the cart before the second add

## Step 3

Return to the same product's card on the product grid and add that same product to the cart one more time.

## Step 4

Open the cart page again and inspect the chosen product line and the header cart-count badge, confirming the chosen product now has a higher quantity and still appears on only one cart line while the badge reflects the visible total item count.

## Step 5 — assert @verifies ac-2, ac-3, ac-5

Confirm delta check: 1 (changed-by) — the stated promise: Adding the same product again increases that product's cart quantity by exactly 1.
