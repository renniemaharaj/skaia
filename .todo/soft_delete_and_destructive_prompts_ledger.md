# Soft-delete operation ledger

Verified against `backend/internal/migrations/001_schema.sql`, migrations
002-034, `internal/app/migrations`, runtime Go SQL, and frontend destructive
calls on 2026-07-26.

| Class | Tables / operations | Runtime contract |
| --- | --- | --- |
| Entity tombstone | `users`, `roles`, `permissions`, `site_config`, forum categories/threads/comments, store categories/products/orders/plans/subscriptions/cards/reviews/reference codes, inbox conversations/messages, notifications, pages/comments/allocations, data sources/section presets, landing sections/items, normalized page themes/tokens/sections/items/presets/responses, blueprints/instances, media history | `deleted_at`/`deleted_by`; ordinary reads and writes require active row and active ancestors; delete/restore audit events |
| Reversible relationship | role/user/permission assignments, demotion votes, carts, forum likes/editors, inbox participants/blocks, page editors/likes/comment likes/color references | `inactive_at`/`inactive_by`; unique-row upsert revives |
| Revoke / scrub | `user_sessions`, `sessions`, verification/reset tokens, credentials, TOTP secrets, backup codes, MFA challenge state | revoke timestamps or nullable secret material plus `cleared_at`; active auth reads exclude revoked/cleared rows |
| Immutable | payments, order items, wallet transactions, reference payouts, events, resource views, lifecycle events | no user-facing delete; database hard-delete trigger |
| Operational evidence | section quarantine, response migrations, shadow runs | resolve/upsert and retain; database hard-delete trigger |
| Control plane | frappe sites/clusters, API keys/permissions, passcode | retained deleted/failed/revoked/inactive/cleared state; external teardown is not restorable |
| Physical exception | uploads, incomplete chunks, exports, temporary instance files, external containers/volumes | permanent UI copy and Skaia prompt; no database row is erased as a side effect |
| Migration-only cleanup | guarded legacy statements in migrations 027 and earlier | executes before migration 034 installs runtime guards |
| Dormant/orphan preflight | `page_interactive_sections`, `page_interaction_participation`, `page_interaction_qa_items`, `page_interaction_qa_upvotes`, `page_interaction_responses`, `page_interaction_selections` | no current Go client found; do not repurpose; retirement stays under the page cutover gate |

## Runtime SQL gate

`rg -n --glob '*.go' --glob '!**/*_test.go' --glob '!**/migrations/**' '\bDELETE\s+FROM\b' backend internal`
must return no application hits.

Migration 034 installs `BEFORE DELETE` triggers on lifecycle, relationship,
secret, immutable, audit, and operational-evidence tables. The control-plane
migration installs matching triggers in `grengo`. Bypass requires explicit SET
access to the NOLOGIN `skaia_hard_delete_operator` role.

## HTTP intent classification

- Destructive/tombstone: forum category/thread/comment; store
  category/product/order/card/reference code/plan; inbox conversation/message;
  notification/clear-all; page/page section/item/comment/response/all-pages;
  datasource/preset; role/user/allocation; provisioned instance.
- Reversible intent without destructive prompt: unlike, unblock, unsuspend,
  logout/session revocation, cart removal, editor/membership/permission toggles.
- Permanent exception with explicit prompt: upload/file/export deletion and
  external site/instance/app teardown.

## Unique-value policy

- Usernames, emails, RBAC names, config keys, page slugs, category names, and
  stable normalized keys stay reserved by tombstoned rows.
- Page-theme display order is unique only among active tokens so palette swaps
  and later revival can stage safely; a live collision returns restore conflict.
