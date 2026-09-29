---
baseline_commit: 368457c41de86c834a3352fa7eaa62b1951c172b
---

# Story 6.3: Credentials-Per-Relationship Enforcement

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a person who may work for more than one event company over time,
I want each company relationship to have its own separate login,
so that revoking my access at one company can never affect my access at another.

## Acceptance Criteria

1. **Given** a person who already holds an Appwrite Account tied to one tenant's Membership, **when** a second tenant tries to add that same person (matched by email), via a direct call to the Function (exercised directly for this story — Epic 7's Story 7.1 wires the Team-management UI to this same call), **then** the platform requires a distinct Account for the new relationship — there is no product surface anywhere that attaches a second tenant's Membership to an existing Account (FR-4, FR-5). [Source: epics.md#Story 6.3]
2. **Given** two separate Accounts belonging to the same human, one per tenant, **when** one relationship's Membership is revoked via a direct call to the Function (exercised directly for this story — Epic 7's Story 7.3 wires the Revoke action to this same call), **then** the other Account's session and Membership are completely unaffected — verified by revoking one and confirming the other's Event access is unchanged (FR-4). [Source: epics.md#Story 6.3]
3. **Given** a direct Function call adding a co-Organizer or Operator on a Super Organizer's behalf, **when** it's processed, **then** the flow always provisions a new Account for that person, never a mechanism to share or forward the Super Organizer's own credentials (FR-5). [Source: epics.md#Story 6.3]

## Tasks / Subtasks

- [x] **Task 1 — Design decision: a new `addTeamMember` Function action is required (AC 1, 3)**
  - [x] Confirmed: `createMembership` cannot satisfy AC1/AC3 (no email/account-creation surface). Built `addTeamMember` as a new, additional action.
  - [x] `createMembership` left untouched externally — same action name, same payload shape, same tests passing unmodified.
  - [x] `addTeamMember` is Admin-caller-gated only, no Organizer-caller/`super_organizer` gate, no `IdentityFlags` check, no invite-email/SMS delivery — exactly as scoped. Returns `generatedPassword` in the response, matching `createUser`'s field shape.

- [x] **Task 2 — Refactor: extract a shared internal Membership-row helper (AC 1, 3)**
  - [x] Extracted `createMembershipRow({ databases, databaseId, membershipsCollectionId, userId, tenantId, role, grantedBy, error, errorContext })` from `handleCreateMembership`'s row-creation body (including its `isConflictError` → 409 handling). `handleCreateMembership` now calls it after its existing tenant/user/duplicate-membership checks — identical external behavior, verified by its own pre-existing tests passing unmodified.
  - [x] `handleAddTeamMember` calls `createMembershipRow` directly (no duplicate-active-Membership pre-check) — the Account is always brand-new by construction.

- [x] **Task 3 — `handleAddTeamMember` (AC 1, 3)**
  - [x] `PAYLOAD_VALIDATORS.addTeamMember` added: requires `name`, `email`, `tenantId`, and a valid `role`.
  - [x] Tenant-existence check (same `getRow` pattern as `createMembership`, same `pending`-allowed reasoning).
  - [x] Account creation via `users.create({ userId: ID.unique(), email, password: randomBytes(12).toString('base64url'), name })`.
  - [x] On `isConflictError` from `users.create`, returns `409` immediately — `createMembershipRow` is never called on that path (verified by test: `calls.createRow` is `undefined`).
  - [x] On success, calls `createMembershipRow` for the new Account, returns `{ success, userId, membershipId, name, email, tenantId, role, generatedPassword }`.
  - [x] Registered in `ACTIONS`, wired into `handleTenantMembershipRequest`'s switch; `UsersCtor` already threaded through from Story 6.2.

- [x] **Task 4 — Tests (all 3 ACs)**
  - [x] `addTeamMember` creates Account + Membership for a new email; asserts `users.create`'s `email`/`name` match the target person (never `admin-1`, the caller), and the Membership's `userId` is the new Account's id, not the caller's (AC3).
  - [x] `addTeamMember` returns `409` with **no** `createRow` call when `users.create` conflicts on an existing email (AC1).
  - [x] `addTeamMember` rejects non-admin (403), invalid role (400, before any DB call), nonexistent tenant (404, before touching Users) — 3 tests.
  - [x] Revoke-isolation test (AC2): revoking `membership-a` (`tenant-a`/`user-a`) produces exactly 2 `updateRow` calls (the Membership + its one swept Event) and zero references anywhere in the call log to `tenant-b`/`user-b`/`membership-b`.
  - [x] Full Function suite: **122/122 passing** (was 116; +6 new), zero regressions — `createMembership`'s existing tests unaffected by the Task 2 refactor.

## Dev Notes

**This is a backend/Function-only story — it ships no new screen.** NFR-USE-003 (WCAG/AXE) does not apply; no `feature/` component work is in scope, matching Story 6.2's precedent (Epic 7's Story 7.1 owns the actual `/company/team` UI). [Source: ARCHITECTURE-SPINE.md#Capability → Architecture Map]

**Why this story needs new Function code, not just new tests of Story 6.2's code.** It would be a mistake to read this story as "write tests proving Story 6.2 already satisfies these ACs" — `createMembership` structurally *cannot* satisfy AC1/AC3, since it never touches account creation at all (it takes a `userId` its caller already resolved). The "exercised directly for this story" phrasing in this epic always means "the underlying Function mechanics are built now, UI wiring comes later" (see Story 1.2→1.3 and Story 6.2's own Task 3→Epic 7's Story 7.1/7.3 cross-references) — never "just add tests."

**AC1's enforcement must be structural, not a checked condition.** The safest way to guarantee "no product surface attaches a second tenant's Membership to an existing Account" is for the code to have no path that does it — `handleAddTeamMember` only ever creates a Membership *after* `users.create` has already succeeded in creating a brand-new Account for that exact call. There is deliberately no "look up the existing account by email and attach a Membership to it instead" fallback anywhere, not even behind a flag — that fallback is precisely the thing FR-4/FR-5 rule out.

**Interaction with Story 6.2's "Known interim gap" (Operator role still Label-based) — do not touch, but be aware.** `addTeamMember` creates a Membership but deliberately does **not** set any Appwrite Label (per AD-1 amended, tenant-scoped roles live only in Memberships, never Labels) — this is correct, not an oversight. It does mean a tenant-scoped Operator created this way still has no `operator` Label, so `event-assignment.js`'s existing `rejectNonOperatorIds` (Label-based) would still reject them if some future flow tried to route them through `assignOperators` unchanged. That migration remains explicitly out of scope here exactly as flagged in Story 6.2's Dev Notes — this story does not touch `event-assignment.js` at all.

**Why `addTeamMember` skips `createMembership`'s duplicate-active-Membership check.** That check (Story 6.2's code-review fix, backed by the `userId_unique` index on `memberships.userId`) exists because `createMembership` is handed a `userId` that might already have a Membership. `addTeamMember`'s `userId` is always freshly minted by the same call (`users.create` right before it) — no prior Membership can exist for an Account that didn't exist a moment ago. Running the check anyway would be dead code, not defense-in-depth.

