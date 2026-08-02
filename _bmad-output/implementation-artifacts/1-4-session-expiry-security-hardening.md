---
baseline_commit: 9646d31fe58e2594053a9be81fb412029f20be63
---

# Story 1.4: Session Expiry & Security Hardening

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the system,
I want sessions to expire after inactivity, sessions to renew while active, and Admin to be able to force-expire a specific user's sessions,
so that stale or compromised sessions can't be abused.

## Acceptance Criteria

1. **Given** a logged-in user with no recorded activity for 8 hours, **when** they next attempt a guarded navigation, **then** their session is treated as expired — the app calls `logout()` and redirects them to `/login` (FR-SEC-005) — see Dev Notes: Appwrite has no native inactivity/idle-timeout concept (only a fixed absolute session-duration project policy, currently 365 days), so this is enforced client-side via a tracked last-activity timestamp checked at every route guard evaluation.
2. **Given** an active session (activity recorded within the last 8 hours), **when** a renewal check runs and at least 30 minutes have passed since the session was last renewed, **then** `account.updateSession('current')` is called to extend the session's expiry — see Dev Notes: "refresh tokens are rotated" (FR-SEC-005) doesn't literally apply to Appwrite email/password sessions (no distinct access/refresh token pair exists, unlike OAuth2 sessions) — this is the closest achievable equivalent, flagged for PM.
3. **Given** an Admin viewing the User Management screen (`admin-settings`), **when** they trigger "Force sign-out" on a user (with mandatory confirmation, per PRD §10.3), **then** all of that user's active sessions end immediately across every device, via the Users service's server-only `deleteSessions` — reusing the Story 1.2/1.3 Function pattern. An admin cannot force-expire their own sessions (would immediately invalidate the very session driving the request — same self-target precedent Story 1.3 established for `setStatus`/role changes).
4. **Given** the app is deployed, **when** verified as part of this story's Definition of Done, **then** it is served over HTTPS only, with HTTP redirected (FR-SEC-001) — a hosting/deployment check, not application code. **Not actionable yet:** no hosting target for the Angular app exists in this repo (no `vercel.json`/`netlify.toml`/`firebase.json`/Appwrite Sites config) — carry forward until a hosting platform is chosen. Appwrite Cloud's own API endpoints are already HTTPS-only by default, so the "Appwrite API calls use HTTPS" half of FR-SEC-001 is satisfied automatically and needs no story work.

## Tasks / Subtasks

- [x] Task 1: Client-side idle-timeout session expiry (AC: 1)
  - [x] In `src/app/data/services/auth.service.ts`, add a module constant `IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000` (8 hours).
  - [x] Add a `lastActivityAt` signal to `AuthService`, persisted to `localStorage` under a new key (e.g. `givio:lastActivityAt`, first localStorage usage in this codebase — storing only a plain numeric timestamp, not a credential, so it doesn't conflict with FR-AUTH-002's "no session token in localStorage" rule). **Initialize the signal by reading the persisted value on construction** (fall back to `Date.now()` only if nothing is persisted yet, e.g. a brand-new device) — critical: this is what makes idle expiry survive a page reload. A user idle for 9 hours who then reloads the tab must still be found expired; if construction reset the clock to "now" instead of reading the persisted value, a simple reload would silently erase the entire idle window.
  - [x] Add `recordActivity(): void` — sets `lastActivityAt` to `Date.now()` and writes it to `localStorage`. Call this from `login()` on success (a brand-new session always starts with a clean idle window) and from the activity listeners/guard below (Task 1's last two bullets). **Do NOT call it from `restoreSession()`** — `restoreSession()` runs once on every app bootstrap (including a plain page reload), so calling `recordActivity()` there would reset an already-9-hours-stale idle clock back to "just now" on every reload, defeating the persisted-timestamp read above. Leaving `restoreSession()` untouched means the persisted (possibly stale) value is exactly what the first post-reload guard check sees.
  - [x] Add `isSessionExpired(): boolean` — `Date.now() - this.lastActivityAt() > IDLE_TIMEOUT_MS`.
  - [x] Add `registerActivityListeners(): void` — attaches `window.addEventListener('click', ...)` and `('keydown', ...)` (passive), each calling `recordActivity()` but throttled to at most once per minute (a simple "if less than 60s since last recorded activity, skip" check) so a user actively interacting with the page (e.g. filling a long form without navigating) doesn't get logged out merely for not navigating, and so we don't write to `localStorage` on every keystroke. Call this once from `app.config.ts`'s `provideAppInitializer`, alongside the existing `restoreSession()` call — **do not** duplicate the existing `provideServiceWorker` calls in that file when editing it (pre-existing duplication, out of scope for this story, don't touch).
  - [x] In `src/app/auth/guards/role.guard.ts`, add `sessionExpiryGuard: CanActivateFn`: if `authService.isAuthenticated()` is false, return `true` (pass through — `authGuard`/`roleGuard` elsewhere handle the unauthenticated case). If authenticated and `authService.isSessionExpired()`, call `await authService.logout()` then return `router.createUrlTree(['/login'])`. Otherwise call `authService.recordActivity()` (this navigation itself counts as activity) and return `true`.
  - [x] In `src/app/app.routes.ts`, add `sessionExpiryGuard` to the `canActivate` array (alongside the existing `roleGuard(...)`) on both the `admin` and `organizer` top-level routes — not on `login` (already gated by `redirectIfAuthenticatedGuard`, and an idle-expired session has no meaningful "activity" to protect there).

