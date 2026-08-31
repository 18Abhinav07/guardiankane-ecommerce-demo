---
assurance:
  id: t-2
  base: sha256:20db8a3c22fedbdc21d7f0ebbf8f37ebffde6c5c45209b54e570093a2fc4bf81
---
# Reject sign-in for an email with no account

> Prove authentication fails with a clear error and no signed-in session when the shopper enters an email address that has no account.

## Step 1

Open the storefront at {{start_url}} and go to the shopper sign-in page.

## Step 2

On the sign-in form, submit the unknown email {{unknown_user_email}} with the password {{unknown_user_password}}.

## Step 3

Assert the sign-in attempt is rejected with a clear on-page error message, and confirm the header does not show {{unknown_user_email}} as a signed-in identity.

## Step 4 — assert @verifies ac-3, ac-4

Confirm 'a signed-in header state for the attempted account' does NOT appear (forbidden-presence) — the stated promise: Signing in with an email that has no account does not establish a signed-in session.
