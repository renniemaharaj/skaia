# Frontend CSS Unification Plan

## Goal

Unify the frontend design system by centralizing shared card/section styling and CSS variables. This will make forum, store, section, and other UI panels reuse the same base shape and visual behavior, reducing duplication and enabling smaller models to compose UI consistently.

## Current state

- Shared theme variables exist in `backend/frontend/src/index.css` for colors, shadows, and spacing.
- Many components still define their own card/section styles in separate CSS files.
- This creates visual drift and forces custom CSS for each new UI block.

## Strategy

### 1. Add shared CSS tokens

Extend `backend/frontend/src/index.css` with semantic variables for shared card styling:

- `--card-bg`
- `--card-border`
- `--card-radius`
- `--card-padding`
- `--card-shadow`
- `--card-shadow-hover`
- `--card-hover-bg`
- `--section-bg`
- `--section-gap`
- `--section-padding`
- `--panel-border`
- `--panel-heading-color`

These tokens should represent the reusable design system foundations.

### 2. Create reusable utility classes

Add shared base utility classes inside `backend/frontend/src/index.css`:

- `.card`
- `.card--interactive`
- `.card--outlined`
- `.card--flat`
- `.card__header`
- `.card__body`
- `.card__footer`
- `.section`
- `.section__header`
- `.section__content`

Example:

```css
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--card-radius);
  padding: var(--card-padding);
  box-shadow: var(--card-shadow);
  transition: all 0.2s ease;
}
.card:hover {
  box-shadow: var(--card-shadow-hover);
  background: var(--card-hover-bg);
}
```

### 3. Refactor repeated styles into shared classes

Move repeated card and section rules into the shared base classes for these files:

- `backend/frontend/src/App.css`
- `backend/frontend/src/components/forum/ThreadsFeed.css`
- `backend/frontend/src/components/forum/ViewThreadMeta.css`
- other component CSS with panel/card styling such as `Landing.css`, `Auth.css`, `UserPermissionManager.css`, etc.

Use modifier classes for contextual variants:

- `card--forum`
- `card--store`
- `card--section`
- `card--highlight`
- `card--compact`

This keeps the shared base consistent while allowing small domain-specific differences.

### 4. Prefer stable component wrappers

Where applicable, standardize component wrappers around the shared classes:

- `<div className="card card--forum">`
- `<section className="section section--store">`

Optionally create shared React UI components:

- `Card.tsx`
- `Section.tsx`
- `Button.tsx`

This allows new UI from models to use a small set of reliable primitives.

## Benefits

- Consistent shape, spacing, and hover behavior across forum, store, and section UIs.
- Less repeated CSS and fewer bespoke visual rules.
- Easier maintenance because updates happen in one central style system.
- Smaller models can compose UI more reliably from shared components.

## Immediate next tasks

1. Update `backend/frontend/src/index.css` with shared card/section variables and base classes.
2. Refactor `backend/frontend/src/App.css`, `backend/frontend/src/components/forum/ThreadsFeed.css`, and `backend/frontend/src/components/forum/ViewThreadMeta.css` to reuse the shared card system.
3. Audit other component CSS files for duplicate card/section patterns and migrate them to shared classes.
4. Optionally add a shared UI wrapper layer in React for `Card` and `Section`.

## Notes

This plan is intentionally incremental: first centralize shared visual foundations, then gradually move existing panels onto the unified system so the design remains consistent across new features.
