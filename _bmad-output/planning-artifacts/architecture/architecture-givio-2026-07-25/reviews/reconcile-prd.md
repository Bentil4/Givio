# Reconciliation: ARCHITECTURE-SPINE.md vs prd-givio-2026-09-23/prd.md

Reviewed in full: both documents, end to end. Below: FR traceability, §11/§12/§4.8 word-for-word checks, and over-reach scan.

## 1. FR Traceability (FR-1 through FR-26)

All 26 FRs have *some* home in the spine (an AD, the Structural Seed, the Capability Map, or an explicit Deferred entry). Full map:

| FR | Home | Note |
|---|---|---|
| FR-1 | AD-2 | direct |
| FR-2 | AD-1, AD-2 | direct, but see Gap 4 below |
| FR-3 | Structural Seed, Capability Map | named but no dedicated AD |
| FR-4 | AD-1 (Teams-rejection rationale) | direct |
| FR-5 | AD-1 (same passage) | direct |
| FR-6 | Capability Map | direct |
| FR-7 | Tenant schema (Consistency Conventions) | **incomplete — see Gap 1** |
| FR-8 | Storage bucket note (Consistency Conventions) | **incomplete — see Gap 2** |
| FR-9 | implied (no Membership until approval) | not made explicit anywhere |
| FR-10 | Capability Map | direct |
| FR-11 | AD-9 (co-Organizer/Operator addition, general) | **not specific — see Gap 3** |
| FR-12 | AD-9, IdentityFlag entry | direct, named explicitly |
| FR-13 | Consistency Conventions (soft-delete) | direct, named explicitly |
| FR-14 | AD-13 | direct |
| FR-15 | Consistency Conventions (`audit_logs.tenantId`) | direct, named explicitly |
| FR-16 | **none** | **missing — see Gap 5** |
| FR-17 | AD-2 (accessCode path implied unaffected) | **mechanism gap — see Gap 4** |
| FR-18 | (no architectural change needed — UI-only) | acceptable non-coverage |
| FR-19 | AD-2, AD-12 | direct |
| FR-20 | Consistency Conventions, Structural Seed | direct |
| FR-21 | Deferred (Realtime), Capability Map | thin but present |
| FR-22 | Capability Map | direct |
| FR-23 | AD-9, IdentityFlag entry | direct, named explicitly |
| FR-24 | IdentityFlag entry | direct, named explicitly |
| FR-25 | AD-11, AD-12 | direct, both consequences covered |
| FR-26 | AD-11, Consistency Conventions (attribution) | direct, all three consequences covered |

No FR is completely unaddressed, but five have real gaps (below).

## 2. Gaps Found

### Gap 1 — FR-7's intake fields incompletely modeled (schema drop)
FR-7 requires five intake fields before Admin can approve: company name, location, size, **estimated number of platform users**, and company type. The spine's `Tenant` schema (Consistency Conventions table) is `{id, name, location, size, type, status, superOrganizerId, createdAt}` — it has no field for estimated user count. Four of five fields made it into the schema; the fifth was dropped silently.

### Gap 2 — FR-8's "who, when" verification record has no schema home
FR-8's testable consequence: "The approval action records that a document was reviewed and a verification call occurred (**who, when**) — not just a boolean 'approved.'" The spine gives Organizer uploads a Storage bucket (AD-9/Consistency Conventions) and a `Tenant.status` field, but no `verifiedBy`/`verifiedAt`/`reviewedBy` field anywhere. As specified, the spine can represent *that* a tenant is approved, but not *who approved it or when the call happened* — which is exactly what FR-8 asked to be recorded.

