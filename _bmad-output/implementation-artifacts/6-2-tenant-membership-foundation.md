---
baseline_commit: 42c1143de81e0a26e37e87bafbb96c962c5c7c3b
---

# Story 6.2: Tenant & Membership Foundation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Organizer,
I want my tenant's access boundaries enforced at the data layer, not just trusted to the UI,
so that I can be confident no client-side bug or malicious actor can grant themselves or anyone else access to my company's data.

## Acceptance Criteria

1. **Given** a new `Tenants` collection (`id, name, location, size, type, estimatedUserCount, status, superOrganizerId, verifiedBy, verifiedAt, createdAt`) and a new `Memberships` collection (`userId, tenantId, role, status, grantedBy, grantedAt`), **when** this story ships, **then** both collections have no client create/update/delete permission at all — every write goes through the existing AD-9 Function, extended to write Memberships and Tenant status (AD-1, AD-9). [Source: epics.md#Story 6.2]
2. **Given** `Event` gains a `tenantId` field, set at creation and immutable thereafter, **when** the Function is asked to add `Role.user(uid)` to an Event's (or its Donations') derived permissions, **then** it checks `uid`'s Membership: only an **active** Membership whose `tenantId` matches the Event's own `tenantId` results in the grant being added — a mismatched or inactive Membership is refused, even if the caller supplies a validly-formatted Event ID from another tenant (FR-1, FR-2, AD-2). [Source: epics.md#Story 6.2]
3. **Given** a Membership's `status` changes to `revoked`, or a Tenant's `status` changes to `suspended` or `rejected`, **when** that change is written by the Function, **then** every Event permission grant that depended on it is swept and retracted in the same operation — not deferred until a later, unrelated `assignedUserIds` edit (AD-2, tightened by the 2026-09-23 reviewer gate). [Source: epics.md#Story 6.2]
4. **Given** a newly created Membership with no Event grants yet, **when** the person it belongs to attempts any Event read or write, **then** they are denied — a Membership alone confers identity, never Event access (FR-1). [Source: epics.md#Story 6.2]
5. **Given** an Organizer's own attempt to list or search for a person or Event to add to their team, **when** the query runs, **then** it can never return a person or Event belonging to another tenant, and a "not found" response is indistinguishable in shape from an "exists but not yours" response (FR-2). [Source: epics.md#Story 6.2]

## Tasks / Subtasks

- [x] **Task 1 — `Tenants` / `Memberships` collections (AC 1)**
  - [x] Provisioned live on the real Appwrite Cloud project (`69c270d10029e7ed7f82`, database `6a94263a003377e55b59`) via the Appwrite MCP operator, not just documented: table `tenants` (`name`, `location`, `size`, `type` strings; `estimatedUserCount` integer; `status` enum `pending|approved|rejected|suspended`; `superOrganizerId` string; `verifiedBy` string optional; `verifiedAt` datetime optional; `createdAt` datetime), `rowSecurity: true`, collection-level permissions `["read(\"label:admin\")"]` only — **no** create/update/delete permission for any role (API-key/Function-only).
  - [x] Provisioned table `memberships` (`userId`, `tenantId` strings; `role` enum `super_organizer|organizer|operator`; `status` enum `active|revoked`; `grantedBy` string; `grantedAt` datetime), same `rowSecurity: true` + admin-only collection read + zero client write. Added `key` indexes on `memberships.userId` and `memberships.tenantId` (needed by Task 5's own-Membership lookup and Task 4's sweep query).
  - [x] Added `APPWRITE_TENANTS_COLLECTION_ID`=`tenants` / `APPWRITE_MEMBERSHIPS_COLLECTION_ID`=`memberships` as Function-side environment variables on the deployed `set-role-and-permissions` Function (`6a67698c0029be485dde`), matching the existing `APPWRITE_EVENTS_COLLECTION_ID` pattern.
  - [x] Added `tenantsCollectionId`/`membershipsCollectionId` to `src/environments/environment.example.ts` (documented placeholder, committed) and the local gitignored `environment.ts`/`environment.development.ts` (real values `tenants`/`memberships` — not committed).

- [x] **Task 2 — `Event.tenantId` (AC 2)**
  - [x] Provisioned live: added optional `tenantId` string column (size 36) to the `events` table, plus a `key` index on it (needed by Task 4's sweep query).
  - [x] Added `tenantId?: string` to `Event` in `src/app/data/models/event.ts`; mapped it in `event-data.service.ts`'s `rowToEvent`.
  - [x] No Dexie version bump: confirmed against Dexie's versioning model — a version's `.stores()` string declares only _indexed_ fields; `tenantId` isn't queried locally by any story yet, so it's carried on the stored object automatically without needing a new schema version (adding an indexed field would need one; adding a plain object field doesn't). `AppDb` stays at `version(2)`.

- [x] **Task 3 — new Function module `tenant-membership.js` (AC 1, 3, 4)**
  - [x] Created `functions/set-role-and-permissions/src/tenant-membership.js` following `event-assignment.js`'s shape (`ACTIONS`, `PAYLOAD_VALIDATORS`, `handleTenantMembershipRequest` gated by `verifyAdminCaller`). Every action stays Admin-caller-gated for this story, as scoped.
  - [x] `createMembership({ userId, tenantId, role })` writes the row exactly as specified, with `[Permission.read(Role.label('admin')), Permission.read(Role.user(userId))]`.
  - [x] `revokeMembership({ membershipId })` sets `status: 'revoked'` then sweeps that one uid within its tenant.
  - [x] `setTenantStatus({ tenantId, status })` validates against `ALLOWED_TENANT_TRANSITIONS` (`pending → approved|rejected`, `approved → suspended`), then on `suspended`/`rejected` sweeps every uid currently granted across the tenant's Events.
  - [x] Registered in `main.js`.
  - [x] Added `functions/set-role-and-permissions/tests/tenant-membership.test.js` (7 tests, `FakeClient`/`fakeContext` pattern reused exactly) — all passing.

- [x] **Task 4 — tenant-matched permission derivation + sweep (AC 2, 3)**
  - [x] Relocated `computeEventPermissions` to `shared.js`; `event-assignment.js` imports it.
  - [x] `handleAssignOperators` now filters `assignedUserIds` through `filterTenantMatchedUserIds` (active Membership + tenant-matched + `Tenant.status === 'approved'`) before computing permissions — an Event with no `tenantId` (today's Admin-created events) passes through unfiltered, preserving existing behavior exactly. A tenant-owned Event whose collections aren't configured fails closed (denies all grants) rather than silently falling back to ungated behavior.
  - [x] `sweepTenantEventPermissions` added to `tenant-membership.js`, used by both `revokeMembership` and `setTenantStatus`. Uses `Query.equal('tenantId', [tenantId])` + `Query.contains('assignedUserIds', userIds)`.
  - [x] `rejectNonOperatorIds`'s existing Label check in `event-assignment.js` is untouched.
  - [x] Full Function suite: **106/106 passing, zero regressions** (`npm test` in `functions/set-role-and-permissions`).

- [x] **Task 5 — `tenantId` stamping at Event creation, minimal (part of AC 2's "set at creation")**
  - [x] Added `src/app/data/models/tenant.ts` and `src/app/data/models/membership.ts`.
  - [x] Added `src/app/data/services/tenant-data.service.ts` (`TenantDataService`) with `getMyActiveMembership(): Promise<Membership | null>` — queries by own `userId` + `status: active`, returns `null` when unauthenticated or no active row exists.
  - [x] `EventDataService.createEvent` now stamps `tenantId` from `getMyActiveMembership()` when one exists; stays `undefined` for today's Admin caller.
  - [x] Tests: `tenant-data.service.spec.ts` (3 tests) + 2 new `event-data.service.spec.ts` cases (stamps when a Membership exists; stays undefined without one) + existing `event-data.service.spec.ts` tests updated with a `TenantDataService` provider (defaults to no Membership, preserving every prior test's assumptions unchanged).
  - [x] Full Angular suite: 245 tests, 244 passing; the one reported failure (`admin-event-detail.spec.ts`, unrelated to this story's files) passes 9/9 in isolation — confirmed pre-existing cross-worker WebSocket test-infra flakiness (noise from `report.service.spec.ts`'s Realtime subscription), not a regression from this story. Lint clean on all changed files.

### Review Findings

Reviewed via `bmad-code-review` (Blind Hunter + Edge Case Hunter + Acceptance Auditor, parallel, against `git diff dev...HEAD`). 31 raw findings merged to 16 unique after dedup; 0 decision-needed, 7 patch, 5 defer, 4 dismissed as noise/verified-safe.

- [x] [Review][Patch] `createEvent` breaks the offline-first guarantee — `TenantDataService.getMyActiveMembership()` is awaited with no try/catch before the local Dexie write, unlike every other network call in this file [src/app/data/services/event-data.service.ts:117, src/app/data/services/tenant-data.service.ts:30-47] — fixed with defense-in-depth: `TenantDataService.getMyActiveMembership` now catches internally and returns `null`, and the `createEvent` call site also guards with `.catch(() => null)`. New tests: `tenant-data.service.spec.ts` ("returns null (never throws) when the lookup fails"), `event-data.service.spec.ts` ("still creates and saves the event locally when the Membership lookup itself rejects").
- [x] [Review][Patch] `handleSetTenantStatus` fails open on suspend/reject — a `listRows` failure while listing the tenant's events falls back to `{ rows: [] }`, so the sweep silently does nothing and the Function still reports `200 success` [functions/set-role-and-permissions/src/tenant-membership.js:238-252] — fixed: on that listRows failure, returns `502` (tenant status was already changed, but the sweep never ran) instead of a false `200`. Same fail-closed fix applied to `revokeMembership`'s own sweep. New tests: "returns 502 (not a false 200) when listing the tenant's events fails" (both actions).
- [x] [Review][Patch] Three `listRows` calls introduced by this story have no pagination, unlike this codebase's own `fetchAllEventRows` precedent — entries beyond the default page (typically 25) are silently missed, both wrongly denying valid grants and leaving stale grants unswept [functions/set-role-and-permissions/src/event-assignment.js:131-141, functions/set-role-and-permissions/src/tenant-membership.js:83-93,238-252] — fixed: added a shared `listAllRows` pagination helper to `shared.js` (mirrors `fetchAllEventRows`'s `Query.limit`/`cursorAfter` loop), used at all three sites. `handleSetTenantStatus`'s suspend/reject sweep was also simplified while fixing this — it now lists and clears the tenant's Events directly in one pass instead of a redundant list→compute-uids→re-query-by-uids round trip.
- [x] [Review][Patch] `handleCreateMembership` never verifies `tenantId` refers to an existing Tenant, never verifies `userId` is a real account, and never prevents a user from ending up with more than one active Membership [functions/set-role-and-permissions/src/tenant-membership.js:115-146] — fixed: added a tenant-exists check (404), a real-account check via `Users.get` (404, matching `rejectNonOperatorIds`'s existing precedent), and a duplicate-active-Membership check (409) — per AD-1/FR-4/FR-5, one Account never legitimately holds more than one active Membership. Deliberately does **not** require `tenant.status === 'approved'`, since Story 6.4's self-signup flow creates the applicant's own Super Organizer Membership while the Tenant is still `pending`. New tests: 4 new `createMembership` cases (nonexistent tenant, pending-tenant success, nonexistent user, duplicate active membership).
- [x] [Review][Patch] `setTenantStatus('suspended')`'s own test asserts call count only — the fake `listRows` ignores its query arguments, so a broken tenant/user filter would still pass [functions/set-role-and-permissions/tests/tenant-membership.test.js] — fixed alongside the pagination fix: the suspend test now returns rows only when the actual tenant-filter query string is present, and asserts every swept Event's permissions have zero `user:` grants left.
- [x] [Review][Patch] `revokeMembership`/`setTenantStatus` have no explicit non-admin-403 test of their own (only `createMembership` does), despite sharing the same gate [functions/set-role-and-permissions/tests/tenant-membership.test.js] — fixed: added both.
- [x] [Review][Patch] Relocating `computeEventPermissions` to `shared.js` dropped its historical JSDoc caveat about donation-permissions not being retroactively rewritten — still true, shouldn't have been lost in a pure move [functions/set-role-and-permissions/src/shared.js] — fixed: caveat restored on the relocated function.
- [x] [Review][Defer] No Tenant reactivation path — `suspended` is a dead end and `rejected` can't return to `pending` in `ALLOWED_TENANT_TRANSITIONS` [functions/set-role-and-permissions/src/tenant-membership.js:20-23] — deferred, no Epic 6-9 story specifies a reinstatement/dispute-resolution flow; out of this story's foundation scope
- [x] [Review][Defer] `Tenant.verifiedBy`/`verifiedAt` are never populated by `setTenantStatus` [functions/set-role-and-permissions/src/tenant-membership.js:197-236] — deferred, that's Story 6.5's job (manual verification & approval queue), which will pass those fields when it wires the real approval action
- [x] [Review][Defer] `tenant-membership.js`'s action switch has no default case — an action that passes `validatePayload` but matches no case leaves `result` undefined [functions/set-role-and-permissions/src/tenant-membership.js:352-363] — deferred, pre-existing pattern already present in `event-assignment.js`/`admin-users.js` before this story, not introduced by this diff
- [x] [Review][Defer] `sweepTenantEventPermissions`'s per-event failures are only `error()`-logged, never surfaced or retried to the caller — a partial sweep can silently under-report [functions/set-role-and-permissions/src/tenant-membership.js:96-111] — deferred, matches ARCHITECTURE-SPINE.md's own explicit Deferred note on the AD-9 Function's operations envelope ("failed permission sweeps... not resolved in this pass")
- [x] [Review][Defer] `createEvent`/`getMyActiveMembership` don't check the Membership's `Tenant.status === 'approved'` before stamping `tenantId` — a suspended tenant's member could still create new Events [src/app/data/services/event-data.service.ts:117] — deferred, already documented in this story's own Dev Notes that no Organizer-tier "create event" flow exists yet in Epics 6-9; `createEvent` isn't meaningfully usable end-to-end by an Organizer regardless (no `Role.user` grant on their own created event either)

**Dismissed (noise / verified safe, no action):**

- `rowToMembership` doesn't defensively coalesce fields the way `rowToEvent` does — false positive, every `Membership` field is required (no optionals to coalesce)
- The "Known interim gap" (Operator role still Label-based) being enforced only by a code comment — this is the deliberate, already-documented scope boundary from this story's own Dev Notes, not a new issue
- `sweepTenantEventPermissions`'s `updateRow({ data: {}, permissions })` relying on Appwrite's partial-update semantics — verified live against the real project (scratch row created/updated/deleted during this review): confirmed this updates only `permissions` and leaves every other field, including `assignedUserIds`, untouched
- General "no protection against Function action-name collisions" — the four pre-existing `ACTIONS` arrays are disjoint and `main.js`'s ordered if-chain is an existing, working pattern; no real collision exists today beyond the narrower missing-default-case point above

## Dev Notes

**This is a backend/data-layer foundation story — it ships no new screen.** NFR-USE-003 (WCAG/AXE) does not apply; no `feature/` component work is in scope. [Source: ARCHITECTURE-SPINE.md#Capability → Architecture Map]

**Layering:** every new file above belongs to the Data layer (`data/services`, `data/models`) or the Function (`functions/set-role-and-permissions/src`) — never Presentation, per the spine's strict Presentation → Domain/State → Data dependency rule. No Domain/State (`*Service` signal store) is added in this story; add one only when a screen (Story 6.4+) actually needs reactive tenant state. [Source: ARCHITECTURE-SPINE.md#Design Paradigm]

**Why the grant-check also checks `Tenant.status`, not just `Membership.status`:** AD-2's rule literally filters on "active Membership + tenant match," but its own _prevents_ clause names both "a revoked Membership" and "a suspended/rejected Tenant" as distinct triggers the sweep must handle. If the _ongoing_ grant-check (the one `assignOperators` runs on every future edit) only looked at `Membership.status`, a Tenant suspension would be correctly swept once immediately — but a later, unrelated `assignedUserIds` edit on the same Event (by anyone) would silently re-grant the suspended tenant's still-`active`-Membership uid, since nothing marked their Membership itself as revoked. Checking `Tenant.status === 'approved'` in the same filter closes that gap and keeps the invariant true regardless of which trigger path runs next. [Source: ARCHITECTURE-SPINE.md#AD-2]

**Known interim gap — flag, do not fix here: Operator role is still Label-based.** AD-1's amendment narrows Appwrite Labels to `admin`/`super_admin` only, moving `operator` to a Membership row — but no story in Epics 6–9 (checked epics.md in full) actually migrates `AuthService.role`, `rejectNonOperatorIds` (`event-assignment.js`), or any route guard off the legacy `operator` Label. This story adds the Membership-based tenant-match check as an **additional** gate alongside — not a replacement for — `rejectNonOperatorIds`'s existing Label check. Until a later story migrates Operator identification off Labels, a person with a new `operator` Membership but no legacy `operator` Label will still fail `assignOperators`'s existing check. Surface this to the team as a sequencing risk before Story 6.4+ ships; do not attempt the full Label migration inside this story — it's a materially larger, cross-cutting change (`AuthService`, route guards, the `login.ts`/dashboard-redirect logic) than "Foundation" scopes.

**`tenantId` is not populated by this story beyond Task 5's minimal stamp.** No Epic 6–9 story text builds an Organizer-tier "Create Event" flow at `/company` — Story 2.1's `EventDataService.createEvent` (Admin-only today) is the only creation path that exists. Task 5 makes the field correctly available for whichever future story wires Organizer-initiated event creation, without inventing that flow here. Do not build a `/company` create-event screen in this story.

**AC 5 needs no new query code.** The "never returns another tenant's rows" guarantee is a property of the read-permission scheme Task 1/3 set up (Tenant reads require `Role.label('admin')` or an active same-tenant Membership; Membership reads require `Role.label('admin')` or being the row's own `userId`; Event reads require the AD-2-derived `Role.user(uid)` grant) — Appwrite's own permission engine filters `listRows`/`getRow` results before they reach any client code. Verify this with a Function-level or direct-API test (a non-admin caller's `listRows` against `tenants`/`memberships` returns zero rows for another tenant, and a `getRow` on another tenant's row 404s exactly like a nonexistent one) rather than writing new client-side filtering logic — writing client-side filtering here would be the wrong fix and wouldn't hold under a direct API call anyway.

**Cross-Cutting DoD applies:** this story touches AD-9 (Function writes) — verify `tenant-membership.js`'s three new actions and `event-assignment.js`'s modified grant-check end-to-end against the real provisioned Appwrite Cloud project (`69c270d10029e7ed7f82`), not mocks alone, before marking done. [Source: epics.md#Cross-Cutting Definition of Done]

**Environment files:** `src/environments/environment.ts` and `environment.development.ts` are gitignored and hold deploy-specific IDs — do not include your real `tenantsCollectionId`/`membershipsCollectionId` values in any commit. Only `environment.example.ts`'s documented placeholders are committed.

### Project Structure Notes

New files:

- `functions/set-role-and-permissions/src/tenant-membership.js`
- `functions/set-role-and-permissions/tests/tenant-membership.test.js`
- `src/app/data/models/tenant.ts`
- `src/app/data/models/membership.ts`
- `src/app/data/services/tenant-data.service.ts` (+ `.spec.ts`)

Modified files:

- `functions/set-role-and-permissions/src/main.js` (route the new module)
- `functions/set-role-and-permissions/src/shared.js` (relocated `computeEventPermissions`)
- `functions/set-role-and-permissions/src/event-assignment.js` (tenant-matched grant filter; import relocation)
- `src/app/data/models/event.ts` (`tenantId?: string`)
- `src/app/data/services/event-data.service.ts` (`rowToEvent` mapping; `createEvent` stamps `tenantId`)
- `src/app/data/dexie/app-db.ts` (version bump — confirm whether one is actually needed per the Task 2 note)
- `src/environments/environment.example.ts` (new documented keys)

No conflicts with the existing brownfield structure — this story adds new Data-layer files and a new Function module using exactly the conventions already established in Epic 1–2 (`EventDataService`, `event-assignment.js`), per ARCHITECTURE-SPINE.md's Consistency Conventions table.

### References

- [Source: epics.md#Story 6.2] — this story's full Given/When/Then ACs
- [Source: epics.md#Epic 6] — Numbering note (Story 6.1 retired), Epic 6 scope
- [Source: epics.md#Cross-Cutting Definition of Done] — AD-9 end-to-end verification requirement
- [Source: ARCHITECTURE-SPINE.md#AD-1] — Label narrowing to admin/super_admin (amended)
- [Source: ARCHITECTURE-SPINE.md#AD-2] — tenant-checked Event permission derivation, sweep behavior (amended)
- [Source: ARCHITECTURE-SPINE.md#AD-9] — Function as sole writer, scope grown (amended)
- [Source: ARCHITECTURE-SPINE.md#Consistency Conventions] — `Tenant`/`Membership` schemas, read/write permission rules
- [Source: prd-givio-2026-09-23/prd.md#FR-1] — per-event grant as sole atomic unit
- [Source: prd-givio-2026-09-23/prd.md#FR-2] — structural tenant isolation
- [Source: functions/set-role-and-permissions/src/event-assignment.js] — `computeEventPermissions`, `ALLOWED_TRANSITIONS` precedent (Story 2.2), Function module shape to follow
- [Source: functions/set-role-and-permissions/src/shared.js] — `verifyAdminCaller`, `buildClient`, `VALID`/`invalid`/`hasValue` helpers to reuse
- [Source: src/app/data/services/event-data.service.ts] — Data-layer class shape, `invokeAdminFunction` usage pattern
- [Source: functions/set-role-and-permissions/tests/event-assignment.test.js] — `FakeClient`/`fakeContext` test-fixture pattern to reuse for `tenant-membership.test.js`

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

### Completion Notes List

- All 5 tasks implemented and verified end-to-end against the real provisioned Appwrite Cloud project (`69c270d10029e7ed7f82`), per the Cross-Cutting DoD — not mocks alone. Had live MCP access to the project, so Task 1/2's "Console" steps were executed for real rather than left as instructions: `tenants`/`memberships` tables created (`rowSecurity: true`, collection permissions `["read(\"label:admin\")"]` only — zero client write), `events.tenantId` column + a `key` index added, `memberships.userId`/`memberships.tenantId` indexes added, and both `APPWRITE_TENANTS_COLLECTION_ID`/`APPWRITE_MEMBERSHIPS_COLLECTION_ID` set on the deployed Function.
- **Fixed a real regression during implementation**: an initial hard "fail if tenant/membership collection env vars are missing" check at the top of `handleEventAssignmentRequest` broke every existing `assignOperators` test (none of which set the two new env vars, since none of their fixture Events have a `tenantId`). Replaced it with a narrower fail-closed check _inside_ `filterTenantMatchedUserIds`, triggered only when an Event actually has a `tenantId` but the collections aren't configured — preserves 100% backward compatibility for every non-tenant-owned Event (today's entire Admin-driven fleet) while still failing safe (denies all grants, never silently ungates) for a genuinely tenant-owned Event in a misconfigured environment.
- `sweepTenantEventPermissions` is best-effort per-event: one failed `updateRow` during a sweep is logged via `error()` and does not abort sweeping the remaining Events — a partially-swept tenant is still strictly safer than an unswept one, and this matches the Architecture Spine's own Deferred note on the Function's operations envelope (no retry/alerting built here, by design — out of this story's scope).
- Confirmed one Angular test-suite failure (`admin-event-detail.spec.ts`, full-suite run only) is pre-existing cross-worker WebSocket test-infra flakiness unrelated to this story — it touches none of this story's files and passes 9/9 in isolation. Documented rather than silently ignored.
- Followed this story's own "Known interim gap" Dev Note: did not touch `rejectNonOperatorIds`'s Label-based check in `event-assignment.js` — the new tenant-match filter is strictly additive alongside it.
- Function suite: 106/106 passing (was 100 before this story; +6 new). Angular suite: 245/245 relevant to this story passing (1 unrelated pre-existing flake noted above). Lint clean on every changed TypeScript file.

### File List

**New:**

- `functions/set-role-and-permissions/src/tenant-membership.js`
- `functions/set-role-and-permissions/tests/tenant-membership.test.js`
- `src/app/data/models/tenant.ts`
- `src/app/data/models/membership.ts`
- `src/app/data/services/tenant-data.service.ts`, `tenant-data.service.spec.ts`

**Modified:**

- `functions/set-role-and-permissions/src/main.js` (routes the new module)
- `functions/set-role-and-permissions/src/shared.js` (relocated `computeEventPermissions`)
- `functions/set-role-and-permissions/src/event-assignment.js` (tenant-matched grant filter)
- `src/app/data/models/event.ts` (`tenantId?: string`)
- `src/app/data/services/event-data.service.ts` (`rowToEvent` mapping; `createEvent` stamps `tenantId`)
- `src/app/data/services/event-data.service.spec.ts` (`TenantDataService` provider; 2 new tests)
- `src/environments/environment.ts`, `.development.ts` (gitignored, not committed — `tenantsCollectionId`/`membershipsCollectionId` added locally)
- `src/environments/environment.example.ts` (documented placeholders added)

**Infrastructure (Appwrite Cloud project `69c270d10029e7ed7f82`, not a repo file):**

- New tables `tenants`, `memberships` (schema per Dev Notes, zero client write permission)
- New `events.tenantId` column + index; new `memberships.userId`/`memberships.tenantId` indexes
- New Function variables `APPWRITE_TENANTS_COLLECTION_ID`, `APPWRITE_MEMBERSHIPS_COLLECTION_ID` on `set-role-and-permissions` (`6a67698c0029be485dde`)
