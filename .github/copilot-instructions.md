# Skaia Copilot Instructions

These instructions guide AI agents and developers working in the Skaia monorepo. They are designed to maximize productivity, maintain project conventions, and ensure robust, traceable collaboration between humans and AI.

---

## Principles

- **Link, don't embed:** Reference detailed documentation in `.specs/`, `.todo/`, `.routines/`, and `README.md` files. Do not duplicate content—link to the source.
- **Respect project boundaries:** Follow the structure and conventions described in the main and subproject `README.md` files. Use `.todo/`, `.specs/`, and `.tip` for planning and status.
- **Traceability:** Reference `.todo` and `.specs` entries in code comments, PRs, and commit messages for all planned or collaborative work.
- **Status-first workflow:** Always check `.todo/.tip` for current progress and next steps before starting new work.
- **Minimal duplication:** If a convention or process is already documented in `.specs/`, `.routines/`, or a `README.md`, link to it instead of repeating it here.
- **ApplyTo:** For agent customizations, use `applyTo` patterns to target instructions to specific directories (e.g., `backend/`, `frontend/`, `.todo/`).

---

## Skaia Project Structure

- **Backend:** Go API server (`backend/`).
- **Frontend:** React 19 + TypeScript SPA (`backend/frontend/`).
- **CLI & Orchestration:** `grengo` CLI (`grengo/`).
- **Specs:** Authoritative specifications in `.specs/`.
- **Routines:** Maintenance/automation routines in `.routines/`.
- **Planning:** Collaborative planning, status, and specs in `.todo/`.

---

## Build & Run

- **Backend:** See `backend/README.md` for run/build instructions and environment variables.
- **Frontend:** See `backend/frontend/README.md` for dev/build/lint commands.
- **CLI:** See `grengo/README.md` for CLI usage and orchestration.
- **Specs:** See `.specs/README.md` for architecture, design, and protocol details.
- **Routines:** See `.routines/README.md` for routine structure and usage.
- **Planning:** See `.todo/README.md` for collaborative planning and status tracking.

---

## Agent/AI Guidance

- **Planning:** Propose new `.todo` and `.specs` entries for any non-trivial change or refactor. Use `.tip` for status tracking.
- **Documentation:** When adding or updating documentation, prefer `.specs/` for technical details, `.routines/` for automation, and `.todo/` for planning.
- **Status:** Update `.tip` and `.todo` as work progresses. Use only allowed emoji for status in `.todo/`.
- **Customization:** For advanced agent workflows, use `applyTo` to scope instructions (e.g., only for `backend/` or `frontend/`).

---

## Example Prompts

- "Add a new payment provider—start by planning in `.todo/payments` and `.specs/migrations_spec`."
- "Refactor forum service—propose a plan in `.todo/forum_refactor` and update `.tip`."
- "Document the new WebSocket protocol in `.specs/realtime_wss_spec`."
- "Automate backup routine—add a new routine in `.routines/backup.md`."

---

## Next Steps

- For complex or specialized workflows, create additional agent customizations using `applyTo` patterns (e.g., `/create-instruction backend/ ...`).
- Review `.specs/` and `.routines/` for areas that may benefit from more detailed or updated instructions.
- Solicit feedback from contributors to improve clarity and coverage of these instructions.

---

For more details, see the linked documentation in each section above.