- [x] Task 2: Session renewal on activity (AC: 2)
  - [x] Add `SESSION_RENEW_INTERVAL_MS = 30 * 60 * 1000` (30 min) constant and an in-memory `lastRenewedAt` (implemented as a plain private field, not a signal — nothing reads it reactively/in a template, so a signal would add no value) to `AuthService`.
  - [x] Add `async maybeRenewSession(): Promise<void>` — if `Date.now() - this.lastRenewedAt < SESSION_RENEW_INTERVAL_MS`, return immediately. Otherwise call `await this.account.updateSession({ sessionId: 'current' })` in a try/catch (swallow failures the same way `restoreSession`/`logout` do — a renewal failure shouldn't crash navigation), then set `lastRenewedAt` to `Date.now()` on success.
  - [x] Call `authService.maybeRenewSession()` (fire-and-forget, don't block navigation on it) from `sessionExpiryGuard`, in the same branch that calls `recordActivity()` (i.e., only when the session is NOT expired).

- [x] Task 3: Admin "Force sign-out" action (AC: 3)
  - [x] `functions/set-role-and-permissions/src/admin-users.js`: added `'forceExpireSessions'` to the `ACTIONS` array. Added a `validatePayload` case: requires `hasValue(userId)`; reject with 400 if `userId === caller.$id` (extracted a shared `rejectSelfTarget()` helper, reused by `setStatus`/`updateUser` too — see Completion Notes for why). Added `handleForceExpireSessions({ UsersCtor, adminClient, payload, error })`: calls `new UsersCtor(adminClient).deleteSessions({ userId })` in a try/catch → `502` on failure, else `200 { success: true, userId }`. Wired into the `switch (action)` dispatch.
  - [x] `src/app/data/repositories/user-repository.ts`: added `async forceExpireSessions(userId: string): Promise<void>` — same `invoke()` pattern as `setUserActive`.
  - [x] `src/app/feature/pages/admin/admin-settings/admin-settings.ts`: extended `ConfirmAction` to include `'forceExpireSessions'`, added `requestForceExpireSessions()`, and `confirmActionSubmit()` branches to call `forceExpireSessions()` instead of `setUserActive` for that action.
  - [x] `src/app/feature/pages/admin/admin-settings/admin-settings.html`: added the "Force sign-out" button and a third confirm-dialog copy branch (converted the prior `@if/@else` to `@if/@else if/@else`).

- [x] Task 4: Tests (AC: 1, 2, 3)
  - [x] `admin-users.test.js`: unauthorized/non-admin rejection for `forceExpireSessions`; self-target rejection (400); success calls `deleteSessions({ userId })` with the right ID; a thrown error from `deleteSessions` returns 502.
  - [x] `auth.service.spec.ts`: extended the `account` mock with `updateSession: vi.fn()`. Used jsdom's real `localStorage` (available natively in this project's vitest/jsdom test environment) with `localStorage.clear()` in `beforeEach`, rather than a hand-rolled mock — simpler and exercises the actual Storage API. New tests: `recordActivity()` updates the persisted timestamp; `isSessionExpired()` false right after `login()`, true 8h+ after the last recorded activity (`vi.useFakeTimers()`/`vi.setSystemTime()`); `restoreSession()` does NOT reset a stale persisted timestamp (required `TestBed.resetTestingModule()` + reconfigure mid-test to force a fresh `AuthService` instance, since `providedIn:'root'` singletons are cached per TestBed module); `maybeRenewSession()` throttle (calls at t=0, skips at t=+5min, calls again at t=+31min) and swallows a rejected `updateSession`.
  - [x] `role.guard.spec.ts`: `sessionExpiryGuard` allows an unauthenticated caller through; allows an authenticated, non-idle caller through and records activity; for an idle-expired authenticated caller, returns a `UrlTree` to `/login` and calls `logout()`. Also needed `localStorage.clear()` in `beforeEach` — same cross-test leakage risk as above.
  - [x] `user-repository.spec.ts`: `forceExpireSessions` success + `RepositoryError` path.
  - [x] `admin-settings.spec.ts`: clicking "Force sign-out" opens the confirm dialog with the `forceExpireSessions` target; confirming calls `forceExpireSessions` (not `setUserActive`); cancel clears the target without calling the repository.

- [ ] Task 5: Manual deployment & live verification (AC: 1, 2, 3, 4) — same class of step as Stories 1.2/1.3's Task 5, requires human Appwrite Console/CLI access to project `69c270d10029e7ed7f82`
  - [ ] Redeploy the extended Function (new `forceExpireSessions` action) via the `dev` branch VCS pipeline (see Story 1.3's Task 5 for the exact `appwrite-cli functions get`/`push` sequence and the config-drift check it uncovered — verify the remote config hasn't drifted again before pushing).
  - [ ] Live-verify AC3: create a throwaway test user, log in as them in a second browser/incognito context to establish a real session, then as Admin trigger "Force sign-out" on that user and confirm the second context's session is now invalid (e.g. their next `account.get()` call 401s).
  - [ ] Live-verify AC1/AC2 as far as practical without waiting 8 real hours: confirm `localStorage`'s `givio:lastActivityAt` key updates on navigation/interaction, and confirm `account.updateSession` fires (check Network tab) after artificially setting `lastActivityAt` far enough in the past (e.g. via DevTools) to cross the 30-minute renewal threshold but not the 8-hour expiry one. Full 8-hour expiry is impractical to verify live in one sitting — note as accepted verification debt (unit/fake-timer tests from Task 4 are the primary coverage for the exact 8-hour boundary).
  - [ ] **Cannot be verified this story:** AC4 (HTTPS enforcement) — no hosting target exists yet for the Angular app. Carry forward until a hosting platform (Vercel/Netlify/Firebase/Appwrite Sites/other) is chosen and deployed.

## Dev Notes

- **Appwrite has no built-in idle/inactivity session timeout.** Verified directly against the live project's policies (`appwrite-cli project list-policies --project-id 69c270d10029e7ed7f82`): `session-duration` is a single fixed **365-day** absolute policy, project-wide — there's no per-session sliding/idle window concept, and no server-side way to configure "expire after N hours of no activity." **This story implements the 8-hour idle rule entirely client-side** via a tracked last-activity timestamp checked at route-guard time. This does NOT touch the Appwrite project's `session-duration` policy — that stays at its current (long) value; the client-side idle check is the actual enforcement mechanism, and it's strictly tighter than the project policy so it always fires first.
- **"Refresh tokens are rotated on each use" (FR-SEC-005) doesn't map onto Appwrite's actual session model for email/password auth.** Verified against `node_modules/appwrite/types/services/account.d.ts` and `types/models.d.ts`: a `Models.Session` has a single opaque secret and one `expire` ISO timestamp — there is no distinct access/refresh token pair the way OAuth2 sessions have (`providerAccessToken`/`providerRefreshToken` exist only on `Session`, and only for sessions created via `createOAuth2Session`, not `createEmailPasswordSession`). `account.updateSession({sessionId: 'current'})` is Appwrite's own mechanism for "extend a session's length" (its doc comment: "Use this endpoint to extend a session's length. Extending a session is useful when session expiry is short"), and is explicitly documented as safe to call on every visit but rate-limited if called too often — hence the 30-minute throttle in Task 2. **Interpretation used here:** periodic `updateSession` calls are the closest achievable equivalent to "rotation" for this auth method. **Flag for the user/PM** if literal access/refresh-token rotation (OAuth2-style) is required — it isn't achievable with Appwrite's email/password session model as it exists today.
- **Force-expiring a specific user's sessions (AC3) is only possible server-side**, same reasoning as every other admin action in Story 1.2/1.3: `Users.deleteSessions({userId})` (verified against `functions/set-role-and-permissions/node_modules/node-appwrite/dist/services/users.d.ts`) is part of the server-only Users service; the client SDK's `Account` service can only ever act on the caller's own session (`deleteSession`/`deleteSessions` with no arguments = "all of my own sessions"). This is why the action is added to the existing `admin-users.js` Function (AD-9's "one Function" pattern, already extended twice — Story 1.2 for role-writing, Story 1.3 for full user lifecycle) rather than a new Function.
- **Self-target block for `forceExpireSessions`:** an Admin calling this on their own `userId` would immediately invalidate the very session that's driving the admin UI request — a confusing, easy-to-trigger accident, not a useful feature (an admin who wants to log themselves out already has a normal logout button). Blocked with the same `userId === caller.$id` check Story 1.3 established for `setStatus`/role changes in `validatePayload`.
- **Where the idle-check lives:** `AuthService` already is "the" cross-cutting auth/session state per the Architecture Spine ("All cross-cutting auth/session state lives in `AuthService`") — this story extends it rather than introducing a new store/service, consistent with Story 1.3's precedent of not introducing new abstractions (`UserStore`) that only one consumer needs.
- **Guard composition:** `sessionExpiryGuard` is a new, separate `CanActivateFn` (in the same `role.guard.ts` file as `authGuard`/`roleGuard`/`redirectIfAuthenticatedGuard`) added alongside `roleGuard(...)` in each protected route's `canActivate` array — it is NOT merged into `roleGuard`'s body, since `roleGuard` is parameterized per-route (`roleGuard(['admin'])` vs `roleGuard(['operator'])`) and the idle check is identical for both; keeping it separate avoids duplicating the idle logic across both calls.
- **AC1's "when they next attempt an action" is interpreted as "next guarded navigation attempt"**, not literally every in-page interaction (e.g. clicking a button that doesn't navigate). This matches how the existing guards already gate access (`authGuard`/`roleGuard` only run on navigation) and avoids wrapping every repository/mutation call-site in an idle check. **Flag for the user/PM** if a stricter interpretation (any mutating action, not just navigation) turns out to matter in practice.
- **AC4 (HTTPS) is out of application-code scope and not currently actionable** — confirmed no hosting config exists anywhere in the repo (`vercel.json`, `netlify.toml`, `firebase.json`, or an Appwrite Sites entry in `appwrite.json`). This is carried forward as deployment/DoD debt until a hosting decision is made; Appwrite Cloud's own endpoints are already HTTPS-only, so nothing on that half needs work.
- **Reload-survival is the whole point of persisting `lastActivityAt`:** the signal must be *initialized* from `localStorage` (constructor-time read), while `recordActivity()` (the *write* path) is only called from a fresh `login()` and from genuine user interaction (guard navigations, window listeners) — never from `restoreSession()`. Getting this backwards (e.g. resetting the clock on every `restoreSession()` call) would let a simple page reload silently erase an already-expired idle window, defeating AC1 entirely.
- **`localStorage` usage is new to this codebase** (grep confirms zero existing usages) — only a plain numeric timestamp is stored, never a session token/credential, so this doesn't conflict with FR-AUTH-002 / AD-1's existing "no hand-rolled token storage" conventions (session persistence itself still relies entirely on the Appwrite SDK's own cookie handling, per the Architecture Spine's State & cross-cutting row).
- **Money/receipt/offline/sync ADs (AD-3/4/5/8) and event-scoped permission ADs (AD-2/AD-10) do not apply to this story.**

