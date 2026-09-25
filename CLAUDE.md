You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection


### Semantic HTML

Use the element that describes the content — not `<div>` by default:

| Content type                        | Use                      |
| ----------------------------------- | ------------------------ |
| Primary page content area           | `<main>`                 |
| Thematic section with a heading     | `<section>`              |
| Self-contained content (card, post) | `<article>`              |
| Page or section header              | `<header>`               |
| Page or section footer              | `<footer>`               |
| Navigation links                    | `<nav>`                  |
| Supplementary / sidebar content     | `<aside>`                |
| Ordered or unordered list           | `<ul>` / `<ol>` + `<li>` |
| Clickable action                    | `<button>`               |
| Navigation link                     | `<a>`                    |
| Form wrapper                        | `<form>`                 |

- `<div>` is for layout containers that carry no semantic meaning. If a semantic equivalent exists, use it.
- `<span>` is for inline styling wrappers only — never for block-level grouping.
- Never use `<div>` or `<span>` with a `(click)` handler — use `<button>` or `<a>` instead (accessibility requirement).

### Routing decisions

**Create a route when:**

- The view has its own URL that users navigate to directly (bookmarkable, deep-linkable)
- The view appears as a top-level page in the sidebar navigation
- The view is role-specific and needs `canMatch: [matchRole(...)]`
- The feature is large enough to warrant lazy-loading

**Do not create a route — use components/signals instead:**

- Showing or hiding content within a page → `@if` / `@switch`
- Detail or edit views → `modal` or `drawer`
- Tab or step content within a page → `tabs` or component state
- Conditional page states (empty, loading, error) → signals + `@if`
- Any view that does not need its own URL

### What not to do

- Do not add error handling for impossible paths. Only validate at real boundaries (user input, HTTP responses).
- Do not write comments explaining _what_ the code does — only _why_ when the reason is non-obvious.
- Do not add abstractions beyond what the current task requires.
- Do not duplicate a component or service that already exists elsewhere in the codebase — search first.
- Do not leave raw `.subscribe()` calls without `takeUntilDestroyed` or `toSignal`.

---

## PR requirements

Every PR to `dev` / `master` must pass:

1. **PR title & commits** — Conventional Commits: `type(scope)?: description`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`.
2. **Branch name** — must start with `feat/`, `feature/`, `fix/`, `bugfix/`, `hotfix/`, `refactor/`, `chore/`, `docs/`, or `release/`.
3. **Prettier** — run `npx prettier --write .` before pushing.

Fix commit messages with `git rebase -i HEAD~N` (reword). Fix formatting with `npx prettier --write .`.