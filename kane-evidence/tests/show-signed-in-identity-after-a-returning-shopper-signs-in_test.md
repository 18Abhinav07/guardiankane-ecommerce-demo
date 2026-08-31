---
assurance:
  id: t-10
  base: sha256:71afdf8d7c64bb439fedbfded5dd0a0d5d9cb354042612dda56410226da83690
---
# Show signed-in identity after a returning shopper signs in

> Prove that an existing shopper can authenticate with the same credentials and is visibly recognized as signed in.

## Step 1

Open {{start_url}}; from the storefront home page, open the shopper sign-in page and confirm the site header currently offers "Sign in".

## Step 2

Capture baseline: the site header shows "Sign in" before the returning shopper signs in.

## Step 3

On the shopper sign-in page, submit the existing shopper email {{existing_user_email}} with the correct password {{existing_user_password}}.

## Step 4

Assert the site header shows {{existing_user_email}} instead of "Sign in" after the sign-in succeeds.

## Step 5 — assert @verifies ac-21

Confirm state-transition check: header shows the shopper's email (equals) — the stated promise: After a returning shopper signs in with the same credentials, the header shows the shopper's email instead of "Sign in".
