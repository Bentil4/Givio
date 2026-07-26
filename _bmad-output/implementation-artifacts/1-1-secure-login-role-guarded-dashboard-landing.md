---
baseline_commit: 95cae6ba0109fc13575f0900e0ffa056d13d2196
---

# Story 1.1: Secure Login & Role-Guarded Dashboard Landing

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Admin or Operator,
I want to log in with my email and password and be taken straight to my own role's dashboard, and be blocked from any route outside my role,
so that I only ever operate within the part of the system meant for me.

## Acceptance Criteria

1. **Given** valid Admin credentials, **when** submitting the login form, **then** an Appwrite session is created and I land on the `admin` dashboard shell, **and** my role is read from my Appwrite Label (AD-1), never from `account.prefs`.
2. **Given** valid Operator credentials, **when** submitting the login form, **then** I land on the `organizer` dashboard shell.
3. **Given** invalid credentials, **when** submitting the login form, **then** a generic "Invalid credentials" error is shown with no indication of whether the email or password was wrong, **and** repeated failed attempts are rate-limited (relies on Appwrite's own built-in auth rate limiting — verify it's active on the project, no custom throttling code needed).
4. **Given** I am logged in as an Operator, **when** I navigate directly to an admin-only URL (typed in the address bar, not via UI navigation), **then** a functional `CanActivateFn` guard (AD-6) denies access before the route loads, **and** the same guard protects every lazy-loaded route in the admin/organizer trees (AD-7), not just the ones with UI links to them.
5. **Given** I am logged in, **when** I click Logout from any screen, **then** my Appwrite session is cleared and I'm redirected to the login screen, **and** in-memory cached data is cleared (there is no IndexedDB outbox to preserve yet — Dexie doesn't exist until Epic 3 — so logout simply must not touch IndexedDB at all, which is trivially satisfied by not calling it).
6. **Given** I have an active Appwrite session and refresh the page, **when** the app reboots, **then** my session is restored (via `account.get()` at bootstrap) and I land back on my role's dashboard rather than being bounced to `/login`.

## Tasks / Subtasks

- [x] Task 1: Build the Data layer's Appwrite client (AC: 1, 2, 6)
  - [x] Create `src/app/data/appwrite/client.ts`: instantiate `Client`/`Account` reading `endpoint`/`project` from `src/environments/environment.ts` (not hardcoded) — implemented as an `Account` behind an `ACCOUNT` `InjectionToken` (see Dev Notes: DI-based mocking) rather than a plain exported singleton
  - [x] Delete `src/lib/appwrite.ts` (superseded — its only consumer, `login.ts`, is rewritten in Task 3)
- [x] Task 2: Build `AuthStore` (AC: 1, 2, 3, 5, 6)
  - [x] Create `src/app/data/stores/auth-store.ts`, `providedIn: 'root'`, using signals (no NgRx)
  - [x] Signals: `currentUser` (Appwrite `Models.User<Models.Preferences> | null`), `role` as `computed()` from `currentUser()?.labels` (`'admin' | 'operator' | null` — a user with no matching label is unauthenticated-for-role purposes even if they have a valid session)
  - [x] Methods: `login(email, password)`, `logout()`, `restoreSession()` (calls `account.get()`, catches the 401 when no session exists, sets `currentUser` accordingly)
  - [x] Delete `src/app/auth/service/authservice.ts` and its spec — confirmed empty, unused stub superseded by `AuthStore`
- [x] Task 3: Rewrite the login screen against `AuthStore` (AC: 1, 2, 3)
  - [x] Update `src/app/auth/pages/login/login.ts`: remove the local `IUserPrefs` interface and all direct `account.*` calls; call `AuthStore.login()`; on success, navigate based on `authStore.role()` (`'admin'` → `/admin`, `'operator'` → `/organizer`); on failure, show a generic "Invalid credentials" message (never reveal which field was wrong)
  - [x] Match `.claude/skills/plan/login-screen.md` for this story's in-scope elements only: branding/tagline, "Welcome Back", email/password fields with validation, show/hide password toggle (already implemented), Sign In button, loading state, error message area (added). Out-of-scope elements confirmed skipped: "Remember me", "Forgot password", social login buttons, "Sign Up" link, footer legal links.
  - [x] Delete the stray `login.css`/`login.css.map` files alongside `login.scss` — committed build output, not source
