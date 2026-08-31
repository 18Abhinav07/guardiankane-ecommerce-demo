---
test: ../persist-cart-contents-after-a-full-page-reload_test.md
status: passed
started: 2026-08-29T16:41:44.892Z
duration_s: 201
session_id: 0e5b2be8-7220-4261-9555-87db9fbced1a
---

# Persist cart contents after a full page reload — Result

## Step 1 ✓ passed (22.3s)
md5: e452e10752e108f690eabf2ba623c482
On {{start_url}}, open the Trailhead Goods product grid in a fresh browser session, choose any visible product card, add that product to the cart once, then open the cart page.

## Step 2 ✓ passed (33.3s)
md5: ba2a32a1ae26b71e11b889bc8d948910
capture baseline: baseline_cart_contents = the full cart contents shown on the cart page, including each line item's product identity and quantity, immediately before the full page reload

## Step 3 ✓ passed (14.2s)
md5: 2502cf12a7d73b0a7e684f35b928062d
From the same browser session on the cart page, perform a full page reload.

## Step 4 ✓ passed (75s)
md5: af6f6739e8e5269f6353c275ac988f78
After the reload completes, inspect the cart page and the header cart-count badge, and confirm the cart still shows the same products and quantities while the badge reflects the visible total item count.

## Step 5 — assert ✓ passed (53.1s)
md5: 10d63c96ccfbfc089b42cbd7ea96fe20
Confirm state-transition check: the same cart contents after the full page reload (equals) — the stated promise: The cart contents remain unchanged across a full page reload using a server-side session.
