# PRD Sections — Trailhead Goods

Confirmed, approved use-cases (kane-cli `context review --approve`, record 3,
5 approved). Slugs are kane-cli's own extraction identifiers; PRD.md's UC-N
numbers are the source document's numbering — mapped explicitly below since
extraction did not preserve document order.

| kane-cli slug | PRD ref | Title |
|---|---|---|
| uc-4 | UC-1 | Add a product to the cart |
| uc-5 | UC-2 | Review and update the cart |
| uc-3 | UC-3 | Create an account or sign in |
| uc-2 | UC-4 | Proceed to checkout |
| uc-1 | UC-5 | Place a paid order and receive confirmation |

## uc-4 — Add a product to the cart (PRD.md UC-1)
cid: sha256:2d6671ad1765e7ce4cb4144fdcb0685139c6e41a0617891d7655b9e33912b6c4
verification_mode: kane

## uc-5 — Review and update the cart (PRD.md UC-2)
cid: sha256:d3326fbe8ff5e4bfe0bfba93526e846933ddfed303f2046e332c4c17048c643b
verification_mode: kane

## uc-3 — Create an account or sign in (PRD.md UC-3)
cid: sha256:6f2f3c025ef966144209b6360c008f9145d1b0c947c29b97dfa8a86d295990b4
verification_mode: kane
negative-path: AC-3.3 (wrong password), AC-3.4 (unknown email)

## uc-2 — Proceed to checkout (PRD.md UC-4)
cid: sha256:a55282dbdd80d904071dfca12f0fc48d697ab4d279cc2e9b36472f91c03ca7f0
verification_mode: kane
negative-path: AC-4.2 (unauthenticated redirect), AC-4.3 (empty-cart redirect)

## uc-1 — Place a paid order and receive confirmation (PRD.md UC-5)
cid: sha256:54000671f09f70cf3da7270745106045957f7f1cf379ff71c9e751814fea1793
verification_mode: kane
negative-path: AC-5.3 (invalid card rejected, no order created)