- [x] Task 4: Functional route guards (AC: 4)
  - [x] Create `src/app/auth/guards/role.guard.ts`: a `CanActivateFn` factory `roleGuard(allowedRoles: readonly Role[])` that injects `AuthStore` + `Router`, returns `true` if `role()` is in `allowedRoles`, else a `UrlTree` back to `/login`
  - [x] Also added a plain `authGuard: CanActivateFn` (any authenticated role) for routes that don't need role-specific restriction yet
- [x] Task 5: Lazy-loaded, guarded route skeleton (AC: 1, 2, 4)
  - [x] Rewrote `src/app/app.routes.ts` to use `loadComponent` (AD-7) instead of eager `component:` references, for `login`, the `admin` tree, and the `organizer` tree
  - [x] Applied `roleGuard(['admin'])` to the admin route and `roleGuard(['operator'])` to the organizer route
  - [x] Renamed `src/app/feature/pages/user/` → `src/app/feature/pages/organizer/` (`user-layout` → `organizer-layout`, `user-dashboard` → `organizer-dashboard`) via `git mv`, including class names, selectors, and `.spec.ts` filenames/`describe()` strings. `OrganizerLayout` now imports `RouterOutlet` and renders a child route; also given a minimal header with a Logout button (see Dev Agent Record note on AC 5 below — not originally itemized as its own subtask, added to satisfy "Logout from any screen")
  - [x] Route paths: `admin`/`organizer` used as the new top-level segments; old `/admin-dashboard`, `/user-dashboard` placeholder paths removed
