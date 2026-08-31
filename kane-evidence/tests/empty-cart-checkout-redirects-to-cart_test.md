---
assurance:
  id: t-7
  base: sha256:75b834d4601f5969160e8da88e2d3c80d8b4063212e6c542a51492367b527011
---
# Return a signed-in shopper with an empty cart to the cart instead of checkout

> Prove that a signed-in shopper with no cart items is sent back to the cart instead of seeing checkout.

## Step 1

Open {{storefront_url}} in a new browser session.

## Step 2

On the Trailhead Goods storefront, sign up for a new shopper account with {{new_user_email}} / {{new_user_password}}.

## Step 3

Open the cart page and remove each visible cart line item until the cart is empty.

## Step 4

Assert the cart shows a clear "your cart is empty" state.

## Step 5

From the empty-cart state, attempt to open the checkout page.

## Step 6

Assert the cart page is shown.

## Step 7

Assert the checkout page is not shown.

## Step 8 — assert @verifies ac-14, ac-15

Confirm presence check: cart page is shown (exists) — the stated promise: A signed-in shopper with an empty cart who attempts to reach checkout is shown the cart.
