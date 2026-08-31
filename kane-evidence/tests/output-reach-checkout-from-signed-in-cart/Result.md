---
test: ../reach-checkout-from-signed-in-cart_test.md
status: passed
started: 2026-08-30T07:38:59.016Z
duration_s: 308
session_id: 95717e0e-eef7-41fd-8208-d0487ebdd493
---

# Reach checkout from a signed-in cart and preserve the cart summary — Result

## Step 1 ✓ passed (33s)
md5: 61833154e46081ce65fe9697869bfd37
Open {{storefront_url}} in a new browser session.

## Step 2 ✓ passed (32.7s)
md5: 532ff0a925e514f842925b84940f9dda
On the Trailhead Goods storefront, sign up for a new shopper account with {{checkout_summary_new_user_email}} / {{checkout_summary_new_user_password}}.

## Step 3 ✓ passed (15.9s)
md5: 9017a2eddc0cdd4d4e43b861d8348b6c
On the product grid, add one visible product card to the cart.

## Step 4 ✓ passed (43.6s)
md5: 134d1d69fdcf71e604711d798d029071
Open the cart page and store the visible cart line items as baseline_cart_items and the cart-wide total as baseline_cart_total.

## Step 5 ✓ passed (14s)
md5: 91a97fe26564d61fb7d7c68fc55dd859
From the cart page, proceed to checkout.

## Step 6 ✓ passed (13s)
md5: 13d0da31a85aa843275ebb8944a7856c
Assert the checkout page is shown.

## Step 7 ✓ passed (20.5s)
md5: e9c1602faa3fa564352c0817878b1a97
Assert every item stored in baseline_cart_items is present in the checkout order summary.

## Step 8 ✓ passed (30s)
md5: 555c2eefaca5ecdd629a629bc73a6567
Assert the checkout order total equals baseline_cart_total.

## Step 9 — assert ✓ passed (103.9s)
md5: 6d55de3426312304175b76c682370687
Confirm propagation check: cart total value shown before navigation (equals) — the stated promise: When a signed-in shopper reaches checkout from a non-empty cart, the displayed order total equals the cart total shown before navigation.