- [x] Task 6: Session restore at bootstrap (AC: 6)
  - [x] Added `provideAppInitializer(() => inject(AuthStore).restoreSession())` in `src/app/app.config.ts` before the router activates
  - [x] Did **not** touch the pre-existing duplicated `provideServiceWorker(...)` call — left exactly as-is (Story 5.2's fix)
- [x] Task 7: Tests
  - [x] `AuthStore`: 10 unit tests covering `login()` success/failure, `role()` computed from labels, `logout()` clearing state (incl. when `deleteSession` itself fails), `restoreSession()` handling a valid session, a 401, and a non-401 error
  - [x] `role.guard.ts`: 5 unit tests — `authGuard` allow/deny, `roleGuard` allow/deny/unauthenticated, including the "denied even via a direct URL" case from PRD acceptance criterion #16
  - [x] `login.ts`: 5 component tests — admin nav, operator nav, generic error on invalid credentials, generic error when authenticated but no role label, plus the pre-existing "should create" smoke test
  - [ ] Manual verification (not run in this session — requires a live Appwrite Console): before end-to-end testing, manually add an `admin` and an `operator` Label to two test accounts via the Appwrite Console (Auth → Users → select user → Labels), since the app itself has no way to set a Label until Story 1.2/1.3

### Review Findings

Reviewed by three independent fresh-context subagents (Blind Hunter, Edge Case Hunter, Acceptance Auditor) against baseline `95cae6ba0109fc13575f0900e0ffa056d13d2196`. All `patch` findings below were unambiguous (no `decision-needed` items arose) and have been applied and re-verified (40/42 tests pass — same 2 pre-existing unrelated failures; `ng lint` clean; `ng build` succeeds).

- [x] [Review][Patch] Bootstrap session-restore rethrew non-401 errors, so any transient Appwrite/network failure at page load blocked Angular from ever rendering (blank page) — `src/app/data/stores/auth-store.ts` `restoreSession()` now always resolves, treating any error as logged-out and logging unexpected (non-401) ones to console instead of throwing.
- [x] [Review][Patch] `AuthStore.logout()` rethrew on a failed `deleteSession`, so both `AdminLayout.onLogout()`/`OrganizerLayout.onLogout()` skipped their `router.navigate(['/login'])` call whenever the server-side session deletion failed — violating AC5's unconditional redirect. `logout()` now always resolves and clears local state regardless.
- [x] [Review][Patch] A login that succeeded with Appwrite but matched no `admin`/`operator` label left a live, dangling authenticated session behind what looked like a failed login — `login.ts`'s no-role branch now calls `authStore.logout()` before showing the error.
- [x] [Review][Patch] `/` and `/login` were reachable (and `/login` re-shown) even for an already-authenticated user after a session restore, in tension with AC6's intent — added `redirectIfAuthenticatedGuard` (`role.guard.ts`) on the `login` route, sending an authenticated user straight to `ROLE_HOME[role]`.
- [x] [Review][Patch] The new `Sidebar` logout button/output and both layouts' `onLogout()` (explicitly required for AC5) had zero test coverage — added `sidebar.spec.ts` emission test and `onLogout` tests (success + `deleteSession`-failure path) to both `admin-layout.spec.ts` and `organizer-layout.spec.ts`.
- [x] [Review][Patch] `AuthStore`'s `initializing` signal was unreachable dead code — `provideAppInitializer` blocks all rendering until `restoreSession()` resolves, so no component could ever observe it as `true`. Removed.
- [x] [Review][Patch] AC3's rate-limiting live-verification requirement wasn't disclosed as outstanding alongside the Label-assignment manual step — added to Completion Notes above.
- [x] [Review][Defer] No `returnUrl` is preserved when a guard denies access — a reasonable future enhancement, but not required by any AC in this story. [`role.guard.ts`] — deferred, not a regression against this story's spec.
- [x] [Review][Defer] Guards are attached per top-level route rather than via `canActivateChild` — verified this is *not* a present bug (Angular evaluates a parent's `canActivate` for any child activation, so today's single-child trees are already protected), but nothing structurally stops a future route added directly under `admin`/`organizer` from being added without inheriting protection. Worth a lint/checklist note when Epic 2+ adds more routes. [`app.routes.ts`] — deferred.
- Dismissed as noise (not written above): `authGuard` being currently unreferenced in `app.routes.ts` — justified, Task 4 explicitly asked for it as scaffolding for a future "any authenticated role" route. `router.navigate()` calls not awaited/`.catch()`-wrapped in `login.ts` — idiomatic, universal Angular usage, not a defect.

## Dev Notes

- **Why Labels, not `account.prefs`:** the brownfield `login.ts` reads `account.get<IUserPrefs>().prefs['role']`, but Appwrite prefs are client-writable via `account.updatePrefs()` — any signed-in user could self-promote to `'admin'`. Appwrite Labels can only be set via the Console or a server-side SDK, never the client, which is exactly why AD-1 mandates them as the sole source of truth for role. [Source: `_bmad-output/planning-artifacts/architecture/architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md#AD-1`]
- **No Label-writing UI yet:** Story 1.2 builds the one Appwrite Function that can set a Label, and Story 1.3 builds the Admin UI on top of it. This story only *reads* `account.get().labels` — it does not need the Function to exist. Bootstrap test accounts manually via the Console (see Task 7).
- **Layering rule (binds this and every future story):** Presentation → Domain/State → Data. `login.ts` (Presentation) must call `AuthStore` (Domain/State) only; `AuthStore` is the only thing that calls into `src/app/data/appwrite/client.ts` (Data). Never import `appwrite` directly from a component. [Source: ARCHITECTURE-SPINE.md — Design Paradigm]
- **Only two roles in this story:** Admin and Operator. Family Member access is `accessCode`-based (no account, no Label) and is built in Epic 2/Story 2.4 — do not add a `'member'`/`'family'` branch to `AuthStore.role` in this story; there is nothing for it to do yet, and the brownfield `IUserPrefs.role` 3-way union (`'admin'|'user'|'member'`) was already dead code for the `'member'` case (no navigation branch existed for it either).
- **Rate limiting (AC 3):** do not write custom failed-attempt-counting logic. Appwrite Cloud applies its own abuse protection to auth endpoints by default; this story's job is just to surface Appwrite's own error response generically, not to build a parallel mechanism.
- **Exact Appwrite Web SDK calls** (the brownfield code already uses these correctly — keep the same calls, just move them from `login.ts` into `AuthStore`/the new client): `account.createEmailPasswordSession({ email, password })`, `account.deleteSession({ sessionId: 'current' })`, `account.get()` — returns `Models.User<Models.Preferences>`, which has a `labels: string[]` field directly on it (no generic `<IUserPrefs>` needed anymore — delete that interface, role comes from `.labels`, not `.prefs`).
- **Reuse, don't rebuild:** `login.ts` already correctly uses the shared `Input`, `Button`, `Preloader` components and `ReactiveFormsModule` with a `FormBuilder` group — keep all of that as-is; only the submit handler and role-derivation logic change.
- **Money/receipt/offline/sync ADs (AD-3/4/5/8) do not apply to this story** — they govern Epic 2/3 work. Do not scaffold Dexie, outbox, or Donation/Event models here; this story's only new persistent-layer code is the Appwrite client + `AuthStore`.

### Project Structure Notes

Brownfield state as of this story (confirmed by direct file reads, not assumed):

- `src/lib/appwrite.ts` — wraps only `Client`+`Account`, **hardcodes** `endpoint`/`project` instead of reading `src/environments/environment.ts` (which already has the identical values, unused). Only consumer is `login.ts`. **Deleted in this story**, replaced by `src/app/data/appwrite/client.ts`.
- `src/app/auth/service/authservice.ts` — literally empty (`export class Authservice {}`), a commented-out import is its only other content, zero references anywhere else in the codebase. **Deleted in this story**, replaced by `AuthStore`.
- `src/app/auth/pages/login/login.ts` — currently: imports `account` directly, defines a local `IUserPrefs` interface, reads `.prefs['role']`, navigates to `/admin-dashboard` or `/user-dashboard`. All of this is rewritten in Task 3.
- `src/app/auth/model/user.model.ts` — has `ILoginRequest`, `INavbarItem`, `IUserProfile` already; none need to change for this story, reuse as-is.
- `src/app/app.routes.ts` — currently 4 flat, **eager** routes; `AdminLayout` has real nested child routing with `RouterOutlet`, but `UserLayout` is registered directly with no children and doesn't render `UserDashboard` at all (a pre-existing bug this story fixes as part of the organizer rename).
- `src/app/feature/pages/admin/admin-layout/admin-layout.ts` — already has a **commented-out** `private authService = inject(AuthService);` line — evidence the original author intended to wire auth here; this story is where that finally happens (inject `AuthStore`, not the deleted `Authservice`).
- `src/app/feature/pages/user/` — `UserLayout` and `UserDashboard` are both empty shells (no logic, no imports beyond `@Component`). **Renamed to `organizer/`** in this story per the Architecture Spine's structural seed, and given working `RouterOutlet`/child-route wiring for the first time.
- `src/app/app.config.ts` — has a **pre-existing duplicated** `provideServiceWorker(...)` call (registered twice). This is a known, separately-tracked issue (Story 5.2) — do not fix it here, just don't let an editor auto-format touch those unrelated lines.
- No route guards exist anywhere in the codebase today — this story introduces the first ones.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-1.1`] — original AC set this story implements
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md#AD-1`] — Labels not prefs
- [Source: ARCHITECTURE-SPINE.md#AD-6] — functional, assignment-scoped route guards
- [Source: ARCHITECTURE-SPINE.md#AD-7] — lazy-loaded feature routes
- [Source: ARCHITECTURE-SPINE.md#Design-Paradigm] — Presentation → Domain/State → Data layering rule
- [Source: `.claude/skills/plan/login-screen.md`] — screen content reference (see Task 3 for what's in/out of scope for this story specifically)
- [Source: `docs/DMS_Product_Requirements_Document.md`#FR-AUTH-001..003,005] — login, session, role-redirect, logout requirements
- [Source: `.instructions.md`] — house rules this story must follow: standalone components, `input()`/`output()` signals, `OnPush`, native control flow, Reactive Forms (already used in `login.ts`), `inject()`, `providedIn: 'root'`

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- Discovered mid-implementation that this project's Angular vitest builder (`@angular/build:unit-test`) rejects `vi.mock` for relative imports ("not supported... use Angular TestBed for mocking dependencies"). Adapted by wrapping the Appwrite `Account` behind an `ACCOUNT` `InjectionToken` in `data/appwrite/client.ts` and injecting it into `AuthStore`, so tests override it via `TestBed` providers instead of module mocking. This is a durable pattern future stories touching Appwrite should reuse.
- Verified the 2 pre-existing failing tests (`app.spec.ts`, `stat-card.spec.ts`) already failed on the baseline commit before any change in this story (confirmed via `git stash` + re-run) — not a regression introduced here.

### Completion Notes List

- All 7 tasks' code work complete; 20 new/updated tests added (10 `AuthStore`, 5 `role.guard`, 5 `login`), all passing. Full suite: 32 passed, 2 pre-existing unrelated failures (confirmed baseline, not regressions). `ng lint`: clean. `ng build`: succeeds, and the lazy chunks (`login`, `admin-layout`, `admin-dashboard`, `organizer-layout`, `organizer-dashboard`) confirm AD-7 lazy-loading is actually wired, not just configured.
- Added a Logout control to `Sidebar` (used by `AdminLayout`) and a minimal header Logout button to the new `OrganizerLayout`, neither of which existed before — required for AC 5 ("Logout from any screen") since no prior UI exposed it. This wasn't broken out as its own Task in the story but was necessary to satisfy the AC; called out here for visibility.
- **Post-review fix, found during manual user testing (out of this story's original file scope but blocking):** `shared/components/preloader/preloader.ts` was a pre-existing incomplete stub — it declared `progress`/`raf`/`duration`/`start` fields but never actually ran a `requestAnimationFrame` loop or emitted `done`. Since `login.html` only cleared `showPreloader` on that event, and the preloader is a full-screen `z-index: 9999` overlay, a real login (which this story is the first thing to ever exercise end-to-end) got stuck permanently behind it even though authentication and navigation succeeded underneath. First iteration implemented a timed animation (progress bar + `done` event) — but that reintroduced a *different* race: a successful login calls `router.navigate()` immediately, destroying `Login`/`Preloader` mid-animation, while a failed login stays on `/login` and lets the animation finish — an inconsistent experience between the two paths.
- **Second iteration (user-requested full redesign):** removed all internal timing entirely. `Preloader` is now a pure presentational component — a single required `active` input, shown/hidden instantly via CSS opacity/visibility, no `done` output, no `requestAnimationFrame`. `login.ts` dropped the separate `showPreloader` signal and binds `[active]="isLoading()"` directly, so the overlay is visible for exactly as long as the real request is in flight and disappears the instant it resolves, whichever way. The inline case (spinner on the Sign In button during submit) was already correctly handled by the existing `Button` component's `[loading]` input — reused as-is, not duplicated. Redesigned visual: a compact spinner ring + wordmark, brand gradient, `prefers-reduced-motion` support retained (static ring colour, no motion). New 4-test spec (input reactivity, not timers). Re-verified: 44/46 tests pass (same 2 pre-existing unrelated failures), `ng lint` clean, `ng build` succeeds.
- **Two items are NOT completed and cannot be by a coding agent** — both require human access to the live Appwrite Cloud project (`69c270d10029e7ed7f82`):
  1. Manually adding `admin`/`operator` Labels to test accounts via the Appwrite Console (Auth → Users → select user → Labels), so a real end-to-end login can be exercised. All automated tests substitute for this by mocking the labeled-user response.
  2. AC3's rate-limiting requirement relies on Appwrite Cloud's built-in abuse protection being active on this project — that has not been verified against the live console; this story's code deliberately adds no custom throttling (see Dev Notes), but the assumption that Appwrite's default is enabled has not been confirmed.

### File List

**Added:**
- `src/app/data/appwrite/client.ts`
- `src/app/data/stores/auth-store.ts` + `.spec.ts`
- `src/app/auth/guards/role.guard.ts` + `.spec.ts`
- `src/app/feature/pages/organizer/organizer-layout/` (`.ts`, `.html`, `.scss`, `.spec.ts`) — renamed from `user-layout` via `git mv`
- `src/app/feature/pages/organizer/organizer-dashboard/` (`.ts`, `.html`, `.scss`, `.spec.ts`) — renamed from `user-dashboard` via `git mv`

**Modified:**
- `src/app/app.config.ts` (added `provideAppInitializer`; duplicated `provideServiceWorker` left untouched)
- `src/app/app.routes.ts` (lazy `loadComponent`, guards, new `admin`/`organizer` paths, `redirectIfAuthenticatedGuard` on `login`)
- `src/app/auth/pages/login/login.ts`, `login.html`, `login.scss`, `login.spec.ts`
- `src/app/auth/guards/role.guard.ts`, `role.guard.spec.ts` (added `redirectIfAuthenticatedGuard`)
- `src/app/data/stores/auth-store.ts`, `auth-store.spec.ts` (post-review: `logout()`/`restoreSession()` never rethrow; removed unreachable `initializing` signal; added `ROLE_HOME`)
- `src/app/feature/components/sidebar/sidebar.ts`, `sidebar.html`, `sidebar.scss`, `sidebar.spec.ts` (added `logout` output + button + test)
- `src/app/feature/pages/admin/admin-layout/admin-layout.ts`, `admin-layout.html`, `admin-layout.spec.ts`
- `src/app/feature/pages/organizer/organizer-layout/organizer-layout.spec.ts` (post-review: `onLogout` tests)
- `src/app/shared/components/preloader/preloader.ts`, `preloader.html`, `preloader.scss` (post-review, out-of-scope bug fix: implemented the missing progress animation + `done` emission; on-brand redesign; `prefers-reduced-motion` support)
- `src/app/shared/components/preloader/preloader.spec.ts` (new — none existed before)

**Deleted:**
- `src/lib/appwrite.ts`
- `src/app/auth/service/authservice.ts` + `.spec.ts`
- `src/app/auth/pages/login/login.css`, `login.css.map` (stray build artifacts)

## Change Log

- 2026-07-26: Implemented Story 1.1 end-to-end — Appwrite Labels-based auth (AD-1), functional route guards (AD-6), lazy-loaded admin/organizer route skeleton (AD-7), `user/`→`organizer/` rename, session-restore bootstrap. 20 new tests, `ng lint` clean, `ng build` succeeds. One manual pre-flight item flagged (Appwrite Console Label assignment) — see Completion Notes.
- 2026-07-26: Code review (3 independent subagents) found 7 convergent issues, all fixed — most critically, `restoreSession()`/`logout()` rethrowing errors could brick app bootstrap or block the logout redirect. Story marked `done`.
- 2026-07-26: User manual-testing found login appeared to hang on the preloader. Root cause: `Preloader` was a pre-existing incomplete stub (declared animation fields, never implemented them, never emitted `done`) — login/navigation were actually succeeding underneath a permanent full-screen overlay. Fixed with a timed animation + on-brand redesign.
- 2026-07-26: User found a real 401 in the console (expected/harmless — the pre-login session-clear step) while diagnosing; separately reported the timed-animation fix from the previous entry created an inconsistent experience between failed logins (animation completes) and successful ones (component destroyed mid-animation by navigation). Redesigned `Preloader` again, per user request, as a pure `active`-input presentational component with no internal timing at all — eliminates the whole race-condition class rather than re-tuning it.
- 2026-07-26: User requested a professional login page redesign, then separately asked to install and use Tailwind CSS. Installed Tailwind v4 (`tailwindcss`, `@tailwindcss/postcss`, `postcss`; `.postcssrc.json`; `@use 'tailwindcss'` in `styles.scss`), mapped a Tailwind `@theme` to the project's *existing* CSS custom properties (colors, fonts, spacing, radius) rather than introducing a second competing palette, then rebuilt `login.html` as a two-panel (branded desktop / form-only mobile) layout entirely in Tailwind utility classes, deleting the now-unused `login.scss`. Caught and fixed a real bug during this work: 7 of the initial `@theme` mappings (`--color-danger`, `--font-display`, `--font-body`, `--radius-sm/md/lg/full`) were circular self-references, since those exact custom property names already existed in `:root` under Tailwind's own naming convention — switched those specific entries to literal values instead of `var()`. Verified the compiled CSS contains the expected utilities resolving to the shared tokens (e.g. `.text-primary-dark{color:var(--color-primary-dark)}`). Re-verified: 44/46 tests pass (same 2 pre-existing unrelated failures), `ng lint` clean, `ng build` succeeds (styles bundle 60.70 kB, up from 38.94 kB baseline, consistent with Tailwind's Preflight + generated utilities).
- 2026-07-26: User reported the login page's field sizing/padding/alignment looked off. Root cause found: `shared/components/input/input.scss` (used by the Email field) was a **completely empty file** — its styles only existed as global, unscoped rules in `styles.scss`, and critically `.form-label` had no CSS anywhere at all (Angular view encapsulation meant the old `login.scss`'s `.form-label` rule could never have reached into the `Input` component regardless). This was a pre-existing bug, invisible before only because nothing contrasted it — the newly hand-styled Password field made the unstyled Email field's misalignment obvious. Fixed at the source: added real styles to `input.scss` (label-above-field stacking via flex column, icon positioned relative to a new inner `.input-control` wrapper instead of the whole label+field block, solid background matching the page's professional direction instead of the old glassmorphism), removed the now-dead global rules from `styles.scss`, and updated the Password field in `login.html` to match exactly (added a matching lock icon, aligned padding/label typography). Verified every "exotic" Tailwind arbitrary-value class actually compiled (e.g. `-inset-1/5`, `text-[0.85rem]`, `border-[1.5px]`) by grepping the built CSS output rather than assuming. Re-verified: 44/46 tests pass (same 2 pre-existing unrelated failures), `ng lint` clean, `ng build` succeeds.
- 2026-07-26: User reported the fix didn't work — screenshot showed the lock icon still overlapping the password placeholder text after a full dev-server restart, ruling out a stale-cache theory. Rather than continue reasoning about the CSS abstractly, set up a real, self-contained verification loop: built the app, served it locally (`python3 -m http.server`), and drove headless Chrome myself (`--headless=new --remote-debugging-port`) with a small stdlib-only WebSocket/CDP client to run `Runtime.evaluate` directly against the live page — reproduced the exact bug independently, then queried `getComputedStyle` and walked every matched CSS rule (recursing into `@layer` blocks) to find the actual winning declaration. **Root cause: a pre-existing, unlayered `*, *::before, *::after { padding: 0; margin: 0; ... }` reset in `styles.scss` (present before any of this session's work) was silently defeating every Tailwind margin/padding/border utility app-wide** — per the CSS Cascade Layers spec, any unlayered declaration beats any layered declaration regardless of specificity, and Tailwind wraps all its output in `@layer`. This wasn't a login-page bug at all; it would have silently broken Tailwind spacing/border utilities anywhere in the app. Fixed by deleting the old rule — Tailwind's own Preflight (`@layer base`) already performs the identical reset, correctly layered. Re-verified visually via a fresh headless-Chrome screenshot (icon and text no longer overlap, matches the Email field) and re-ran the full suite: 44/46 tests pass (same 2 pre-existing unrelated failures), `ng lint` clean, `ng build` succeeds.
