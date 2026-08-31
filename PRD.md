# Trailhead Goods — PRD

Trailhead Goods is a small e-commerce storefront selling outdoor gear. This PRD
covers the core shopping flow: browsing products, managing a cart, signing in,
checking out, and confirming a paid order.

## UC-1: Add to Cart

As a shopper browsing the product grid, I want to add a product to my cart so
that I can purchase it later.

Acceptance criteria:
- AC-1.1: Clicking "Add to cart" on a product card adds one unit of that
  product to the cart.
- AC-1.2: The header cart-count badge updates immediately to reflect the total
  number of items in the cart.
- AC-1.3: Adding the same product a second time increments its quantity in
  the cart rather than creating a duplicate line item.
- AC-1.4: The cart persists across a full page reload (server-side session).

## UC-2: View & Edit Cart

As a shopper, I want to view my cart and adjust quantities or remove items so
that I can control what I'm about to buy.

Acceptance criteria:
- AC-2.1: The cart page lists every item currently in the cart with name,
  unit price, quantity, and line-item subtotal.
- AC-2.2: Changing an item's quantity updates that line's subtotal and the
  cart-wide total without a full page reload.
- AC-2.3: Removing an item deletes it from the cart and updates the total.
- AC-2.4: An empty cart shows a clear "your cart is empty" state instead of a
  blank page.

## UC-3: Sign Up / Sign In

As a shopper, I want to create an account or sign in so that checkout can be
tied to my identity.

Acceptance criteria:
- AC-3.1: A new user can sign up with an email and password.
- AC-3.2: A returning user can sign in with the same credentials and is
  recognized as signed-in (e.g. header shows their email instead of "Sign
  in").
- AC-3.3: Signing in with a correct email but wrong password is rejected with
  a clear error message, and the user is not signed in.
- AC-3.4: Signing in with an email that has no account is rejected with a
  clear error message, and the user is not signed in.

## UC-4: Checkout

As a signed-in shopper with items in my cart, I want to proceed to checkout so
that I can provide shipping details and review my order before paying.

Acceptance criteria:
- AC-4.1: A signed-in user with a non-empty cart can reach the checkout page
  and see an order summary matching their cart contents and total.
- AC-4.2: An unauthenticated user attempting to reach checkout is redirected
  to sign in instead of seeing the checkout page (negative path).
- AC-4.3: A signed-in user with an empty cart attempting to reach checkout is
  redirected back to the cart instead of seeing an empty checkout page
  (negative path).

## UC-5: Payment & Order Confirmation

As a shopper at checkout, I want to submit payment so that my order is placed
and I receive confirmation.

Acceptance criteria:
- AC-5.1: Submitting valid payment details on the checkout page places the
  order and shows an order confirmation page with an order ID and the items
  purchased.
- AC-5.2: After a successful order, the cart is emptied.
- AC-5.3: Submitting the payment form with missing/invalid card details is
  rejected with a clear error message, and no order is created.
