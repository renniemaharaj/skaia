# Routine System

This directory contains reusable project routines for agents and maintainers. A routine is not a vague role prompt; it is an executable operating procedure with a clear trigger, input context, verification standard, and trace output.

Use routines to keep work precise:

- Read only the routines needed for the current task.
- Prefer links to related specs, todos, and routines instead of copying their contents.
- Update the touched routine's run log only when the routine materially ran.
- Keep `.todo/*.tip` as the status entrypoint for planned implementation work.
- Keep `.specs/` as the authoritative architecture and protocol source.

## Routing Table

| Need | Start With | Also Read | Output |
| --- | --- | --- | --- |
| Execute an existing todo | `.routines/worker` | Matching `.todo/<name>`, `.todo/<name>.tip`, relevant specs, `audit_backend` or `audit_frontend`, `correctness` | Code/tests/docs plus updated `.tip` |
| Create, split, dedupe, or retire todos | `.routines/todo_planner` | `.todo/README.md`, all `.todo/*.tip`, relevant specs | Updated `.todo` and `.tip` files |
| Backend review or backend implementation standards | `.routines/audit_backend` | `.specs/backend_spec`, `.specs/migrations_spec`, `correctness` | Findings, fixes, tests, and trace notes |
| Frontend review or UI/data-flow standards | `.routines/audit_frontend` | `.specs/frontend_spec`, backend API contracts, `correctness` | Findings, fixes, build/test results, and trace notes |
| Specs/model/protocol documentation upkeep | `.routines/.specs_specialist` | `.specs/README.md`, changed specs, related code | Updated specs and routine run remarks |
| Drift, contradictions, orphaned docs, or anti-pattern scan | `.routines/correctness` | README/spec/todo files, relevant code | At least one actionable criticism or correction |

Deprecated aliases:

- `.routines/frontend_specialist` redirects to `.routines/audit_frontend`.

## Invocation Contract

When an agent runs a routine, it should follow this contract:

1. State the routine(s) being used and why.
2. Read the routine plus only its listed context files that are relevant to the request.
3. Build a short working checklist for non-trivial work.
4. Execute or review according to the routine.
5. Verify with the smallest meaningful test/build/lint set, expanding when shared contracts changed.
6. Update trace files:
   - Implementation todos: update `.todo/<name>.tip`.
   - Architecture/model/protocol changes: update `.specs/*` and `.routines/.specs_specialist`.
   - Audit-only runs: update the routine's `Last Ran`, `Last Run Remarks`, and `Next Steps` if findings are durable.
7. Report changed files and verification results.

## Routine File Template

```md
# Routine: <routine_name>

## Purpose
<One paragraph describing what this routine owns and when to use it.>

## Triggers
- <Requests, file changes, or repo states that should invoke this routine>

## Inputs
- <Primary files/directories to inspect first>

## Responsibilities
- <Specific checks/actions the routine performs>

## Non-Goals
- <What this routine must not do; link to the right routine instead>

## Workflow
1. <Ordered, executable steps>

## Verification
- <Commands/checks expected before completion>

## Trace Outputs
- <Files/status blocks/specs to update>

## Extension/See Also
- `<related routine or spec>` — <why it matters>

## Last Ran
- <YYYY-MM-DD or "Not yet recorded">

## Last Run Remarks
- <Durable findings and actions, not a transcript>

## Next Steps
- <Concrete follow-ups, or "None">
```

## Authoring Rules

- One routine per file; use lowercase snake_case names.
- A routine must have clear triggers, inputs, non-goals, verification, and trace outputs.
- Avoid duplicated routine bodies. If a file is renamed, leave a tiny redirect file for one release cycle.
- Link to specs/todos/routines by path. Do not paste large excerpts from them.
- Keep routine files concise enough for agents to load quickly.
- Avoid hidden state. If a routine learns something durable, write it to a spec, `.tip`, or the routine run remarks.
- Prefer objective commands and file paths over broad slogans.
