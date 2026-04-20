# Agent TODO & Specs System

This directory is used for collaborative planning and tracking of software engineering tasks by AI agents and developers. Only plain text files with no extension are allowed, except for `README.md`, `.tip`, and `.specs`.

## Usage Rules

- Each `.todo` file (no extension) should focus on a specific area (e.g., migrations, frontend refactor, backend normalization).
- `.specs` files in this directory are for detailed specifications, requirements, or design docs related to human-AI planning and collaboration.
- Use clear, actionable entries and update them as progress is made.
- Do not use file extensions for todo plans/specs (except `README.md`, `.status`, and `.specs`).
- Reference `.todo` and `.specs` entries in code comments or PRs to maintain traceability.

## Status Tracking

- The `.tip` file tracks the current progress of each todo plan in this directory and is the entrypoint for beginning any real work.
- Each tracked todo gets a block in `.tip` with the following structure:

```
<--/------->

## todo_name

### Current Progress
- **Phase 1: ...** — [emoji] ...
- **Phase 2: ...** — [emoji] ...
... (as needed)

### Next Steps
- [ ] ...
- [ ] ...

<--/------->
```

- Use compact, descriptive phase names and concise status lines.
- Only the following emoji are allowed in this directory (and strictly forbidden elsewhere in the project):
  - ✅ — complete
  - 🟡 — in progress
  - ⬜ — not started

- After each emoji, add a dash and a short description of what the emoji means for that phase (e.g., `— ✅ Complete`, `— 🟡 In progress`, `— ⬜ Not started`).
- Do not use emoji for any other purpose or in any other part of the project.

## Workflow

1. **Entrypoint**: Open `.tip` first to understand current status and what work should begin.
2. **Planning**: Add high-level plans, migration steps, or refactor strategies as entries in `.todo` files.
3. **Specs**: Use `.specs` files for detailed requirements, design, or interface documentation to support planning and implementation.
4. **Iteration**: Update, refine, or split plans/specs as new requirements or insights emerge.
5. **Implementation**: Once a plan is finalized, a powerful agent or human can implement the steps.
6. **Validation**: Use `.todo` entries and `.tip` to track validation, testing, and review steps.

## Project Additions

- `.specs` files are now supported in this directory for collaborative, human-AI specification and design work.
- All planning, status, and specification tracking for collaborative work should be kept in `.todo`, `.tip`, or `.specs` files here.
- Emoji use is strictly limited to this directory and the `.tip` file as described above.

---

_This system helps ensure all agents and contributors are aligned and can collaborate effectively on complex software engineering tasks. Emoji use is strictly limited to this directory and the `.status` file as described above._
