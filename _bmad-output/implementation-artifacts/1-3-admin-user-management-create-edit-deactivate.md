---
baseline_commit: fba8dd82d29d4d75d5f0a5c569c07969e51e8f19
---

# Story 1.3: Admin User Management — Create, Edit, Deactivate

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Admin,
I want to create, edit, and deactivate or delete user accounts with a role of Admin or Operator,
so that I control exactly who can access the system and what they can do.

## Acceptance Criteria

1. **Given** I am on the User Management screen (`admin-settings`), **when** I create a new user with Name, Email, and Role (Admin or Operator only — Family Member is deliberately not offered here, per the epic's own scope note and AD-2/AD-10), **then** the account is created and a password is auto-generated (shown once to the Admin — see Dev Notes on why "emailed" isn't literally implemented) or I set one manually (FR-USR-001), **and** a duplicate email is rejected with a clear error.
2. **Given** an existing user, **when** I edit their name, email, or role, **then** the change is saved; an email change marks the address unverified (see Dev Notes on why actually *sending* a verification email isn't achievable server-side yet); a role change routes through Story 1.2's Function (FR-USR-002).
3. **Given** an existing user, **when** I deactivate them, **then** they can no longer log in, but their historical records are untouched.
4. **Given** an existing user, **when** I delete them (with mandatory confirmation), **then** they are soft-deleted and any donation records they created are preserved and still display correctly (FR-USR-003) — see Dev Notes: this story implements "delete" via the same disable mechanism as "deactivate" since no separate Users collection/deleted-state exists yet, and the donation-preservation half of this AC isn't testable until Epic 3 ships the `donations` collection.

## Tasks / Subtasks

- [ ] Task 1: Extend the Appwrite Function into a multi-action Admin Users API (AC: 1, 2, 3, 4)
  - [ ] Rename `functions/set-role-and-permissions/src/role-writer.js` → `admin-users.js` (and its test file `role-writer.test.js` → `admin-users.test.js`); rename the exported function `setRole` → `handleAdminUsersRequest`. Update `main.js`'s import accordingly. This reflects that the Function is no longer single-purpose (AD-9 already anticipates this Function growing — Epic 2 extends it for permission derivation; this story extends it for full user lifecycle, since Appwrite's Users service — list/create/update/status — is server-only, exactly like Labels).
  - [ ] Extract the existing JWT-verification + admin-label check (currently inline in the old `setRole`) into a shared `verifyAdminCaller({ req, ClientCtor, AccountCtor })` helper that runs **once per invocation, before any action-specific logic** — preserves Story 1.2's post-review fix (auth checked before payload validation) uniformly across every action, not just the original one.
  - [ ] Parse `{ action, ...payload }` from the body (after the auth gate, same ordering rule as before). Reject with 400 if `action` isn't one of `'listUsers' | 'createUser' | 'updateUser' | 'setRole' | 'setStatus'`.
  - [ ] `listUsers`: no extra payload needed. Build the dynamic-key admin client, call `users.list()`, map to `{ id: $id, name, email, role: labels.find(l => VALID_ROLES.includes(l)) ?? null, active: status, registeredAt: registration }` for each. Returns the array as the response body.
  - [ ] `createUser`: payload `{ name, email, role, password? }`. Validate `role` is `'admin'|'operator'` (400 if not). If `password` is omitted, generate one server-side (e.g. `crypto.randomBytes(12).toString('base64url')` — Node's built-in `crypto`, no new dependency). Call `users.create({ userId: ID.unique(), email, password, name })` then `users.updateLabels({ userId, labels: [role] })` (the exact same write call Story 1.2 already built — reuse it, don't duplicate the logic). Catch a thrown `AppwriteException` with `code === 409` / `type === 'user_already_exists'` specifically and return a clear `{ error: 'A user with this email already exists' }` (409) — any other error → generic 502, same pattern as Story 1.2. On success, return `{ success: true, userId, generatedPassword }` (include `generatedPassword` only when one was auto-generated, so the caller knows whether to show a "save this password" notice).
  - [ ] `updateUser`: payload `{ userId, name?, email?, role? }`. For each provided field, call the corresponding Users-service update: `users.updateName({userId, name})`, `users.updateEmail({userId, email})` (if email changed, immediately follow with `users.updateEmailVerification({ userId, emailVerification: false })` — see Dev Notes, this marks it unverified but does **not** send anything), and if `role` provided, reuse the identical `updateLabels` call `setRole`/`createUser` already use. Wrap each in the same try/catch → 502 pattern.
  - [ ] `setStatus`: payload `{ userId, active: boolean }`. Call `users.updateStatus({ userId, status: active })`. Used for **both** "Deactivate" (AC3) and "Delete" (AC4) — see Dev Notes on why there's no separate deleted state.
  - [ ] `VALID_ROLES` and the admin-gate logic are shared across all actions — no duplication between the old single-purpose path and the new ones.

