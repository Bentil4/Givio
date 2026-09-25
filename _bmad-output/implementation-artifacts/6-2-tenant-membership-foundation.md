# Story 6.2: Tenant & Membership Foundation

Status: ready-for-dev

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

- [ ] **Task 1 — `Tenants` / `Memberships` collections (AC 1)**
  - [ ] In the Appwrite Console (project `69c270d10029e7ed7f82`, database `6a94263a003377e55b59`), create table `tenants`: `name` (string), `location` (string), `size` (string), `type` (string), `estimatedUserCount` (integer), `status` (string, enum `pending|approved|rejected|suspended`), `superOrganizerId` (string), `verifiedBy` (string, optional), `verifiedAt` (datetime, optional), `createdAt` (datetime). **No** row-level create/update/delete permission for any role (API-key/Function-only, mirroring the existing `IdentityFlag`/`Membership` write-permission rule in ARCHITECTURE-SPINE.md's Consistency Conventions table). Read: `Role.label('admin')` — the per-Membership read grant (any uid with an active Membership in that tenant) is set **per-row** by the Function at write time, same mechanism as Task 3's `createMembership`.
  - [ ] Create table `memberships`: `userId` (string), `tenantId` (string), `role` (string, enum `super_organizer|organizer|operator`), `status` (string, enum `active|revoked`), `grantedBy` (string), `grantedAt` (datetime). Same zero-client-write rule. Read: `Role.label('admin')` platform-wide, plus `Role.user(userId)` set per-row at creation (a user can read only their own Membership row).
  - [ ] Add `APPWRITE_TENANTS_COLLECTION_ID` / `APPWRITE_MEMBERSHIPS_COLLECTION_ID` as Function-side environment variables (Console → Functions → `set-role-and-permissions` → Settings → Variables), following the existing `APPWRITE_EVENTS_COLLECTION_ID` pattern in `event-assignment.js`.
  - [ ] Add `tenantsCollectionId` / `membershipsCollectionId` to `src/environments/environment.example.ts` (documented placeholder, committed) and your own gitignored `environment.ts`/`environment.development.ts` (real IDs — **do not commit these two files**, per this repo's existing environment-file convention).

- [ ] **Task 2 — `Event.tenantId` (AC 2)**
  - [ ] Console: add a `tenantId` string attribute (optional/nullable — see Dev Notes "`tenantId` is not populated by this story") to the existing `events` table.
  - [ ] Add `tenantId?: string` to `Event` in `src/app/data/models/event.ts`; map it in `event-data.service.ts`'s `rowToEvent`.
  - [ ] Bump `AppDb` to `version(3)` in `src/app/data/dexie/app-db.ts` (carry forward the `events`/`outbox`/`donations` stores unchanged — Dexie only needs a new version block when a store's *indexed* fields change; `tenantId` isn't queried by any story yet, so it does not need to be added to the index string, only to the stored object shape, which Dexie handles without a schema bump for non-indexed fields — confirm this against Dexie's own versioning docs before skipping the bump).

- [ ] **Task 3 — new Function module `tenant-membership.js` (AC 1, 3, 4)**
  - [ ] Create `functions/set-role-and-permissions/src/tenant-membership.js`, following `event-assignment.js`'s exact shape: an `ACTIONS` array, a `PAYLOAD_VALIDATORS` map, `handleTenantMembershipRequest({ req, res, log, error, ClientCtor, AccountCtor, DatabasesCtor })` gated by `verifyAdminCaller` (this story keeps every new action Admin-caller-gated — Epic 7 layers an Organizer-caller + `IdentityFlags` check on top of `createMembership` later; do not build that gating here).
  - [ ] `createMembership({ userId, tenantId, role })` → validates `role` is one of `super_organizer|organizer|operator`; writes a `memberships` row `{ userId, tenantId, role, status: 'active', grantedBy: caller.$id, grantedAt: now }` with `permissions: [Permission.read(Role.label('admin')), Permission.read(Role.user(userId))]`.
  - [ ] `revokeMembership({ membershipId })` → `getRow` the Membership, set `status: 'revoked'`, then call the new `sweepTenantEventPermissions` helper (below) scoped to just that membership's `userId` within its `tenantId`.
  - [ ] `setTenantStatus({ tenantId, status })` → validates the transition against an `ALLOWED_TRANSITIONS` map (`pending: ['approved', 'rejected']`, `approved: ['suspended']`; mirrors Story 2.2's `ALLOWED_TRANSITIONS` pattern in `event-assignment.js`), writes `Tenant.status`; on transition to `suspended` or `rejected`, calls `sweepTenantEventPermissions` scoped to *every* uid currently granted on that tenant's Events (not one uid).
  - [ ] Register the module in `main.js` (`import { handleTenantMembershipRequest, TENANT_MEMBERSHIP_ACTIONS } from './tenant-membership.js';` + an `if (TENANT_MEMBERSHIP_ACTIONS.includes(action))` branch, same pattern as the other four modules).
  - [ ] Add `functions/set-role-and-permissions/tests/tenant-membership.test.js` covering: non-admin caller → 403; `createMembership` writes the expected row + permissions; `revokeMembership` sets `status: 'revoked'` and calls the sweep; `setTenantStatus` rejects an illegal transition (e.g. `pending → suspended`) with 400; `setTenantStatus('suspended')` sweeps every affected Event. Follow `event-assignment.test.js`'s `FakeClient`/`fakeContext` fixture pattern exactly — do not reinvent a second test-fixture style.

- [ ] **Task 4 — tenant-matched permission derivation + sweep (AC 2, 3)**
  - [ ] Promote `computeEventPermissions` out of `event-assignment.js` into `shared.js` (both `event-assignment.js` and `tenant-membership.js` need it now) — keep its signature, just relocate + re-export, and update `event-assignment.js`'s import.
  - [ ] In `event-assignment.js`'s `handleAssignOperators` path, before calling `computeEventPermissions(assignedUserIds)`, filter `assignedUserIds` down to only uids holding an **active** Membership whose `tenantId` matches the Event's own `tenantId` **and** whose Tenant's own `status` is `approved` (see Dev Notes "Why the grant-check also checks Tenant.status" — this is what makes AC 3's sweep invariant hold across a *later*, unrelated `assignedUserIds` edit, not just the moment of suspension). A uid failing this filter is silently excluded from the computed permissions — never an error (matches AC 2's "refused, even if the caller supplies a validly-formatted Event ID from another tenant").
  - [ ] Add `sweepTenantEventPermissions({ DatabasesCtor, adminClient, databaseId, eventsCollectionId, tenantId, userIds, error })` to `tenant-membership.js` (or `shared.js` if `event-assignment.js` ever needs to call it too): queries `events` where `tenantId` matches and `assignedUserIds` array-contains any of `userIds` (`Query.equal('tenantId', tenantId)` + a contains query — confirm the exact Appwrite TablesDB array-query method name against the current `appwrite`/`node-appwrite` docs, since none of the existing Function modules query an array field yet), then `updateRow`s each affected Event's `permissions` via `computeEventPermissions`, dropping the revoked/suspended uid(s) from the derived list while leaving `assignedUserIds` itself untouched (per AD-2: `assignedUserIds` stays the record of who was assigned; only the *permission grant* is retracted).
  - [ ] Do **not** touch `rejectNonOperatorIds`'s existing Appwrite-Label check in `event-assignment.js` — see Dev Notes "Known interim gap: Operator role is still Label-based here" before touching this function.

- [ ] **Task 5 — `tenantId` stamping at Event creation, minimal (part of AC 2's "set at creation")**
  - [ ] Add `src/app/data/models/tenant.ts` (`Tenant` interface, mirroring the Console schema in Task 1) and `src/app/data/models/membership.ts` (`Membership` interface, mirroring Task 1).
  - [ ] Add `src/app/data/services/tenant-data.service.ts` (`TenantDataService`, `providedIn: 'root'`) with one method for now: `getMyActiveMembership(): Promise<Membership | null>` — queries `memberships` for `Query.equal('userId', [currentUser.$id])` + `Query.equal('status', ['active'])`, returns the first match or `null` (the own-row read permission from Task 1 covers this without any Function call). Model it on `EventDataService`'s `fetchAllEventRows` pagination-free style, not its outbox pattern — this is a pure read, no offline queue needed.
  - [ ] In `EventDataService.createEvent`, call `tenantDataService.getMyActiveMembership()` and stamp `tenantId` onto the new `Event` when a Membership exists; leave it `undefined` when it doesn't (today's Admin caller has no Membership — this preserves existing Admin-driven event creation exactly as-is). See Dev Notes "`tenantId` is not populated by this story" for why this is intentionally minimal.

## Dev Notes

**This is a backend/data-layer foundation story — it ships no new screen.** NFR-USE-003 (WCAG/AXE) does not apply; no `feature/` component work is in scope. [Source: ARCHITECTURE-SPINE.md#Capability → Architecture Map]

**Layering:** every new file above belongs to the Data layer (`data/services`, `data/models`) or the Function (`functions/set-role-and-permissions/src`) — never Presentation, per the spine's strict Presentation → Domain/State → Data dependency rule. No Domain/State (`*Service` signal store) is added in this story; add one only when a screen (Story 6.4+) actually needs reactive tenant state. [Source: ARCHITECTURE-SPINE.md#Design Paradigm]

**Why the grant-check also checks `Tenant.status`, not just `Membership.status`:** AD-2's rule literally filters on "active Membership + tenant match," but its own *prevents* clause names both "a revoked Membership" and "a suspended/rejected Tenant" as distinct triggers the sweep must handle. If the *ongoing* grant-check (the one `assignOperators` runs on every future edit) only looked at `Membership.status`, a Tenant suspension would be correctly swept once immediately — but a later, unrelated `assignedUserIds` edit on the same Event (by anyone) would silently re-grant the suspended tenant's still-`active`-Membership uid, since nothing marked their Membership itself as revoked. Checking `Tenant.status === 'approved'` in the same filter closes that gap and keeps the invariant true regardless of which trigger path runs next. [Source: ARCHITECTURE-SPINE.md#AD-2]

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
