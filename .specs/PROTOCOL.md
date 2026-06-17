# Compact Spec Protocol

## Purpose

Reduce model context while preserving the project contracts needed to work on
Skaia without rediscovering behavior from code.

## Card Shape

Every spec should be a card with these headings when applicable:

- `Scope` - one sentence naming what the spec governs.
- `Load when` - triggers for agents; this is the routing key.
- `Owns` - files, packages, endpoints, tables, atoms, or commands.
- `Contracts` - durable behavior stated as bullets or small tables.
- `Invariants` - rules that must not be broken.
- `Verify` - commands, files, or checks that prove the card still matches code.
- `Trace` - related specs, routines, todos, or migration names.

Avoid background sections unless they encode a decision that still constrains
implementation.

## Density Rules

- Default target: one screen of context per subsystem, about 80-160 lines.
- Prefer tables for route/message registries; prefer bullets for invariants.
- Link files by path instead of reproducing code.
- Use exact endpoint names, message types, env vars, table names, and atom names.
- Keep old incident history only as `Anti-pattern` bullets when recurrence is likely.
- Do not include transcripts, full SQL bodies, generated files, or one-off debugging notes.

## Routing Rules

1. Load `.specs/README.md`.
2. Pick the smallest `Load Sets` entry that covers the task.
3. Load referenced specs only when a symbol/contract points there.
4. If editing code reveals drift, patch the spec in the same turn.

## Drift Policy

- Code, migrations, and tests are implementation truth.
- Specs are contract truth after they are corrected.
- If code and spec disagree, read the narrow implementation path first, then update
  the spec with current behavior and `Verify` evidence.
- If the right behavior is unclear, run `.routines/correctness` before changing docs.

## Naming

- Use current files and routes, not legacy aliases.
- Call the homepage selector `landing_page_slug`; do not mention an `is_index`
  column except as an anti-pattern.
- Use `handler => service => repository` for backend architecture.
- Use `REST mutation => WS push => atom update` for mutable frontend data.

## Verification Minimums

Docs-only pass:

- `rg` for stale endpoint/message/table names changed by the edit.
- Confirm linked files exist.
- If routes are documented, verify against chi mounts in `backend/main.go` and
  domain `handler.go` files.

Code-backed spec pass:

- Cite the tests or checks already run for the implementation change.
- For migration specs, list new migration filenames and check sorted order.