### Gap 3 — FR-11's "Organizer cannot add another Organizer" isn't a stated AD-9 rule
AD-9 says the Function handles "co-Organizer/Operator addition" and cross-references IdentityFlags, but never states the specific server-side rule FR-11 requires: that a non-Super-Organizer's attempt to add a co-Organizer must be rejected. This is a distinct authorization rule from the identity-flag check and isn't named anywhere in the spine (not in AD-9, not in the Membership schema's `grantedBy` field, not in Consistency Conventions).

### Gap 4 — FR-17's suspension mechanism isn't wired into AD-2's permission derivation (real contradiction risk)
This is the most consequential finding. AD-2's rule for granting Event permissions is: a `uid` gets `Role.user(uid)` **only if** it holds an "**active** Membership... whose `tenantId` matches." AD-2 never checks `Tenant.status` at all. Separately, the `Tenant` schema carries `status: pending|approved|rejected|banned|suspended`.

FR-17 (and UJ-5) require that when Admin suspends "the entire Organizer account," every Operator under that Organizer immediately loses write/login access — but the family's read-only view (via `accessCode`, untouched by Membership) keeps working. As literally specified:
- If suspension is implemented by flipping `Tenant.status` to `suspended`, AD-2's permission-derivation rule as written **ignores that field** — Operators whose individual `Membership.status` is still `active` would keep their Event write permissions. This directly contradicts FR-17.
- If suspension is instead implemented by mass-revoking every Membership under that tenant, that's a plausible fix — but it is nowhere stated in AD-1, AD-2, or AD-9. The spine never says what "suspending an Organizer account" *does* at the data-model level.

Either the `Tenant.status` field is decorative (dead field, since nothing reads it for access control) or AD-2 is incomplete. This should be resolved before Epics/Stories are cut — it's the exact kind of mechanism gap that would let a builder implement FR-17 in a way that silently fails the underlying guarantee.

### Gap 5 — FR-16 (personal-device prompt + auto-logout + leak-recovery reissue) has no home at all
FR-16 is a testable requirement with real state-machine implications (a `visibilitychange`/navigation-away-triggered auto-logout, distinct session behavior based on a yes/no answer at code entry, and an invalidate/reissue capability). It appears in no AD, the Structural Seed, the Capability Map, or the Deferred section. AD-10 covers the *existing* `accessCode` mechanism and defers the *richer* share-access scheme, but never mentions FR-16's session-behavior extension at all — not even as a Deferred item. This is a clean miss, not a partial one.

### Minor: FR-2's identifier/error-shape consequences unaddressed
FR-2's consequences include "no shared/guessable/sequential identifiers exposed... error responses identical in shape whether an Event doesn't exist or belongs to another tenant." Nothing in the spine (AD-2, AD-6, or elsewhere) speaks to ID scheme or error-response shape. Likely fine to leave as an epic-level implementation detail rather than a spine invariant, but flagging since it's explicitly testable in the PRD and isn't captured even as Deferred.

### Minor: FR-9's pending-state boundary is implicit only
Never stated outright — it works only if the spine's implicit assumption (no Membership record exists until Tenant approval) holds. Worth a one-line explicit rule rather than leaving it inferable.

## 3. §11 Integration and Dependencies — word-for-word check

All four bullets checked against the spine's ADs. **All four match in substance, closely enough to be effectively verbatim restatements:**

1. Memberships collection replacing the Label-writer for tenant roles, AD-1 narrowing to Admin/Super Admin only — matches AD-1's rule exactly, including the identical schema shape `{userId, tenantId, role, status, grantedBy, grantedAt}`.
2. `Event.tenantId` + Function-enforced tenant-match on `assignedUserIds` grants — matches AD-2's rule exactly, including the "this is where FR-2 is actually enforced" framing.
3. FR-16/FR-17 layering onto AD-10's existing accessCode mechanism — not contradicted, but see Gap 5: the *substance* of that layering (what FR-16 actually adds) isn't present in AD-10's rule text, only asserted in passing.
4. Client-side, query-granularity Admin logging trade-off — matches AD-12's rule almost verbatim, including "rejected as disproportionate for v1" framing. One immaterial addition: the spine specifies the write goes through `AuditDataService` as an intermediary; the PRD doesn't name that class. Not a contradiction, just an added implementation detail.

No contradictions found in §11.

## 4. §12 Rollout — consistency check

PRD §12 (clean-slate migration, feature-flag gating until reset confirmed, no per-account reconciliation) and the spine's Deferred section's migration note are consistent — near-identical wording ("existing test Admin/Event/Donation data is cleared/reset... new tenant-model code paths... stay behind a feature flag until that reset is confirmed complete"). No contradiction.

## 5. §4.8 (Super Admin, FR-25/FR-26) — AD-11 coverage check

AD-11 covers both FRs' testable consequences specifically, not just the general concept:

- FR-25 consequence 1 (every Admin action also available to Super Admin, no separate gate) — covered: AD-11's dual-Label design means every existing `Role.label('admin')` check "continues to include Super Admin unchanged."
- FR-25 consequence 2 (Super Admin's reads/writes logged identically to Admin's) — covered explicitly in AD-12: "whenever the caller holds `Role.label('admin')` (**includes Super Admin, AD-11**)."
- FR-26 consequence 1 (create/promote/demote/suspend rejected unless Super Admin) — covered: "gated exclusively on `Role.label('super_admin')`, enforced inside the AD-9 Function (never a client-side-only check)."
- FR-26 consequence 2 (suspended Admin loses access but historical actions stay attributed) — covered in Consistency Conventions' soft-delete row, which explicitly extends FR-13's attribution-retention principle to FR-26: "no ... Admin account that has ever recorded a donation or taken an approval action is ever hard-deleted, only revoked/suspended."
- FR-26 consequence 3 (exactly one Super Admin at a time) — covered: "exactly one Appwrite Account holds both `admin` and `super_admin` Label at any time — bootstrapped directly at deploy time."

AD-11 is a genuinely strong match here — all three FR-26 consequences and both FR-25 consequences are individually traceable, not just gestured at.

## 6. Over-reach — scope the spine invented that the PRD never asked for

### Finding: `Tenant.status` includes a `banned` state the PRD never requested
The spine's `Tenant` schema and AD-9's rule both give Tenant a status enum: `pending|approved|rejected|banned|suspended`. The PRD's only uses of "banned" are at the **individual person** level — the IdentityFlags cross-reference list for banned/rejected *applicants* (FR-12, FR-24, UJ-3) — never a whole-tenant ban state. The PRD's only tenant/Organizer-account-level lifecycle states are: self-signup pending → Admin approved/rejected (FR-6/FR-7/FR-8/FR-9), and Admin "suspend[ing] the entire Organizer account" (FR-17, UJ-5) — it never describes a distinct "banned tenant" state beyond suspension or signup-rejection. This looks like architecture inventing a state machine value with no PRD-side trigger, definition, or consequence attached (nothing says when a Tenant moves to `banned` vs. `suspended`, or how the two differ operationally). Should be either traced to a PRD requirement that was missed, or dropped/flagged as an explicit architecture-only addition awaiting a product decision — it currently reads as scope the PRD didn't ask for, sitting quietly in a schema enum.

No other over-reach found — the rest of the new collections (`Tenant`, `Membership`, `IdentityFlag`, `SupportRequest`), the verification-document Storage bucket, and the Structural Seed's new routes/services all map cleanly to named FRs.

## Summary of severity

- **Blocking (should resolve before Epics/Stories):** Gap 4 (FR-17 suspension mechanism not wired into AD-2) — this is a real contradiction risk, not just a documentation gap.
- **Should fix:** Gap 5 (FR-16 has no home at all), Gap 1 (FR-7 schema missing a field), Gap 2 (FR-8 missing verification audit fields), Gap 3 (FR-11's restriction not stated), the `banned` over-reach.
- **Nice to have:** FR-2's identifier/error-shape consequences, FR-9's implicit-only coverage.