- [ ] Task 2: Extend the Data layer (AC: 1, 2, 3, 4)
  - [ ] Create `src/app/data/models/admin-user.ts`: `export interface AdminUser { id: string; name: string; email: string; role: Role | null; active: boolean; registeredAt: string; }` (import `Role` from `./role.ts`, don't redefine).
  - [ ] Extend `UserRepository` (`src/app/data/repositories/user-repository.ts`): add `listUsers(): Promise<AdminUser[]>`, `createUser(input: { name: string; email: string; role: Role; password?: string }): Promise<{ userId: string; generatedPassword?: string }>`, `updateUser(userId: string, patch: { name?: string; email?: string; role?: Role }): Promise<void>`, `setUserActive(userId: string, active: boolean): Promise<void>`. Each calls `functions.createExecution({ functionId: environment.setRoleFunctionId, body: JSON.stringify({ action: '...', ...payload }) })` and translates any failure (non-2xx `responseStatusCode` or a caught `AppwriteException`) into `RepositoryError`, exactly like the existing `changeRole()` — for `createUser`, parse `execution.responseBody` on success to extract `generatedPassword`; for the duplicate-email case, surface the Function's specific error message on the `RepositoryError` so the UI can show it inline rather than a generic failure banner. Keep the existing `changeRole()` method as-is (still used wherever a role-only change is issued).

- [ ] Task 3: Build the User Management screen (AC: 1, 2, 3, 4)
  - [ ] New route `/admin/settings`, lazy-loaded (`loadComponent`) under the existing `admin` route tree in `app.routes.ts` — already protected by the parent's `roleGuard(['admin'])`, no extra guard needed (matches the precedent from Story 1.1/AD-6/AD-7).
  - [ ] Fix `AdminLayout`'s `navItems` `Settings` entry (`src/app/feature/pages/admin/admin-layout/admin-layout.ts`) from the current placeholder `route: '/settings'` (a route that doesn't exist) to `/admin/settings`. **Do not** touch the other `navItems` entries (`Dashboard`/`Events`/`Donation`/`Report` are all similarly-broken absolute placeholder paths, but they belong to Epic 2/3/4 — out of scope here).
  - [ ] Component (new): a users table — columns Name, Email, Role (badge), Status (Active/Inactive), Actions. Populate via `UserRepository.listUsers()` into a local `signal<AdminUser[]>`, refetched after every successful mutation (no dedicated store needed — nothing else in the app consumes this list yet).
  - [ ] "Add New User" action → a form/dialog: Name, Email, Role (`Admin`/`Operator` only — no `Family Member` option, per AC1's scope note), Password (optional — leave blank to auto-generate). On submit, call `createUser()`; on the duplicate-email `RepositoryError`, show that message inline on the Email field; on success with a `generatedPassword`, show a one-time, dismissible notice ("Save this password now — it won't be shown again: ...").
  - [ ] "Edit" action per row → prefilled Name/Email/Role form; on submit, call `updateUser()` with only the changed fields.
  - [ ] "Deactivate"/"Reactivate" action per row → confirmation dialog (mandatory per PRD §10.3's "Confirm dialogs: Required for all destructive actions... deactivate user"), then `setUserActive(false)`/`setUserActive(true)`.
  - [ ] "Delete" action per row → separate mandatory confirmation dialog (its own copy, e.g. "This user will no longer be able to log in; their historical records are preserved" — distinguishing the destructive intent from the reversible "Deactivate" action even though both call the same `setUserActive(false)` underneath), then `setUserActive(false)`.
  - [ ] **Explicitly out of scope for this story** (present in `.claude/skills/plan/admin-settings.md`'s broader mockup but not required by any AC here): System Preferences / Security & Privacy / Event Settings / Notification Settings / Backup & Sync / Integrations / About & Support sections; the permissions matrix; "Reset Password" and "View Activity Log" row actions; Events-Assigned and Last-Login columns; search/filter/role-filter/status-filter controls. Build only the Create/Edit/Deactivate/Delete flows this story's ACs require.

- [ ] Task 4: Tests (AC: 1, 2, 3, 4)
  - [ ] Function (`admin-users.test.js`, extending the existing suite): unknown/missing `action` → 400 (after auth passes); the shared admin-gate still rejects a non-admin caller for at least two representative actions (not all five — avoid redundant coverage); `listUsers` maps `users.list()`'s result correctly; `createUser` happy path (explicit password), auto-generated-password path (`generatedPassword` present in response), and the 409 duplicate-email path (assert the specific error message, and that `updateLabels` is never called); `updateUser` calls `updateName`/`updateEmail`+`updateEmailVerification(false)`/role-update only for the fields actually provided; `setStatus` true and false both call `updateStatus` with the right boolean.
  - [ ] `UserRepository` (Angular vitest, `TestBed` + `FUNCTIONS` token override, same pattern as Story 1.2): one success + one `RepositoryError` case per new method (`listUsers`, `createUser`, `updateUser`, `setUserActive`); a specific case asserting `createUser`'s duplicate-email failure carries a usable message.
  - [ ] New admin-settings component tests: renders rows from a mocked `listUsers()`; create/edit/deactivate/delete each trigger the correct repository call with the right arguments; duplicate-email error renders inline; the one-time generated-password notice appears only when `generatedPassword` is present.

- [ ] Task 5: Manual deployment & live verification (AC: 1, 2, 3, 4) — same class of step as Story 1.2's Task 5, requires human Appwrite Console/CLI access to project `69c270d10029e7ed7f82`
  - [ ] Redeploy the extended Function (rename means the entrypoint file changed — re-upload/re-push).
  - [ ] Confirm the Console's execution API key scopes still cover everything the new actions need (`users.write` for create/update/status/label-writes, `users.read` for `list`/`get`).
  - [ ] Exercise all four flows against the live project: create a throwaway test user (verify it appears in Console → Auth → Users with the right Label), edit its name/email/role, deactivate it (confirm login now fails for that account), and delete it (same mechanism — confirm login still fails). Delete/deactivate the throwaway account afterward if it's not otherwise needed.
  - [ ] **Cannot be fully verified this story:** the "donation records preserved" half of AC4 — no `donations` collection exists until Epic 3. Note this explicitly as carried-forward verification debt for Epic 3 (or its retrospective) to pick up once `recordedBy` lookups against a deactivated/deleted user actually exist to test.

## Dev Notes

- **No `users` Database collection exists (verified against PRD §9.1 directly — only `events`, `donations`, `audit_logs` are defined).** Users are pure Appwrite Auth accounts; the only "role" data is the Label (AD-1). The soft-delete convention (`isDeleted`/`deletedAt`/`deletedBy`) the Architecture Spine's Consistency Conventions table describes is sourced from PRD §9.1's `donations` schema specifically — there is no equivalent for user accounts. **This story implements both "Deactivate" (AC3) and "Delete" (AC4) via the same Appwrite primitive, `users.updateStatus({userId, status: false})`** (Appwrite's only account enable/disable mechanism) — a disabled account can't log in, and since it's never hard-deleted (`users.delete()` is deliberately never called), any future `recordedBy`/`createdBy`/`assignedUserIds` reference to that `$id` stays resolvable. **Flag for the user/PM:** if a truly distinct "deleted" vs. "deactivated" state is wanted later (e.g., a separate filter tab), it needs a small dedicated Users metadata collection — genuinely out of scope for this story since the documented data model doesn't have one.
- **"Auto-generated and emailed" password (FR-USR-001) is only partially achievable as literally worded.** `node-appwrite`'s `Users.create()` accepts an optional `password` (verified directly against the installed package's `.d.ts`); if omitted, this story generates one server-side. But Appwrite has no generic "send an email" API, and no email/SMTP integration is scoped anywhere in the Architecture Spine (all Integrations are future/deferred). **Interpretation used here:** the generated password is returned once in the Function's response and shown to the Admin in the UI to communicate manually — it is not emailed to the new user. **Flag for the user/PM** if literal emailing is required — it would need a new SMTP/email-service integration, out of scope here.
- **"Sends a verification to the new address" on email change (FR-USR-002) is also only partially achievable.** Verified against `node-appwrite`'s Users service: `updateEmail()` changes the email directly with no verification step; `updateEmailVerification()` only force-sets the verified boolean, it doesn't send anything. Appwrite's actual verification-email flow (`account.createVerification({url})`) is **self-service only** — it must be called by the affected user's own authenticated session, never by an admin on their behalf. **Interpretation used here:** an admin-driven email change marks the address unverified (`updateEmailVerification(userId, false)`); actually delivering a verification email is deferred to whenever that user's own self-service "verify your email" experience exists — not scoped anywhere yet. **Flag for the user/PM.**
- **Why this extends the existing Function instead of creating a new one:** AD-9 designates one Appwrite Function as the sole writer of Labels/derived permissions; every other action this story needs (list/create/update/disable users) is *also* only possible via the server-only Users service (the client SDK's `Account` service is scoped to the current session only — it cannot list, create, or manage other users at all). This is the correct, architecturally-consistent place for that logic, not a second Function.
- **Reuse the exact `updateLabels` write path Story 1.2 built** for both `createUser`'s initial role and `updateUser`'s role-change branch — don't reimplement it.
- **`AdminLayout.navItems` has several pre-existing placeholder routes** (`Dashboard`→`/dashboard`, `Events`→`/events`, `Donation`→`/donation`, `Report`→`/report`, `Settings`→`/settings` — all absolute paths under routes that don't actually exist in `app.routes.ts`, which only has `/admin` and `/organizer` today). This story fixes only `Settings` → `/admin/settings`, since that's the one it actually builds. Do not fix the others — they belong to Epic 2 (Events), Epic 3 (Donations), Epic 4 (Report).
- **Design doc scope note:** `.claude/skills/plan/admin-settings.md` describes a full Settings screen — System Preferences, Security & Privacy, Event Settings, Notifications, Backup & Sync, Integrations, About & Support, a permissions matrix, plus "Reset Password"/"View Activity Log" row actions and table search/filter controls. Only the **User Management** section's Create/Edit/Deactivate/Delete flows are in scope for this story, matching the precedent Story 1.1 set when scoping `login-screen.md` to only its story's ACs.
- **Role dropdown offers Admin/Operator only** — Family Member is deliberately excluded (epics.md's own scope note; AD-2/AD-10: Family Members are `accessCode`-based, no account exists for them at all).
- **Layering:** the new component lives in `feature/admin/` (Presentation) and calls `UserRepository` (Data) directly — no new Domain/State store is needed for a straightforward CRUD table with a single consumer; don't introduce a `UserStore` unless a second screen needs the same list later.
- **Money/receipt/offline/sync ADs (AD-3/4/5/8) do not apply to this story.**

### Project Structure Notes

Brownfield state as of this story (confirmed by direct file reads):

- `functions/set-role-and-permissions/src/role-writer.js` — Story 1.2's single-purpose `setRole` handler, already includes the JWT-verification + admin-label-check gate and the `updateLabels` write call this story reuses. **Renamed to `admin-users.js`** in this story (see Task 1).
- `src/app/data/repositories/user-repository.ts` — currently only has `changeRole()`. Extended in this story; `changeRole()` itself is untouched.
- `src/app/data/models/role.ts` — `Role` type (Story 1.2 post-review fix). Reuse for `AdminUser.role`, don't redefine.
- `src/app/feature/pages/admin/` — only `admin-dashboard/` and `admin-layout/` exist. `admin-settings/` is new in this story.
- `src/app/feature/pages/admin/admin-layout/admin-layout.ts` — `navItems` array has 5 entries, all pointing at routes that don't exist except by coincidence of this story finally wiring one of them up (`Settings`).
- `src/app/auth/model/user.model.ts`'s `IUserProfile` (`{name, role, avatar?}`) is used by `Sidebar` for the logged-in user's own profile display — unrelated to and not reusable for the new `AdminUser` table-row type.
- No `Users` Database collection anywhere in the Appwrite project or PRD §9.1 — confirmed by direct read of the PRD's Data Model section (only `events`, `donations`, `audit_logs` are defined there).

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-1.3`] — original AC set this story implements
- [Source: `docs/DMS_Product_Requirements_Document.md`#FR-USR-001..003] — create/edit/deactivate-delete requirements
- [Source: `docs/DMS_Product_Requirements_Document.md`#9.1] — Data Model/Collections — confirms no `users` collection exists
- [Source: `docs/DMS_Product_Requirements_Document.md`#10.3] — "Confirm dialogs: Required for all destructive actions... deactivate user"
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md`#AD-9] — one Function, extended here for user lifecycle actions
- [Source: ARCHITECTURE-SPINE.md#AD-2, #AD-10] — Family Members are accessCode-based, no account
- [Source: ARCHITECTURE-SPINE.md#Consistency-Conventions] — soft-delete convention's actual scope (donations only)
- [Source: `.claude/skills/plan/admin-settings.md`] — screen content reference; User Management section only is in scope, see Task 3's explicit exclusions
- [Source: `_bmad-output/implementation-artifacts/1-2-server-side-role-writer-appwrite-function.md`] — Function pattern, `UserRepository`/`RepositoryError` conventions, `Role` type location, `FUNCTIONS` InjectionToken, post-review auth-before-validation ordering fix (generalized to all actions here)
- External (verified directly against the installed `node-appwrite` package's `.d.ts` files in `functions/set-role-and-permissions/node_modules/`, current as of 2026-07-27): `Users.create({userId, email?, phone?, password?, name?})` (password optional), `Users.list(queries?, search?)`, `Users.updateEmail({userId, email})`, `Users.updateEmailVerification({userId, emailVerification})`, `Users.updateName({userId, name})`, `Users.updateStatus({userId, status})`. Duplicate-email creation throws a 409 `AppwriteException` with `type: 'user_already_exists'` — confirmed via Appwrite community threads (e.g. https://appwrite.io/threads/1217304808545976380).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
