# Story 6.3: Credentials-Per-Relationship Enforcement

Status: ready-for-dev

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

- [ ] **Task 1 — Design decision: a new `addTeamMember` Function action is required (AC 1, 3)**
  - [ ] Read Story 6.3's ACs literally: AC1 says a second tenant "tries to add that same person (**matched by email**)" — Story 6.2's existing `createMembership` action takes a pre-resolved `userId`, never an email, so it cannot be what's under test here. AC1/AC3 are testing an **email-based "add a person" flow** that doesn't exist yet. Per this epic's established "exercised directly for this story" precedent (Story 1.2→1.3, Story 6.2→6.3 itself), **this story builds that Function action**; Epic 7's Story 7.1 only wires a UI to it later — do not defer the action itself to 7.1.
  - [ ] Do **not** rename/replace `createMembership` (Story 6.2, already shipped) — it still serves callers that already have a resolved `userId` (e.g. a future internal flow). Add a new, additional action `addTeamMember({ name, email, tenantId, role })` alongside it.
  - [ ] Scope discipline (matches Story 6.2's own "Known interim gap" precedent): `addTeamMember` stays Admin-caller-gated for this story — Epic 7's Story 7.1 layers the real Organizer-caller + `super_organizer`-only-for-Organizer-role gate (FR-10/FR-11) on top later, and Story 7.2 layers the `IdentityFlags` cross-reference on top of that. Do not build either gate here. Also do **not** build invite-email/SMS delivery here — no AC tests it, and `admin-users.js`'s existing `createUser` invite mechanism is there to reuse whenever a story that actually needs it (delivering credentials to the new person) is built; `addTeamMember` just returns the generated password in its response, matching `createUser`'s own `generatedPassword` field shape.

- [ ] **Task 2 — Refactor: extract a shared internal Membership-row helper (AC 1, 3)**
  - [ ] In `functions/set-role-and-permissions/src/tenant-membership.js`, extract the row-creation body of `handleCreateMembership` (the `databases.createRow(...)` call + its `isConflictError` handling) into a private helper, e.g. `createMembershipRow({ databases, databaseId, membershipsCollectionId, userId, tenantId, role, grantedBy })` returning `{ status, body }` or throwing — used by both the existing `handleCreateMembership` (unchanged external behavior/tests) and the new `handleAddTeamMember`.
  - [ ] `handleAddTeamMember` does **not** need `createMembership`'s duplicate-active-Membership pre-check (Task 4 of Story 6.2) — the Account it's attaching a Membership to is *brand new* by construction (see Task 3), so no prior Membership can exist. Still safe/cheap to route through the same helper for consistency; do not re-derive a second copy of the row-creation logic.

- [ ] **Task 3 — `handleAddTeamMember` (AC 1, 3)**
  - [ ] New `PAYLOAD_VALIDATORS.addTeamMember`: requires `name`, `email`, `tenantId`, and `role` (one of `super_organizer|organizer|operator`, matching `MEMBERSHIP_ROLES`).
  - [ ] Verify the tenant exists (reuse the same `getRow` check `handleCreateMembership` already does; same "existence required, `pending` allowed" reasoning — a self-signup Super Organizer's own account is provisioned before Admin's approval).
  - [ ] Create the Account: mirror `admin-users.js`'s `createUser` pattern exactly — `users.create({ userId: ID.unique(), email, password: randomBytes(12).toString('base64url'), name })`. Needs a `UsersCtor` (already threaded through `tenant-membership.js` since Story 6.2's code review added it for `createMembership`'s user-existence check).
  - [ ] **This is the crux of AC1/AC3**: if `users.create` rejects with a conflict (`isConflictError`, from `shared.js`), the email already belongs to an existing Account — return `409` **immediately, before ever calling `createMembershipRow`**. Never fall back to looking up the existing Account and attaching a Membership to it — "there is no product surface anywhere that attaches a second tenant's Membership to an existing Account" is the literal AC1 requirement, and the only way to guarantee it in code is to never write that code path at all, not to gate it behind a check that could be bypassed by a future edit.
  - [ ] On successful Account creation, call `createMembershipRow` for the new `userId`. Return `{ success: true, userId, membershipId, email, name, tenantId, role, generatedPassword }`.
  - [ ] Register `addTeamMember` in `ACTIONS`, wire it into `handleTenantMembershipRequest`'s action-context/switch (same pattern as the other three actions), pass `UsersCtor` through.

- [ ] **Task 4 — Tests (all 3 ACs)**
  - [ ] `addTeamMember` creates both an Account and a Membership for a brand-new email; asserts `users.create` was called with the target `name`/`email` (never the caller's own), and the returned `membershipId` is wired to the new `userId`, not the caller's `$id` (AC3 — proves the flow never shares/forwards the Super Organizer's own credentials).
  - [ ] `addTeamMember` returns `409` and **does not call `createRow` on the Memberships table at all** when `users.create` conflicts on an existing email (AC1 — the assertion that matters is the absent `createRow` call, not just the status code, since that's what actually proves no Membership got attached to the existing Account).
  - [ ] `addTeamMember` rejects a non-admin caller with `403`, a missing/invalid role with `400`, and a nonexistent `tenantId` with `404` — same shape as `createMembership`'s existing tests, for consistency.
  - [ ] Revoke-isolation test (AC2): two independent Membership fixtures (`membership-a` at `tenant-a` for `user-a`, `membership-b` at `tenant-b` for `user-b`, unrelated `userId`s). Revoke `membership-a`. Assert: exactly one Membership `updateRow` call (for `membership-a`), and the sweep's `listRows`/`updateRow` calls are scoped to `tenant-a` only — nothing in the mock's call log references `membership-b`, `user-b`, or `tenant-b`. This is a regression-proof for behavior `handleRevokeMembership` (Story 6.2) already has; this story adds the dedicated test Story 6.3 itself calls for, it does not change `handleRevokeMembership`.
  - [ ] Run the full Function suite (`npm test` in `functions/set-role-and-permissions`) — zero regressions expected; `createMembership`'s own existing tests are unaffected by the Task 2 refactor (same external behavior).

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
