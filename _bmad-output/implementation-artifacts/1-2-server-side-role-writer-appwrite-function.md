---
baseline_commit: fd528e07833dde570606df25a32e96bbdbab9ed2
---

# Story 1.2: Server-Side Role Writer (Appwrite Function)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Admin,
I want role changes to go through one trusted server-side Function rather than any client-writable mechanism,
so that no user — including a compromised or malicious client — can grant themselves elevated access.

## Acceptance Criteria

1. **Given** I am authenticated as an Admin, **when** a role-change request for a target user is submitted through `data/repositories` (exercised directly for this story — Story 1.3 wires a full User Management table to this same call), **then** the request is sent to the one Appwrite Function (never a direct client-side Label write, per AD-9), **and** the Function verifies the caller holds `Role.label('admin')` before applying the change, **and** the target user's Appwrite Label is updated, taking effect on their next login (per FR-USR-002).
2. **Given** a non-Admin user, **when** they attempt to invoke the Function directly (e.g. via API tooling, bypassing the UI), **then** the Function rejects the call.
3. **Given** the Function has just been deployed, **when** this story is verified, **then** it is tested end-to-end against the real provisioned Appwrite Cloud project (`69c270d10029e7ed7f82`), not a mock (Cross-Cutting DoD).

## Tasks / Subtasks

