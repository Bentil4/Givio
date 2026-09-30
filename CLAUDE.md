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

## Clean Code standards

These apply to every line of code written for this project — Angular app, Appwrite Function, scripts and tests. They come from two articles in Pabashani Herath's Clean Code series (after Robert C. Martin's _Clean Code_): [Writing Functions or Methods](https://medium.com/swlh/clean-code-writing-functions-or-methods-4e6e53ff4ac2) and [Formatting / Source Code Structure](https://medium.com/@pabashani.herath/clean-code-formatting-source-code-structure-f3021575d79).

### Functions

1. **Small — then smaller.** Functions should not be longer than 20 lines and mostly under 10. Over 40 lines is a hard stop (ESLint `max-lines-per-function`, app code). Arguments: as few as possible, ideally none; three at most (ESLint `max-params`), otherwise pass an options object — this codebase's existing convention for Function handlers.
2. **Blocks and indenting.** The body of an `if`, `else`, `switch` case or loop should be one or two lines, ideally a single function call. Don't nest control structures: move the nested logic into its own well-named function (ESLint `max-depth`).
3. **Do one thing** (Single Responsibility). A function does one thing, does it well, and does only that. If it does more, split it. A class or service has one reason to change.
4. **Descriptive names.** A name says why it exists, what it does and how it's used — if it needs a comment, rename it. Long and descriptive beats short and vague (`createDeduplicatedListOfContacts()`, not `process()`); never `do`/`action`/`handle` alone. Try a few names and read the code with each.
5. **Remove duplicate code** — Don't Repeat Yourself, Once and Only Once, Single Point of Truth. Search before writing and extract shared logic, as `shared.js`, `phone.util.ts` and `isValidEmail` already do.
6. **Avoid side effects.** Don't mutate globals, module state or arguments; take inputs and return a new value. When a side effect is the point (a write, a network call), centralize it in one place and say so in the function's name.
7. **Remove dead code.** No unused variables, parameters, functions, imports or unreachable branches (ESLint `no-unused-vars`). Don't comment code out — version history keeps it.

### Formatting and source structure

1. **Separate concepts vertically.** One blank line between concepts — imports, each function, each logical group of statements.
2. **Related code is vertically dense.** Lines that belong together stay together; don't break them apart with blank lines or pointless comments.
3. **Declare variables close to their usage** — not at the top of a function and used 15 lines later.
4. **Dependent functions are close.** If one function calls another, keep them vertically close, caller above callee.
5. **Similar functions are close.** Functions with conceptual affinity (same naming family, same job) sit next to each other.
6. **Downward direction (newspaper order).** The top of a file states what it is — exports, the class, the handler entry point — and detail increases further down, so a reader gets the gist from the first few functions.
7. **Keep lines short.** Within Prettier's 100-character `printWidth`.
8. **No horizontal alignment.** Don't pad declarations or assignments into columns; let the formatter set spacing.
9. **Use white space deliberately.** Spaces around operators and around `=>`, none between a function name and its opening parenthesis — Prettier's defaults.
10. **Don't break indentation.** Never collapse a scope (an `if`, loop or function body) onto one line.

### File size

- **At most 500 code lines per file** (blank lines and comments not counted), for every file type: app, Function, tests and scripts. Enforced in CI by `npm run lint:size` (`scripts/check-file-length.mjs`). Split a file by responsibility before it reaches the limit.
- Files that were already over the limit are listed as legacy exceptions in that script: they may shrink but never grow, and each gets split in its own task.

### Tools

Prettier and ESLint are the team's formatting rules; don't format by hand against them. Run `npx prettier --write` on the files you change and `npm run lint` + `npm run lint:size` before pushing. The VS Code **CodeMetrics** extension is recommended for spotting complex functions early.

---

## PR requirements

Every PR to `dev` / `master` must pass:

1. **PR title & commits** — Conventional Commits: `type(scope)?: description`. Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`.
2. **Branch name** — must start with `feat/`, `feature/`, `fix/`, `bugfix/`, `hotfix/`, `refactor/`, `chore/`, `docs/`, or `release/`.
3. **Prettier** — run `npx prettier --write .` before pushing.

Fix commit messages with `git rebase -i HEAD~N` (reword). Fix formatting with `npx prettier --write .`.
