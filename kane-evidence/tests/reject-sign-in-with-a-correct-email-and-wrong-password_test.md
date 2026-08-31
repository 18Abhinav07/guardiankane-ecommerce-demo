---
assurance:
  id: t-1
  base: sha256:d171c94602bdc85561c3d50f707664549b6f0ae81e4ae22f92bcfaeec6ef6bfc
---
# Reject sign-in with a correct email and wrong password

> Prove authentication fails with a clear error and no signed-in session when the email exists but the password is wrong.

## Step 1

Open the storefront at {{start_url}} and go to the shopper sign-in page.

## Step 2

On the sign-in form, submit the existing account email {{existing_user_email}} with the wrong password {{wrong_password}}.

## Step 3

Assert the sign-in attempt is rejected with a clear on-page error message, and confirm the header does not show {{existing_user_email}} as a signed-in identity.

## Step 4 — assert @verifies ac-1, ac-2

Confirm 'a signed-in header state for the attempted account' does NOT appear (forbidden-presence) — the stated promise: Signing in with a correct email and a wrong password does not establish a signed-in session.