- [x] Task 1: Scaffold the Appwrite Function project (AC: 1, 2, 3)
  - [x] Create `functions/set-role-and-permissions/` at repo root, per the Architecture Spine's Structural Seed — a standalone Node project, **not** part of the Angular workspace: its own `package.json` (with `node-appwrite` as a dependency — this package must never appear in the root `package.json`, it's server-only and would otherwise leak into the browser bundle), its own `.gitignore` for `node_modules`.
  - [x] Entry point `src/main.js`, exporting `export default async ({ req, res, log, error }) => { ... }` — current Appwrite Functions context-object signature (confirm against the Appwrite Console's function template when the Function is first created there, since this is a spot where the SDK/runtime API is most likely to have moved since training).
  - [x] Add `appwrite.json` (repo root or alongside the function) declaring: `functionId` (placeholder until deployed — see Task 5), `name: set-role-and-permissions`, `runtime: node-22`, `entrypoint: src/main.js`, `execute: ["users"]`.
  - [x] **Do not** set `execute` to an admin-only role (e.g. `label:admin`) at the platform level — AC2 and AD-9 both require the *Function's own code* to reject non-admins (Task 2), not Appwrite's execute ACL. `execute: ["users"]` lets any authenticated account attempt the call so the in-function rejection path is actually exercised and testable.

- [x] Task 2: Implement caller-verification + Label-write logic (AC: 1, 2)
  - [x] Parse the request body (`JSON.parse(req.bodyRaw || '{}')`) for `{ userId: string; role: 'admin' | 'operator' }`. Reject with 400 if `role` is anything other than exactly `'admin'` or `'operator'` — the Function must never write an arbitrary label string.
  - [x] Read `req.headers['x-appwrite-user-jwt']`. If absent, return 401 — the request wasn't made by an authenticated Appwrite user.
  - [x] **Never trust `req.headers['x-appwrite-user-id']` alone** — it can be spoofed by direct API calls. Build a `node-appwrite` `Client` scoped with `.setJWT(jwt)`, instantiate `Account`, and call `account.get()`. A forged/expired JWT causes this call itself to throw (catch and return 401) — this is what actually verifies the caller's identity and current labels.
  - [x] Check `admin` is in the resulting `account.get()` response's `labels`. If not, return 403 (this is what satisfies AC2 — "the Function rejects the call").
  - [x] Only once the caller is verified-admin: build a **second** `node-appwrite` `Client`, scoped with the per-execution dynamic API key from `req.headers['x-appwrite-key']` (short-lived, scoped to the Function's configured execution scopes — do not create or store a static long-lived API key for this instead). Instantiate `Users`, call `users.updateLabels({ userId, labels: [role] })` — this is the only code path anywhere in the system that ever writes a Label (AD-9).
  - [x] Wrap the `updateLabels` call in try/catch; on a thrown `AppwriteException` (e.g. `userId` doesn't exist), return a structured error response — never let it surface as an unhandled 500 with a raw stack trace.
  - [x] Return `res.json({ success: true, userId, role })` on success.

- [x] Task 3: Client-side repository layer (AC: 1)
  - [x] Extend `src/app/data/appwrite/client.ts`: add a `FUNCTIONS` `InjectionToken<Functions>`, following the exact pattern already established for `ACCOUNT` in Story 1.1 (factory-based, `providedIn: 'root'`, constructed from the shared `client`) — this is the reusable DI-mocking pattern Story 1.1's Dev Agent Record flagged for reuse (the project's vitest builder rejects `vi.mock` on relative imports; tests must override via `TestBed` providers instead).
  - [x] Create `src/app/data/repositories/` (new folder — first repository in the codebase) and a small `RepositoryError` class/type, per the Architecture Spine's Consistency Conventions: "repositories translate `AppwriteException` into a domain-level `RepositoryError` before it reaches Domain/State — Presentation never sees an Appwrite-shaped error."
  - [x] Create `user-repository.ts`: `UserRepository` (`providedIn: 'root'`), method `changeRole(userId: string, role: Role): Promise<void>` — calls `functions.createExecution({ functionId: environment.setRoleFunctionId, body: JSON.stringify({ userId, role }) })`; treat a non-2xx `responseStatusCode` on the execution result, or a caught `AppwriteException`, as failure and throw `RepositoryError` in both cases.
  - [x] Add `setRoleFunctionId: string` to `src/environments/environment.ts` — this value is only known once the Function is actually deployed (Task 5); do not invent a placeholder value that looks like a real ID, use an obviously-empty/placeholder string and flag it in Completion Notes as pending the manual deploy step.

- [x] Task 4: Tests (AC: 1, 2)
  - [x] Function tests (standalone package, outside the Angular/vitest workspace — a second full test framework is unwarranted for one file; use Node's built-in `node:test` + `node:assert`, mocking the `node-appwrite` `Client`/`Account`/`Users` constructors): malformed `role` → 400; missing JWT → 401; JWT valid but caller not admin → 403 and `updateLabels` never called; JWT valid and caller admin → `updateLabels` called with exactly `{ userId, labels: [role] }`.
  - [x] `UserRepository` unit tests (Angular vitest, `TestBed` overriding the `FUNCTIONS` token — do not attempt `vi.mock`): success path resolves; `Functions.createExecution` throwing surfaces as `RepositoryError` (not a raw `AppwriteException`); a non-2xx execution response also surfaces as `RepositoryError`.

- [ ] Task 5: Manual deployment & live verification (AC: 3) — **cannot be completed by a coding agent**, requires human Appwrite Console/CLI access to project `69c270d10029e7ed7f82` (same class of blocker as Story 1.1's Label-assignment step)
  - [ ] Deploy the Function via `appwrite deploy function` (authenticated Appwrite CLI) or manual Console upload.
  - [ ] In the Console, confirm Execute access is set to "Users" and the Function's execution API key scopes include `users.write` (required for `updateLabels`).
  - [ ] Record the real deployed function ID into `environment.ts`'s `setRoleFunctionId`, replacing the placeholder.
  - [ ] Exercise `UserRepository.changeRole()` against the live project for both an admin caller (expect success, label change visible in Console → Auth → Users) and a non-admin caller (expect a thrown `RepositoryError` from the 403, no label change) — this is what satisfies AC3's "tested end-to-end against the real provisioned Appwrite Cloud project, not a mock."

## Dev Notes

- **Why the Function checks the JWT, not just the execute ACL:** AD-9 requires the Function's *own code* to verify `Role.label('admin')` — Appwrite's platform-level execute permission is a coarser gate (any authenticated user vs. none) and is not itself the security boundary this story tests. Relying only on execute ACLs would make AC2 unverifiable at the code level and couples correctness to Console configuration that could silently drift.
- **Why JWT, never `x-appwrite-user-id` alone:** the user-id header can be spoofed by a direct API call bypassing the SDK; only a call that succeeds using `.setJWT()` (which Appwrite itself validates server-side) proves the caller is who they claim, and simultaneously returns their *current* labels — exactly the same trust boundary Story 1.1's `AuthStore` relies on for `account.get().labels`.
- **Dynamic API key, not a static one:** Appwrite auto-injects a short-lived, execution-scoped key via `req.headers['x-appwrite-key']`. Using this (with `users.write` granted in the Function's scope settings) instead of a hand-created static API key means no long-lived secret needs to be stored in the Function's environment variables at all.
- **This Function is the *only* thing in Epic 1 that writes a Label.** Epic 2 later extends this same Function (per AD-9's phrasing "and derived permissions") to also rewrite Event/Donation document permissions when `assignedUserIds`/`accessCode` change — do not scope this story's implementation so narrowly that it can't be extended, but also do not build the permission-derivation logic now; it isn't needed until Epic 2.
- **Layering (binds this and every future story):** Presentation → Domain/State → Data. This story has no Presentation UI yet (Story 1.3 builds the User Management screen on top of this exact repository call) — "exercised directly" in AC1 means tests/manual verification call `UserRepository.changeRole()` directly, not through a component. `AuthStore` (Domain/State) is a separate concern from `UserRepository` (Data) — do not route this through `AuthStore`.
- **Only two writable role values:** `'admin' | 'operator'`, matching `AuthStore`'s existing `Role` type (`src/app/data/stores/auth-store.ts`) — reuse that exported `Role` type rather than redefining it. Do not allow the Function to write any other label string, and do not add a `'member'`/`'family'` case (Family Members are `accessCode`-based, no account, no Label — see Story 1.1's Dev Notes and AD-2/AD-10).
- **Money/receipt/offline/sync ADs (AD-3/4/5/8) do not apply to this story.**
- **Reuse the InjectionToken pattern exactly:** `client.ts` from Story 1.1 already established `ACCOUNT` as a token-wrapped Appwrite service specifically so tests can override it via `TestBed` providers (this project's vitest builder rejects `vi.mock` on relative imports). Add `FUNCTIONS` the same way — do not introduce a second, different mocking approach.

### Project Structure Notes

Brownfield state as of this story (confirmed by direct file reads, not assumed):

- `src/app/data/appwrite/client.ts` — currently exports only `client` and the `ACCOUNT` token (Story 1.1). This story adds a `FUNCTIONS` token here, following the identical pattern.
- `src/app/data/repositories/` — **does not exist yet**. This story creates it, along with the first `RepositoryError`. No prior art to reuse; the Architecture Spine's Consistency Conventions table is the only existing spec for its shape.
- `functions/` — **does not exist yet** anywhere in the repo. No `appwrite.json`, no Appwrite CLI config. This is genuinely greenfield infrastructure, not a rename/extension of anything.
- Root `package.json` — has `appwrite` (Web SDK, `^23.0.0`) for the Angular app. It does **not** have `node-appwrite` (Server SDK) — correct, since that belongs only inside `functions/set-role-and-permissions/package.json`, never the app bundle.
- `src/environments/environment.ts` — currently has `appwriteEndpoint`, `appwriteProjectId`, `appwriteProjectName`. This story adds `setRoleFunctionId` (placeholder until Task 5's manual deploy).
- `src/app/data/stores/auth-store.ts` — already exports a `Role` type (`'admin' | 'operator'`) and `ROLE_HOME` map (Story 1.1). Reuse `Role`, do not redefine it in the repository layer.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story-1.2`] — original AC set this story implements
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md#AD-9`] — one Function is the sole writer of Labels and derived permissions
- [Source: ARCHITECTURE-SPINE.md#AD-1] — Labels not prefs (Story 1.1's precedent this story extends)
- [Source: ARCHITECTURE-SPINE.md#Consistency-Conventions] — `RepositoryError` translation convention; naming (`<Entity>Repository`)
- [Source: ARCHITECTURE-SPINE.md#Structural-Seed] — `data/repositories/` and the `functions/set-role-and-permissions/` layout
- [Source: `docs/DMS_Product_Requirements_Document.md`#FR-USR-002] — role edits take effect via this Function
- [Source: `_bmad-output/implementation-artifacts/1-1-secure-login-role-guarded-dashboard-landing.md`] — `ACCOUNT` InjectionToken DI-mocking pattern to reuse for `FUNCTIONS`; `Role`/`ROLE_HOME` to reuse as-is
- [Source: `.instructions.md`] — house rules: standalone components, signals, `inject()`, `providedIn: 'root'` (applies to `UserRepository`)
- External (verified via web search, current as of 2026-07-27): Appwrite Functions auto-inject `x-appwrite-user-id`/`x-appwrite-user-jwt` when invoked by an authenticated user, and a short-lived, execution-scoped dynamic API key via `x-appwrite-key` — [Develop Appwrite Functions](https://appwrite.io/docs/products/functions/develop), [Execution](https://appwrite.io/docs/products/functions/execute), [Dynamic API Keys](https://appwrite.io/blog/post/how-to-leverage-dynamic-api-keys-for-better-security). `users.updateLabels({ userId, labels })` is the current `node-appwrite` Users API call — [Users API Reference](https://appwrite.io/docs/references/cloud/server-nodejs/users). `node-22` is a supported Appwrite Cloud Functions runtime.

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

- `node --test <dir>` (both `tests/` and `tests` with no trailing slash) failed with `MODULE_NOT_FOUND` on this environment's Node v24.7.0, despite directory-glob test discovery being documented `node:test` behavior. Worked around by pointing the function's `test` script at an explicit glob (`node --test tests/*.test.js`), which passes cleanly. Not investigated further since it's a local tooling quirk, not a code defect.
- `RepositoryError`'s constructor parameter property `cause` initially failed `ng build` with TS4115 ("must have an 'override' modifier") — current TS lib types declare `Error.cause` from ES2022, so a subclass constructor-property of the same name needs `override`. Fixed by adding the modifier.

### Completion Notes List

- Tasks 1–4 complete: standalone `functions/set-role-and-permissions/` Node project (own `package.json`/`node-appwrite`/`.gitignore`, never touching the Angular app's dependencies), `role-writer.js` implementing JWT-verified caller identification + dynamic-API-key label write, a new `data/repositories/` layer (`RepositoryError` + `UserRepository.changeRole()`), and a `FUNCTIONS` `InjectionToken` added to `client.ts` following Story 1.1's `ACCOUNT` pattern exactly.
- Function logic is structured as an injectable-constructor `setRole(context)` (in `role-writer.js`, wrapped by the real `main.js` entrypoint) rather than hard-importing `node-appwrite`'s classes directly into the test path — this lets tests substitute fake `Client`/`Account`/`Users` constructors without module-mocking, mirroring the same DI-for-testability principle Story 1.1 established client-side (`ACCOUNT` token) for a codebase where mocking relative imports isn't supported.
- Tests: 7 new `node:test` cases for the Function (malformed role → 400, missing JWT → 401, invalid JWT → 401, verified non-admin → 403 with `updateLabels` never called, verified admin → success with exact `updateLabels` args, spoofed `x-appwrite-user-id` ignored, `updateLabels` failure → structured 502 not a throw) — all passing. 3 new Angular vitest cases for `UserRepository` (success, `createExecution` rejection → `RepositoryError`, non-2xx execution response → `RepositoryError`) — all passing. Full Angular suite: 47 passed, 2 pre-existing unrelated failures (`app.spec.ts`, `stat-card.spec.ts` — same ones flagged as pre-existing baseline failures in Story 1.1, not a regression from this story). `ng lint`: clean. `ng build`: succeeds (one pre-existing `json-bigint`/CommonJS warning from the `appwrite` package itself, unrelated to this story's changes).
- **Task 5 is intentionally left unchecked — cannot be completed by a coding agent**, same class of exception as Story 1.1's Appwrite-Console Label-assignment step: deploying `functions/set-role-and-permissions` to the live Appwrite Cloud project, setting its Execute-access/scopes in the Console, recording the real function ID into `environment.ts`'s `setRoleFunctionId` (currently the placeholder `'REPLACE_WITH_DEPLOYED_FUNCTION_ID'`), and exercising `UserRepository.changeRole()` against the live project all require a human with Appwrite CLI/Console credentials. AC3 (end-to-end verification against the real project) is therefore **not yet satisfied** — everything up to the deploy boundary is done and tested, but AC3 itself needs that manual step before it can be marked verified.
- `appwrite.json` was added at the repo root (Appwrite CLI's standard single-project-config location, listing all functions), rather than nested inside the function's own folder — this is the conventional location the Appwrite CLI expects and reads from automatically.

### File List

**Added:**
- `functions/set-role-and-permissions/package.json`
- `functions/set-role-and-permissions/package-lock.json`
- `functions/set-role-and-permissions/.gitignore`
- `functions/set-role-and-permissions/src/main.js`
- `functions/set-role-and-permissions/src/role-writer.js`
- `functions/set-role-and-permissions/tests/role-writer.test.js`
- `appwrite.json`
- `src/app/data/repositories/repository-error.ts`
- `src/app/data/repositories/user-repository.ts`
- `src/app/data/repositories/user-repository.spec.ts`

**Modified:**
- `src/app/data/appwrite/client.ts` (added `FUNCTIONS` `InjectionToken`)
- `src/environments/environment.ts` (added `setRoleFunctionId` placeholder)
- `src/environments/environment.development.ts` (added `setRoleFunctionId` placeholder)

## Change Log

- 2026-07-27: Implemented Story 1.2 Tasks 1–4 — standalone Appwrite Function project with JWT-verified admin check + dynamic-API-key Label write (AD-9), new `data/repositories` layer (`RepositoryError`, `UserRepository`), `FUNCTIONS` InjectionToken reusing Story 1.1's DI-mocking pattern. 10 new tests (7 Function, 3 repository), all passing; full suite 47/49 (2 pre-existing unrelated failures); `ng lint` clean; `ng build` succeeds. Task 5 (live deployment + end-to-end verification against Appwrite Cloud, satisfying AC3) explicitly deferred — requires human Appwrite Console/CLI access, cannot be done by a coding agent.
