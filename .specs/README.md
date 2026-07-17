# Skaia Specs

`.specs/` is the authoritative, compact project context. Load this file first,
then load only the matching spec cards below.

## Consumption Protocol

Full rules live in `.specs/PROTOCOL.md`. Short form:

- Start with `README.md`; load a spec only when its `Load when` matches the task.
- Prefer `Owns`, `Invariants`, and `Verify` over narrative history.
- Use file links for implementation truth; do not paste code into specs.
- Keep every spec card under about 160 lines unless the protocol itself needs more.
- When code and specs disagree, read code/tests/migrations, update the spec, and note the verification.

## Load Sets

| Task | Load |
| --- | --- |
| Backend routes, models, services, auth, store | `backend_spec`, `auth_user_separation_spec`, `security_architecture_spec`, `migrations_spec` |
| Security, privileges, step-up, sessions, audit, rate limiting | `security_architecture_spec`, `auth_user_separation_spec`, `backend_spec`, `infrastructure_spec` |
| Frontend UI, state, routes, cart/store pages | `frontend_spec`, `realtime_wss_spec`, `route_resolution_spec` |
| WebSocket, presence, voice, media, push delivery | `realtime_wss_spec`, `voice_chat_architecture.md` |
| Clipmaker, frame streaming, ffmpeg export | `clipmaker_export_spec` |
| Custom pages, landing page, page builder | `route_resolution_spec`, `custom_pages_multiplayer_spec`, `custom_page_interactive_sections_spec`, `caching_cdn_spec` |
| Forms, Q&A, surveys, polls, voting | `custom_page_interactive_sections_spec`, `custom_pages_multiplayer_spec`, `security_architecture_spec`, `realtime_wss_spec`, `migrations_spec` |
| Deploy, tenancy, grengo, nginx, cache headers | `infrastructure_spec`, `caching_cdn_spec`, `migrations_spec` |

## Spec Cards

- `PROTOCOL.md` - compact documentation protocol and maintenance rules.
- `backend_spec` - Go backend contracts, routes, store domain, security.
- `frontend_spec` - React/Jotai/CSS contracts and UI rules.
- `realtime_wss_spec` - WebSocket message registry and delivery invariants.
- `route_resolution_spec` - landing page and page route resolution.
- `custom_pages_multiplayer_spec` - page-builder multiplayer reconciliation.
- `custom_page_interactive_sections_spec` - designed interactive sections, records, moderation, results, and ballots.
- `caching_cdn_spec` - no-store APIs, static caching, CDN-safe flows.
- `migrations_spec` - idempotent migration policy and current migration list.
- `infrastructure_spec` - Docker/grengo/nginx tenancy model.
- `auth_user_separation_spec` - standalone auth module contracts.
- `security_architecture_spec` - defense-in-depth and mandatory security policy invariants.
- `voice_chat_architecture.md` - binary audio/media WebSocket plane.
- `clip_maker_export_spec` - streamed frame/audio records and ffmpeg finalization.

## Maintenance

Run `.routines/planner` after changes to schema, models, routes,
WebSocket messages, cache behavior, auth, infrastructure, or frontend contracts.
