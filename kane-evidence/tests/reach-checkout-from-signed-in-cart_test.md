---
assurance:
  id: t-6
  base: sha256:1277df32c59e69880302349a935bd85fc751e6da9bd3c75392d9078e058f6978
---
# Reach checkout from a signed-in cart and preserve the cart summary

> Prove that a signed-in shopper with at least one cart item can open checkout and see an order summary that matches the cart contents and total.

## Step 1

Open {{storefront_url}} in a new browser session.

## Step 2

On the Trailhead Goods storefront, sign up for a new shopper account with {{checkout_summary_new_user_email}} / {{checkout_summary_new_user_password}}.

## Step 3

On the product grid, add one visible product card to the cart.

## Step 4

Open the cart page and store the visible cart line items as baseline_cart_items and the cart-wide total as baseline_cart_total.

## Step 5

From the cart page, proceed to checkout.

## Step 6

Assert the checkout page is shown.

## Step 7

Assert every item stored in baseline_cart_items is present in the checkout order summary.

## Step 8

Assert the checkout order total equals baseline_cart_total.

## Step 9 — assert @verifies ac-11, ac-12, ac-13

Confirm propagation check: cart total value shown before navigation (equals) — the stated promise: When a signed-in shopper reaches checkout from a non-empty cart, the displayed order total equals the cart total shown before navigation.