**Cross-Cutting DoD applies:** this story touches AD-9 (Function writes) — verify `addTeamMember` end-to-end against the real provisioned Appwrite Cloud project (`69c270d10029e7ed7f82`), not mocks alone, before marking done. **Live Appwrite MCP access was available during Story 6.2 but is disconnected as of this story's creation** — if it's unavailable when this story is implemented, note that explicitly in Completion Notes rather than silently skipping the live-verification requirement; do not claim it was done if it wasn't. [Source: epics.md#Cross-Cutting Definition of Done]

### Project Structure Notes

New files: none — this story only extends `tenant-membership.js` and its test file.

Modified files:
- `functions/set-role-and-permissions/src/tenant-membership.js` (new `addTeamMember` action; `handleCreateMembership`'s row-creation logic extracted into a shared `createMembershipRow` helper)
- `functions/set-role-and-permissions/tests/tenant-membership.test.js` (new tests per Task 4)

No conflicts with the existing brownfield structure — extends the same module Story 6.2 already established, using its exact conventions (`ACTIONS` array, `PAYLOAD_VALIDATORS`, injectable `*Ctor` params for testability).

### References

- [Source: epics.md#Story 6.3] — this story's full Given/When/Then ACs
- [Source: epics.md#Story 7.1] — "a new Membership is created for them at my tenant (Story 6.2's model)" — confirms Epic 7 wires a UI to this story's/6.2's Function actions, doesn't rebuild them
- [Source: epics.md#Story 7.2] — confirms `IdentityFlags` cross-referencing is layered on top of team-addition later, not in this story
- [Source: epics.md#Story 7.3] — confirms the Revoke UI wiring (this story only needs the underlying isolation guarantee, already built in 6.2)
- [Source: functions/set-role-and-permissions/src/tenant-membership.js] — `handleCreateMembership`, `handleRevokeMembership`, `ALLOWED_TENANT_TRANSITIONS`, existing `ACTIONS`/`PAYLOAD_VALIDATORS`/switch shape to extend
- [Source: functions/set-role-and-permissions/src/admin-users.js] — `createUser`'s exact Account-provisioning pattern (`ID.unique()`, `randomBytes(12).toString('base64url')` generated password, `isConflictError` handling) to mirror
- [Source: functions/set-role-and-permissions/src/shared.js] — `isConflictError`, `hasValue`, `invalid`/`VALID`, `verifyAdminCaller` to reuse
- [Source: functions/set-role-and-permissions/tests/tenant-membership.test.js] — existing `fakeContext`/`FakeClient` fixture pattern (already has a `UsersCtor` mock wired in from Story 6.2's code-review pass) to extend, not reinvent
- [Source: _bmad-output/implementation-artifacts/6-2-tenant-membership-foundation.md] — previous story; `userId_unique` index, `createMembershipRow`'s row shape, the "Known interim gap" note this story must not silently resolve

## Dev Agent Record

### Agent Model Used

claude-sonnet-5

### Debug Log References

### Completion Notes List

- All 4 tasks implemented. `addTeamMember` is the only genuinely new code path — `createMembership`'s refactor (Task 2) preserves external behavior exactly, confirmed by its own pre-existing tests passing unmodified.
- **Live Appwrite MCP verification was NOT available for this story** (the MCP server was disconnected at implementation time, unlike Story 6.2 where it was available) — this story's Cross-Cutting DoD note explicitly asked for this to be stated plainly rather than silently skipped. Verification here is unit-test-only (122/122 Function tests passing). The one live-verifiable assumption worth flagging for whoever next has Appwrite access: confirm `users.create`'s conflict error for a duplicate email actually surfaces as `err.code === 409` against the real Appwrite Cloud project (matches `admin-users.js`'s existing `isConflictError`/`resolveDuplicateField` pattern, already relied on elsewhere in production, so this is expected to hold — not a new assumption this story introduces, but not independently re-verified live either).
- AC1's guarantee is enforced structurally (no code path exists that attaches a Membership to a pre-existing Account), not just by a runtime check — see Dev Notes "AC1's enforcement must be structural."
- Confirmed the story's own note about `IdentityFlags`/Organizer-caller gating: neither was built here, exactly as scoped to Epic 7's Story 7.1/7.2.

### File List

**Modified:**

- `functions/set-role-and-permissions/src/tenant-membership.js` (new `addTeamMember` action; `createMembershipRow` helper extracted from `handleCreateMembership`)
- `functions/set-role-and-permissions/tests/tenant-membership.test.js` (6 new tests; `UsersCtor` fixture mock gained a `create` method)