### Project Structure Notes

Brownfield state as of this story (confirmed by direct file reads):

- `src/app/data/services/auth.service.ts` — currently exposes `login`/`logout`/`restoreSession` plus `currentUser`/`role`/`isAuthenticated` signals reading from the injected `ACCOUNT` token (`Account` from the `appwrite` client SDK, via `src/app/data/appwrite/client.ts`). This story adds `lastActivityAt`/`lastRenewedAt` signals, `recordActivity`/`isSessionExpired`/`maybeRenewSession`/`registerActivityListeners` methods. No existing method signatures change.
- `src/app/auth/guards/role.guard.ts` — currently exports `authGuard`, `roleGuard(allowedRoles)`, `redirectIfAuthenticatedGuard`, all plain `CanActivateFn`s reading `AuthService` via `inject()`. This story adds a fourth, `sessionExpiryGuard`, following the exact same shape.
- `src/app/app.routes.ts` — `admin` and `organizer` routes currently have `canActivate: [roleGuard([...])]`; this story changes both to `canActivate: [sessionExpiryGuard, roleGuard([...])]`. `login`'s `canActivate: [redirectIfAuthenticatedGuard]` is untouched.
- `src/app/app.config.ts` — currently has one `provideAppInitializer` calling `inject(AuthService).restoreSession()`, plus **two duplicate** `provideServiceWorker(...)` calls (pre-existing bug, not introduced by this story — do not fix as a drive-by change; out of scope).
- `functions/set-role-and-permissions/src/admin-users.js` — a 4-action dispatcher (`listUsers`/`createUser`/`updateUser`/`setStatus`) behind one shared `verifyAdminCaller` gate, established across Stories 1.2/1.3. This story adds a 5th action, `forceExpireSessions`, following the identical `validatePayload` → dynamic-key check → `switch (action)` → handler shape every other action already uses.
- `src/app/data/repositories/user-repository.ts` — has `listUsers`/`createUser`/`updateUser`/`setUserActive`, each a thin wrapper around a shared private `invoke(action, failureMessage, payload)` helper that calls the Function and maps errors to `RepositoryError`. This story adds `forceExpireSessions` as a fifth thin wrapper — no changes to `invoke()` itself needed.
- `src/app/feature/pages/admin/admin-settings/admin-settings.ts`/`.html` — table + create/edit dialog + a single shared deactivate/reactivate confirm dialog (`ConfirmAction = 'deactivate' | 'reactivate'`). This story extends the union and the confirm-dialog template with a third branch; no new dialog component needed (matches Story 1.3's precedent of plain `@if`-based overlays, no dedicated `Dialog` abstraction).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-1.4`] — original AC set this story implements
- [Source: `docs/DMS_Product_Requirements_Document.md`#FR-SEC-001, #FR-SEC-005] — HTTPS and session-management requirements
- [Source: `docs/DMS_Product_Requirements_Document.md`#10.3] — confirm-dialog requirement for destructive actions (applies to Force sign-out)
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md`#AD-1] — Labels as sole role source, `AuthService` as the cross-cutting session-state owner
- [Source: ARCHITECTURE-SPINE.md#AD-6] — functional, assignment-scoped route guards (pattern `sessionExpiryGuard` follows)
- [Source: ARCHITECTURE-SPINE.md#AD-9] — one Appwrite Function is the sole writer/actor for Users-service actions (this story's 5th action)
- [Source: `_bmad-output/implementation-artifacts/1-3-admin-user-management-create-edit-deactivate.md`] — `admin-users.js` dispatcher pattern, `UserRepository`/`RepositoryError` conventions, self-target-block precedent, confirm-dialog shell, live-verification Task 5 pattern (including the config-drift issue it uncovered)
- External (verified directly, current as of 2026-08-02): `node_modules/appwrite/types/services/account.d.ts` — `updateSession`, `Session.expire`, OAuth-only `providerAccessToken`/`providerRefreshToken` fields; `functions/set-role-and-permissions/node_modules/node-appwrite/dist/services/users.d.ts` — `Users.deleteSessions({userId})`; live project policy check via `appwrite-cli project list-policies --project-id 69c270d10029e7ed7f82` — `session-duration` = 31536000s (365d), confirming no native idle-timeout exists.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `validatePayload`'s switch statement (post-`forceExpireSessions` addition) tripped a SonarQube cognitive-complexity lint finding (19 vs. 15 allowed). Refactored to a `PAYLOAD_VALIDATORS` lookup object of small per-action functions plus a shared `rejectSelfTarget()` helper (deduping the identical self-target check across `setStatus`/`updateUser`/`forceExpireSessions`), instead of the story's originally-sketched inline switch/if-chain. Behavior is identical — all 33 Function tests (including the pre-existing Story 1.3 ones) still pass unchanged.
- One test-authoring bug caught and fixed during Task 4: `TestBed.inject(AuthService)` inside a test returns the singleton already constructed in the outer `beforeEach`, not a fresh instance — a test asserting "constructor reads a stale localStorage value" needs `TestBed.resetTestingModule()` + reconfigure first, or it silently asserts against the wrong instance.
- A related cross-test leakage bug: `localStorage` persists across tests within the same spec file (real jsdom Storage), so an earlier test's `recordActivity()` call left a real, recent timestamp that corrupted a later test's fake-timers-based expiry calculation into a false negative. Fixed by adding `localStorage.clear()` to `beforeEach` in both `auth.service.spec.ts` and `role.guard.spec.ts`.

### Completion Notes List

- Ultimate context engine analysis completed — comprehensive developer guide created.
- Tasks 1–4 complete: idle-timeout expiry (8h, `localStorage`-persisted, guard-enforced), throttled session renewal via `updateSession`, and the `forceExpireSessions` Admin action (Function + repository + UI) are all implemented and tested. Function suite: 33/33 (up from 29, +4 new). Angular suite: 79/81 passing (up from 64/66, +15 new), same 2 pre-existing unrelated failures (`app.spec.ts`, `stat-card.spec.ts`) as every prior story. `ng lint` clean, `ng build` succeeds.
- **Task 5 (manual deployment + live verification) intentionally left unchecked** — same class of exception as Stories 1.2/1.3: requires human Appwrite Console/CLI access to redeploy the extended Function and exercise `forceExpireSessions` against a real second session. The 8-hour idle boundary itself is impractical to verify live in one sitting; the fake-timers unit tests in Task 4 are the primary coverage for that exact boundary.
- AC4 (HTTPS enforcement) remains not-yet-actionable per this story's Dev Notes — no hosting target exists for the Angular app in this repo.
- Status set to `review`, not `done` — mirrors Story 1.3's precedent exactly (Task 5 completed live in the same session, moving to `done` afterward).

### File List

**Added:**
- `src/app/data/services/auth.service.ts` (renamed from `src/app/data/stores/auth-store.ts` — see the separate `AuthStore`→`AuthService` rename commit made just before this story's implementation began, unrelated to this story's own scope)
- `src/app/data/services/auth.service.spec.ts` (renamed alongside)

**Modified:**
- `src/app/data/services/auth.service.ts` — added `IDLE_TIMEOUT_MS`, `SESSION_RENEW_INTERVAL_MS`, `_lastActivityAt` signal (localStorage-backed), `lastRenewedAt` field, `recordActivity()`, `isSessionExpired()`, `registerActivityListeners()`, `maybeRenewSession()`; `login()` now calls `recordActivity()` on success
- `src/app/data/services/auth.service.spec.ts` — 8 new tests (recordActivity, isSessionExpired x2, restoreSession-doesn't-reset, maybeRenewSession x4)
- `src/app/auth/guards/role.guard.ts` — added `sessionExpiryGuard`
- `src/app/auth/guards/role.guard.spec.ts` — 3 new tests, `localStorage.clear()` added to `beforeEach`
- `src/app/app.routes.ts` — added `sessionExpiryGuard` to `admin`/`organizer` routes' `canActivate`
- `src/app/app.config.ts` — `provideAppInitializer` now also calls `registerActivityListeners()`
- `functions/set-role-and-permissions/src/admin-users.js` — added `forceExpireSessions` action; refactored `validatePayload` into the `PAYLOAD_VALIDATORS` lookup + `rejectSelfTarget()` helper
- `functions/set-role-and-permissions/tests/admin-users.test.js` — 4 new tests, `deleteSessions` added to the fake `UsersCtor`
- `src/app/data/repositories/user-repository.ts` — added `forceExpireSessions()`
- `src/app/data/repositories/user-repository.spec.ts` — 2 new tests
- `src/app/feature/pages/admin/admin-settings/admin-settings.ts` — extended `ConfirmAction`, added `requestForceExpireSessions()`, branched `confirmActionSubmit()`
- `src/app/feature/pages/admin/admin-settings/admin-settings.html` — added the "Force sign-out" button and third confirm-dialog branch
- `src/app/feature/pages/admin/admin-settings/admin-settings.spec.ts` — 2 new tests

## Change Log

- 2026-08-02: Implemented Story 1.4 Tasks 1–4 — client-side 8-hour idle-timeout session expiry (`localStorage`-persisted, enforced via new `sessionExpiryGuard`), throttled session renewal via `account.updateSession`, and a new `forceExpireSessions` Admin action (Function + `UserRepository` + `AdminSettings` UI, with a self-target safeguard). Refactored the Function's `validatePayload` into a `PAYLOAD_VALIDATORS` lookup to resolve a cognitive-complexity lint finding triggered by the new action. Function suite 33/33; Angular suite 79/81 (same 2 pre-existing unrelated failures as every prior story); `ng lint` clean; `ng build` succeeds. Task 5 (live deployment + verification) explicitly deferred — requires human Appwrite Console/CLI access, same as Stories 1.2/1.3.
