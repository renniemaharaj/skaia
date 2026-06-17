# Todo System

This directory stores agent-readable implementation plans and their current status. It is the handoff layer between planning, routines, specs, implementation, and verification.

Use `.todo/` for work that is planned but not fully complete. Use `.specs/` for durable architecture and protocol truth. Use `.routines/` for reusable operating procedures.

## File Contract

Each active todo is a pair:

- `.todo/<name>` — the plan, scope, requirements, references, and execution notes
- `.todo/<name>.tip` — the current status entrypoint and next action list

Rules:

- Use lowercase snake_case names, for example `auth_user_separation`.
- Plan files have no extension.
- Every plan file must have a sibling `.tip` file with the same basename.
- Do not create a `.tip` without a matching plan file.
- `README.md` is the only Markdown file in this directory.
- Avoid local `.specs` files unless the spec is temporary and collaboration-specific; durable system specs belong in top-level `.specs/`.
- Keep plans concise. Link to `.specs/`, `.routines/`, source files, and related todos instead of copying long context.

## Agent Entrypoints

Start from the file that matches the task:

| Task | Start With | Routine |
| --- | --- | --- |
| Execute planned work | `.todo/<name>.tip`, then `.todo/<name>` | `.routines/worker` |
| Create or reorganize plans | Existing `.todo/*` and `.todo/*.tip` | `.routines/planner` |
| Audit quality, security, UX, or contracts | Related todo, specs, code, and tests | `.routines/auditor` |
| Validate drift or contradictions | Related todo, specs, and code | `.routines/correctness` |
| Update durable architecture docs | Related todo and changed code | `.routines/planner` |

For implementation work, `.tip` is always the first file to open. It answers: what is done, what is next, and what verification is still missing.

## Plan File Structure

Use this structure for `.todo/<name>`:

```md
# Human-Readable Plan Title

## Context
<Why this work exists and what current repo state motivated it.>

## Goal
- <Outcome the work must achieve>

## Non-Goals
- <Explicitly out-of-scope work>

## Steps
1. <Ordered implementation or planning step>
2. <Next step>

## Verification
- <Expected backend/frontend/docs checks>

## References
- `.specs/<spec_name>`
- `.routines/<routine_name>`
- `<source/path>`
```

Keep the plan stable. Update it when scope changes, not for every small progress note.

## Tip File Structure

Use this structure for `.todo/<name>.tip`:

```md
<--/------->

## <name>

### Current Progress
- **Phase 1: ...** — ⬜ Not started
- **Phase 2: ...** — 🟡 In progress
- **Phase 3: ...** — ✅ Complete

### Next Steps
- [ ] <Next concrete action>
- [ ] <Verification or documentation action>

<--/------->
```

Rules:

- The heading must match the basename of the plan file.
- Use compact phase names.
- Keep next steps concrete enough for `.routines/worker` to execute.
- Record verification commands and dates once they pass.
- Keep durable implementation facts in specs or the plan, not only in `.tip`.
- The marker lines are optional for legacy files but required for new `.tip` files.

## Status Vocabulary

Only these status markers are allowed in `.tip` files:

- `⬜ Not started`
- `🟡 In progress`
- `✅ Complete`

Do not use emoji elsewhere in the project unless a local file explicitly requires it. In `.tip` files, use the exact status phrase after the marker.

## Lifecycle

1. **Discover**: Check existing todos before creating a new plan.
2. **Plan**: Create `.todo/<name>` and `.todo/<name>.tip` together.
3. **Execute**: Use `.routines/worker`; update `.tip` as phases move.
4. **Verify**: Run checks listed in the plan and record successful commands in `.tip`.
5. **Document**: Update `.specs/` when architecture, models, migrations, protocols, or frontend contracts changed.
6. **Retire**: Remove the plan pair only after completion and verification are recorded or no longer relevant.

## Completion Rules

A todo is complete only when:

- All phases are `✅ Complete`.
- The `Next Steps` list has no unchecked implementation or verification items.
- Required backend/frontend/docs verification has passed or a skipped check is justified.
- Related specs and routines have been updated if durable project knowledge changed.

Completed todo pairs may be deleted by `.routines/planner` after the verification basis is clear. If a completed todo documents important historical context, move that context to `.specs/` before deletion.

## Maintenance Checks

Use these quick checks during todo cleanup:

```sh
# list plan files without a matching .tip
for f in .todo/*; do
  base=${f##*/}
  case "$base" in README.md|*.tip) ;; *) [ -f "$f.tip" ] || printf 'missing tip: %s\n' "$f" ;; esac
done

# list .tip files without a matching plan
for f in .todo/*.tip; do
  plan=${f%.tip}
  [ -f "$plan" ] || printf 'missing plan: %s\n' "$f"
done
```

## Related Systems

- `.routines/README.md` — routine routing and invocation contract
- `.routines/planner` — todo creation, dedupe, split, retirement, and spec upkeep
- `.routines/worker` — todo execution and verification
- `.routines/auditor` — strict whole-repo quality/security/UX audit
- `.routines/correctness` — drift and contradiction checks
- `.specs/README.md` — durable project specification system
