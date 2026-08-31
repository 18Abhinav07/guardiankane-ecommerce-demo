---
test: ../block-unauthenticated-checkout-attempt_test.md
status: passed
started: 2026-08-30T07:38:58.701Z
duration_s: 123
session_id: f6ca99ee-9ca6-47a7-8343-a96cd24a42e9
---

# Block an unauthenticated shopper from opening checkout — Result

## Step 1 ✓ passed (32.8s)
md5: 23c1c357ece40eef1677362ebd579388
Open {{storefront_url}} in a new browser session with no signed-in shopper session.

## Step 2 ✓ passed (38.2s)
md5: c1d5c49e2b4a8bf10c2856af624ce370
From the Trailhead Goods storefront, attempt to open the checkout page.

## Step 3 ✓ passed (13.3s)
md5: e2e8b5b548c6c1aea1607944a9b8ff18
Assert the sign-in page is shown.

## Step 4 ✓ passed (19.4s)
md5: 1bc0a2040591808fb034707a09217645
Assert the checkout page is not shown.

## Step 5 — assert ✓ passed (16.8s)
md5: 0e862a142a258eecb7e3e7fdf1c0c46b
Confirm presence check: sign-in page is shown (exists) — the stated promise: An unauthenticated shopper who attempts to reach checkout is shown sign-in.
