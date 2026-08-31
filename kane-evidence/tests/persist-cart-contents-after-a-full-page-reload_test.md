---
assurance:
  id: t-1
  base: sha256:88f8b0c5b6f9c315abfa0f7829a96ca4c83cc4d6e397102920162436577c4b38
---
# Persist cart contents after a full page reload

> Prove cart contents survive a full page reload via the server-side session and the header badge still matches the cart total after reload.

## Step 1

On {{start_url}}, open the Trailhead Goods product grid in a fresh browser session, choose any visible product card, add that product to the cart once, then open the cart page.

## Step 2

capture baseline: baseline_cart_contents = the full cart contents shown on the cart page, including each line item's product identity and quantity, immediately before the full page reload

## Step 3

From the same browser session on the cart page, perform a full page reload.

## Step 4

After the reload completes, inspect the cart page and the header cart-count badge, and confirm the cart still shows the same products and quantities while the badge reflects the visible total item count.

## Step 5 — assert @verifies ac-1, ac-5

Confirm state-transition check: the same cart contents after the full page reload (equals) — the stated promise: The cart contents remain unchanged across a full page reload using a server-side session.
