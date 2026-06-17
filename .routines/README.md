# Routine System

Routines are executable operating contracts for AI agents maintaining Skaia. They
exist to keep work precise in a complex fullstack repository with dynamic pages,
strict backend contracts, real-time state, and a high bar for intentional UI.

## Routing Table

| Need | Start With | Also Read | Output |
| --- | --- | --- | --- |
| Execute an existing todo | `.routines/worker` | `.todo/<name>`, `.todo/<name>.tip`, relevant specs, `.routines/auditor` as needed | Code/tests/docs plus updated `.tip` |
| Create, split, dedupe, or retire todos | `.routines/todo_planner` | `.todo/README.md`, existing todos/tips, `.routines/correctness` | Updated `.todo` and `.tip` files |
| Whole-repo quality/security/UX audit | `.routines/auditor` | Specs, routines, todos, code, tests, package manifests | Findings, fixes, tests, trace notes |
| Drift, contradictions, architectural truth | `.routines/correctness` | Specs/todos/routines/code for the scope | Authoritative correction or finding |
| Specs/model/protocol documentation upkeep | `.routines/.specs_specialist` | `.specs/README.md`, `.specs/PROTOCOL.md`, changed code | Updated compact specs and run remarks |

Deprecated redirects:

- `.routines/audit_backend` -> `.routines/auditor`
- `.routines/audit_frontend` -> `.routines/auditor`
- `.routines/frontend_specialist` -> `.routines/auditor`

## Authority Model

- `correctness` is the architect of repository truth. It resolves contradictions
  between docs, specs, routines, migrations, tests, and implementation.
- `auditor` is the strict quality gate. It audits the whole repository, including
  `correctness`, itself, routines, specs, code, tests, security, UX, and process.
- `worker` implements scoped work and applies the relevant auditor standards.
- `todo_planner` keeps future work executable and non-overlapping.
- `.specs_specialist` keeps `.specs/` compact and authoritative after contracts change.

Every routine is subject to `correctness`: if a routine, spec, or todo contradicts
the code or another authority, the contradiction must be handled professionally by
updating docs, planning work, or implementing a verified fix.

## Invocation Contract

1. State the routine(s) being used and why.
2. Read the selected routine plus only the relevant context it names.
3. Build a short checklist for non-trivial work.
4. Execute or review according to the routine contract.
5. Verify with the smallest meaningful command set; expand when shared contracts changed.
6. Update trace files:
   - Implementation work: `.todo/<name>.tip`.
   - Contract/spec changes: `.specs/*` via `.routines/.specs_specialist`.
   - Audit/correctness findings: routine run remarks only when durable.
7. Report changed files, verification, skipped checks with reasons, and remaining risk.

## Quality Bar

- Backend: secure, layered, testable, explicit models, raw SQL contracts, no sensitive leaks.
- Frontend: intentional design, token-compliant CSS, accessible states, no bolt-on UI.
- Dynamic pages: preserve page-builder contracts, schema validation, live updates, and edit safety.
- Real-time: REST mutation -> backend authority -> WebSocket push -> atom/render convergence.
- Documentation: compact cards, exact names, current routes, no stale migration/project framing.

## Routine Template

```md
# Routine: <routine_name>

## Purpose
## Triggers
## Inputs
## Responsibilities
## Non-Goals
## Workflow
## Verification
## Trace Outputs
## Extension/See Also
## Last Ran
## Last Run Remarks
## Next Steps
```

## Authoring Rules

- One routine per file; lowercase snake_case names.
- Avoid duplicated bodies. Leave tiny redirects for renamed routines.
- Link to specs/todos/routines by path; do not paste large excerpts.
- Keep routine files concise enough for agents to load quickly.
- Durable learning goes into specs, `.tip`, or run remarks, never hidden memory.
