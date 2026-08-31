---
assurance:
  id: t-4
  base: sha256:db432a1a3aed76ca62c5125f862300270205673f216ebcf0a266c832454b50bb
---
# Recalculate the cart in place after changing an item's quantity

> Prove a shopper can change a cart line quantity and the changed line subtotal and cart-wide total recalculate without a full page reload.

## Step 1

On {{start_url}}, open Trailhead Goods in a fresh browser session, choose any visible product card on the product grid, add that product to the cart once, then open the cart page and confirm the cart shows that product as a visible cart line with quantity 1.

## Step 2

On the cart page, note the chosen cart line's item name, visible unit price, visible quantity, visible line-item subtotal, the cart-wide total, and the current cart page URL before making any edit.

## Step 3

In the chosen cart line on the cart page, change the displayed quantity from 1 to 2.

## Step 4

After the cart updates, inspect the changed cart line, every visible line-item subtotal, the cart-wide total, and the browser's observable navigation state for this page update, and confirm the changed line now shows quantity 2, its line-item subtotal matches its displayed unit price multiplied by 2, the cart-wide total matches the sum of the displayed line-item subtotals, and the page stayed on the same cart view without a full page reload.

## Step 5

Confirm absolute check: cart-wide total equals the sum of the displayed line-item subtotals (equals) — the stated promise: After a shopper changes an item's quantity, the cart-wide total equals the sum of the displayed line-item subtotals.

## Step 6 — assert @verifies ac-6, ac-7, ac-9, ac-10, ac-12, ac-13, ac-14, ac-15, ac-18

Confirm absolute check: cart-wide total equals the sum of the displayed line-item subtotals (equals) — the stated promise: After a shopper changes an item's quantity, the cart-wide total equals the sum of the displayed line-item subtotals.
