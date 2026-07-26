---
baseline_commit: 95cae6ba0109fc13575f0900e0ffa056d13d2196
---

# Story 1.1: Secure Login & Role-Guarded Dashboard Landing

Status: in-progress

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

- [ ] Task 1: Build the Data layer's Appwrite client (AC: 1, 2, 6)
  - [ ] Create `src/app/data/appwrite/client.ts`: instantiate `Client`/`Account` reading `endpoint`/`project` from `src/environments/environment.ts` (not hardcoded)
  - [ ] Delete `src/lib/appwrite.ts` (superseded — its only consumer, `login.ts`, is rewritten in Task 3)
- [ ] Task 2: Build `AuthStore` (AC: 1, 2, 3, 5, 6)
  - [ ] Create `src/app/data/stores/auth-store.ts`, `providedIn: 'root'`, using signals (no NgRx)
  - [ ] Signals: `currentUser` (Appwrite `Models.User<Models.Preferences> | null`), `role` as `computed()` from `currentUser()?.labels` (`'admin' | 'operator' | null` — a user with no matching label is unauthenticated-for-role purposes even if they have a valid session)
  - [ ] Methods: `login(email, password)`, `logout()`, `restoreSession()` (calls `account.get()`, catches the 401 when no session exists, sets `currentUser` accordingly)
  - [ ] Delete `src/app/auth/service/authservice.ts` and its spec — confirmed empty, unused stub superseded by `AuthStore`
- [ ] Task 3: Rewrite the login screen against `AuthStore` (AC: 1, 2, 3)
  - [ ] Update `src/app/auth/pages/login/login.ts`: remove the local `IUserPrefs` interface and all direct `account.*` calls; call `AuthStore.login()`; on success, navigate based on `authStore.role()` (`'admin'` → `/admin`, `'operator'` → `/organizer`); on failure, show a generic "Invalid credentials" message (never reveal which field was wrong)
  - [ ] Match `.claude/skills/plan/login-screen.md` for this story's in-scope elements only: branding/tagline, "Welcome Back", email/password fields with validation, show/hide password toggle (already implemented), Sign In button, loading state, error message area. Out of scope for this story (do not build): "Remember me", "Forgot password", social login buttons, "Sign Up" link, footer legal links — none are in the PRD or any FR/AD for this story; skip them rather than guessing at behavior.
  - [ ] Delete the stray `login.css`/`login.css.map` files alongside `login.scss` — committed build output, not source
- [ ] Task 4: Functional route guards (AC: 4)
  - [ ] Create `src/app/auth/guards/role.guard.ts`: a `CanActivateFn` factory `roleGuard(allowedRoles: Array<'admin'|'operator'>)` that injects `AuthStore` + `Router`, returns `true` if `role()` is in `allowedRoles`, else a `UrlTree` back to `/login` — **always redirect to `/login` for both the unauthenticated and wrong-role cases** (a dedicated "Access Denied" page doesn't exist yet and isn't in this story's scope; don't build one)
  - [ ] Also add a plain `authGuard: CanActivateFn` (any authenticated role) for routes that don't need role-specific restriction yet
- [ ] Task 5: Lazy-loaded, guarded route skeleton (AC: 1, 2, 4)
  - [ ] Rewrite `src/app/app.routes.ts` to use `loadComponent`/`loadChildren` (AD-7) instead of eager `component:` references, for `login`, the `admin` tree, and the `organizer` tree
  - [ ] Apply `roleGuard(['admin'])` to the admin tree's route(s) and `roleGuard(['operator'])` to the organizer tree's route(s)
  - [ ] Rename `src/app/feature/pages/user/` → `src/app/feature/pages/organizer/` (`user-layout` → `organizer-layout`, `user-dashboard` → `organizer-dashboard`, including class names, selectors, and `.spec.ts` filenames/`describe()` strings — rename fully, don't leave any `User*`-named file or symbol behind), matching the Architecture Spine's structural seed. Update `OrganizerLayout` to import `RouterOutlet` and render a child route the way `AdminLayout` already does (today `UserLayout` has neither — this is a pre-existing inconsistency this story fixes, not new scope creep, since a working nested route is required for AC 2/4 to be testable at all)
  - [ ] Route paths: keep `admin`/`organizer` as the top-level segments referenced in this story's ACs (do not reuse the old `/admin-dashboard`, `/user-dashboard` paths — those were placeholders; picking clean role-named segments now avoids a rename later)
- [ ] Task 6: Session restore at bootstrap (AC: 6)
  - [ ] In `src/app/app.config.ts`, add `provideAppInitializer(...)` calling `AuthStore.restoreSession()` before the router activates, so a page refresh with a still-valid Appwrite session doesn't spuriously redirect to `/login`
  - [ ] Do **not** touch the pre-existing duplicated `provideServiceWorker(...)` call in this file — that is explicitly Story 5.2's fix, out of scope here; leave it exactly as-is to avoid unrelated diff noise
- [ ] Task 7: Tests
  - [ ] `AuthStore`: unit tests for `login()` success/failure, `role()` computed from labels, `logout()` clearing state, `restoreSession()` handling both a valid session and a 401
  - [ ] `role.guard.ts`: unit tests for allowed role (passes), disallowed role (redirects), unauthenticated (redirects)
  - [ ] `login.ts`: component test for the generic-error-message behavior and role-based navigation after a mocked successful login
  - [ ] Manual verification: since no admin/operator account exists yet with a Label (Story 1.2/1.3 build the in-app way to set one), manually add an `admin` and an `operator` Label to two test accounts via the Appwrite Console (Auth → Users → select user → Labels) before testing this story end-to-end

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
