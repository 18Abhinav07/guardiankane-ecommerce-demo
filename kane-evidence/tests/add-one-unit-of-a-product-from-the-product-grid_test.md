---
assurance:
  id: t-3
  base: sha256:0e5b58b42b43ae4c47b3089903280b92599170ab39212aa3fe6e7628d651180b
---
# Add one unit of a product from the product grid

> Prove a shopper can add a product not already in the cart and the resulting product quantity and header badge each increase by 1.

## Step 1

On {{start_url}}, open the Trailhead Goods product grid in a fresh browser session, choose a visible product card for a product that is not already present in the cart, then open the cart page and confirm that product is absent from the current cart contents.

## Step 2

capture baseline: baseline_product_qty = the current quantity of the selected product in the cart before the add

## Step 3

Return to the same product's card on the product grid and add that chosen product to the cart once.

## Step 4

Open the cart page and inspect the chosen product line and the header cart-count badge, confirming the chosen product is now present with a higher quantity and the badge reflects the visible total item count.

## Step 5 — assert @verifies ac-4, ac-5

Confirm delta check: 1 (changed-by) — the stated promise: Clicking "Add to cart" on a product card increases that product's cart quantity by exactly 1.
