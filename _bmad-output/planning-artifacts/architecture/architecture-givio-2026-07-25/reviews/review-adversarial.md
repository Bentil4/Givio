---
name: 'Adversarial Review — Givio Architecture Spine (multi-tenant amendment pass)'
type: review
reviews: architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md
method: 'two-units-one-level-down divergence hunting'
created: '2026-09-23'
scope: 'AD-1, AD-2, AD-9, AD-11, AD-12, AD-13; Structural Seed new collections (Tenant, Membership, IdentityFlag, SupportRequest); Consistency Conventions table'
---

# Adversarial Review — Givio Architecture Spine (2026-09-23 multi-tenant amendment)

**Verdict:** The prior review's CRITICAL findings (AD-2's insecure Team-role bug, AD-1's unbuildable client-only Label write) are resolved by this amendment — `assignedUserIds`/Labels-via-Function/Memberships now have a single, named write owner (the AD-9 Function) and the permission-derivation mechanism is spelled out concretely. That discipline is real progress. But the amendment introduces four new fields/behaviors whose *lifecycle* (who writes them, when, and against what other field) is asserted by name but not fully pinned: `Tenant.superOrganizerId`, the interaction between `Tenant.status` and `Membership.status` at the AD-2 permission boundary, the unit of measurement in AD-12's "query granularity," and the shared schema for `IdentityFlag` across the AD-9 Function's several distinct write triggers. Each is a case where two builders, both reading only this spine, obey every AD to the letter and still ship incompatible or insecure behavior. Five findings below, ordered by severity.

Method: for each amended AD, I constructed two hypothetical builders — one building the Organizer-onboarding epic (self-signup, verification, approval), one building the Operator/Admin-management epic (Change Role, Assign Operators, Tenant suspend/ban, Admin account mgmt) — who each read only this spine and asked where their independent implementation choices would fail to interoperate or fail to agree on a security-relevant check.

---

## Finding 1 — `Tenant.superOrganizerId`: no AD states who writes it or when (HIGH)

**Spine text:** AD-9's Rule (line 104) says the Function is "the only code that ever sets a user Label, writes or revokes a Membership record (AD-1), rewrites an Event/Donation document's derived permissions... **transitions a Tenant's approval state** (`pending`→`approved`/`rejected`/`banned`/`suspended`)..." — it pins *state transitions*, not Tenant *document creation*. The Consistency Conventions table and ERD both list `Tenant.superOrganizerId` as a field, but no AD, no binds line, and no Structural Seed note says which code writes it or at which lifecycle moment.

**Two compliant builders diverge:**
- **Builder A** (Organizer-onboarding epic, building self-signup): reads AD-9 literally — it only claims Function-exclusivity over *transitions* and Membership/Label writes, not Tenant *creation*. Self-signup therefore has `TenantDataService` create the initial `Tenant` document directly (client-side, Data layer, per the normal Outbox-write pattern every other entity uses), with `status: 'pending'` and `superOrganizerId` set immediately to the signing-up user's uid — since that's the only uid available at signup time and no Membership exists yet to derive it from.
- **Builder B** (Operator-management/Admin-approval epic, building the approval-queue action): reads AD-9's "one Function is the sole writer of... Memberships... and derived permissions" as covering the whole Tenant lifecycle by the same trust logic used for everything else it touches, and has the Function create the Tenant row (or at least stamp `superOrganizerId`) only at **approval** time — when it also grants the `super_organizer` Membership (AD-9's own text: "Organizer self-signup approval... where it also cross-references the IdentityFlags list... before granting a Membership") — since before approval there's no confirmed Super Organizer, only an applicant.

**Consequence:** if Builder A ships first, Tenant documents need client-side create permission (unspecified anywhere — the Tenant collection's write-permission grant isn't named, unlike Event's AD-2-derived permissions), and `superOrganizerId` is populated a full approval-cycle before that person holds any Membership row — so any code that treats `Tenant.superOrganizerId` as "the currently active Super Organizer" (e.g., Admin/Super Organizer audit-log filtering, FR-15) will show a name for a tenant that has no active Membership yet. If Builder B ships first, self-signup can't write a client-side pending Tenant record at all (no permission model exists for it) and must synchronously call the Function just to register interest, which is a materially different self-signup flow than every other Data-layer write in this architecture.

**Suggested AD fix:** Amend AD-9 (or add a Tenant sub-clause to AD-2's tenant-ownership language, mirroring `Event.tenantId "sole source... set at creation, immutable"`) to state explicitly: is `Tenant` document creation itself Function-only, or client-writable pending-only? And is `superOrganizerId` set at signup (pointing to the applicant) or only at approval (pointing to the newly-granted Membership holder)? Pin one answer and name the write-permission grant on the Tenant collection the way AD-2 names it for Event.

---

## Finding 2 — AD-2's tenant-match check reads `Membership.status` but never says whether it also reads `Tenant.status` (HIGH / security)

**Spine text:** AD-2's Rule (line 62): the Function "refuses to add `Role.user(uid)` to an Event's... derived permissions unless `uid` holds an **active** Membership (AD-1) whose `tenantId` matches that Event's own `tenantId`." The check as written is defined entirely in terms of `Membership.status == active` + `tenantId` match. `Tenant.status` (`pending|approved|rejected|banned|suspended`, per the Consistency Conventions table and ERD) is never mentioned as an input to this check, and no AD states that banning/suspending a Tenant cascades to revoke its member Memberships.

**Two compliant builders diverge:**
- **Builder A** (Organizer-onboarding epic, implementing the AD-2 permission-recompute logic exactly as the Rule enumerates it): checks only `Membership.status == 'active' && Membership.tenantId == event.tenantId`. This is a complete, literal implementation of the stated Rule — nothing in AD-2 tells them to join against `Tenant.status`.
- **Builder B** (Operator-management epic, implementing the AD-9 Function's Tenant `suspend`/`ban` action): assumes — reasonably, since the whole point of suspending a Tenant is to cut off access — that suspending/banning cascades to either (a) bulk-revoke all of that Tenant's Membership rows, or (b) have the AD-2 permission check also read `Tenant.status`. Neither cascade behavior is specified anywhere, so Builder B may ship the suspend action *without* implementing either mechanism, trusting AD-2's check to "already handle it."

**Consequence:** a banned/suspended Tenant's Operators keep full event read/write access via their still-`active` Memberships, because nothing in the spine guarantees the suspend/ban transition (AD-9) and the permission-derivation check (AD-2) touch the same state. This is exactly the kind of "two units, each individually AD-compliant, that build an incompatible/insecure whole" the review brief asks for — and unlike Finding 1, it's a live FR-2 tenant-isolation puncture, not just a data-modeling inconsistency.

**Suggested AD fix:** Tighten AD-2's Rule to explicitly state the tenant-match check's full input set — e.g., "...unless `uid` holds an active Membership whose `tenantId` matches the Event's `tenantId` **and** that Membership's Tenant has `status: approved`" — and add to AD-9's Tenant-transition clause that a `banned`/`suspended` transition **must** trigger a permission-recompute pass over every Event owned by that tenant (not just future Membership checks), since existing Event documents' permission arrays were computed at grant time and won't self-update on a later Tenant-status change.

---

## Finding 3 — AD-12's "query granularity" doesn't say whether a "query" is a Data-layer call or a user-facing action (MEDIUM/HIGH)

**Spine text:** AD-12's Rule (line 122): "`EventDataService`/`DonationDataService` fire an audit-log write... at query granularity — one entry per list/view call, not per row."

**Two compliant builders diverge:**
- **Builder A** implements this literally against the binds list ("`EventDataService`, `DonationDataService`, `AuditDataService`") — i.e., instruments logging *inside each Data-layer method*. An Admin dashboard load that internally calls `EventDataService.list()` then `DonationDataService.list()` produces **two** audit-log entries for what was, to the Admin, one action.
- **Builder B** (building a different Admin screen, e.g. the consolidated cross-tenant report, FR-21) interprets "one entry per list/view call" as "per user-facing screen view" and coalesces every Data-layer call that fires within one Domain/State-level screen load into a **single** audit-log entry, to avoid what looks like log spam for a single click.

**Consequence:** the resulting `AuditLogEntry` collection has no consistent meaning across screens — some Admin actions produce 1 row, structurally identical actions on a different screen produce N rows — which breaks any downstream reliance on "one entry = one Admin access event" (FR-19's own framing) for review or reporting, and no AD or convention row defines the entry's own shape (which entity/query it names) precisely enough to reconcile the two after the fact.

**Suggested AD fix:** Pin the unit explicitly, e.g.: "one audit-log entry per Data-layer method invocation (`EventDataService`/`DonationDataService` call site), never coalesced at the Domain/State or Presentation layer" (or the inverse, if per-screen-action is actually intended) — and add the entry shape (what identifies "which query": collection + filter/eventId, not just an actor+timestamp) to the Consistency Conventions table.

---

## Finding 4 — `IdentityFlag`'s write path names one writer but not one shape, across several distinct trigger points in the same Function (MEDIUM)

**Spine text:** Consistency Conventions table: `IdentityFlag` — "cross-signup/addition bypass list (FR-12/FR-23/FR-24), written only by the AD-9 Function; exact matched fields **Deferred**." AD-9's Rule only describes *reading* it ("cross-references the IdentityFlags list... before granting a Membership"); no AD describes the write trigger(s) that populate it.

**Two compliant builders diverge:**
- **Builder A** (Organizer-onboarding epic): implements the write path fired on Organizer self-signup rejection (FR-12) — an applicant who fails verification gets flagged — and picks a document shape suited to that trigger, e.g. `{email, nationalId, reason: 'signup_rejected', tenantId, flaggedAt}`.
- **Builder B** (Operator-management epic): implements a second write path fired on co-Organizer/Operator addition when the same check catches a previously-flagged identity being re-added under a different tenant (FR-23/FR-24) — and, working independently against the same "Deferred: exact matched fields" note, picks a different shape suited to *that* trigger, e.g. `{name, phone, flagType: 'duplicate_identity', addedByTenantId, flaggedAt}`.

Both are inside the one AD-9 Function (satisfying "written only by the AD-9 Function" to the letter, since it's a single deployable), but they're two independently-authored code paths inside it, and nothing pins a shared schema between them. The read side ("cross-references the IdentityFlags list") then has no reliable common field to match against — one flag has `email`/`nationalId`, the other has `name`/`phone`, and the matching logic itself is *also* Deferred, so there's no forcing function that would catch the mismatch before both ship.

**Consequence:** this is lower severity than Findings 1–2 because the spine already flags the matching-fields question as an open item (Deferred, PRD Open Question 6) — but the Deferred note as written only defers *which fields are matched*, not *that a single canonical `IdentityFlag` document shape must be shared across every write trigger*. A careful reader could reasonably conclude the single-writer property (one Function) is enough to guarantee shape consistency; it isn't, since the Function has multiple internal call sites.

**Suggested AD fix:** Add one sentence to the `IdentityFlag` convention-table row: "all write triggers inside the AD-9 Function (signup rejection, duplicate-identity match on addition, and any future trigger) populate the same document shape" — and resolve at minimum the shape's superset of fields now (even while which fields *drive matching* stays Deferred), so two independently-built trigger paths can't diverge on the shape itself.

---

## Finding 5 — AD-13's duplicate-event flag has no named storage location (LOW/MEDIUM)

**Spine text:** AD-13's Rule (line 128): "A match surfaces as a flag in Admin's review queue; Event creation itself is never blocked by a flag." Neither AD-13 nor the Structural Seed's "new collections" list (`Tenant`, `Membership`, `IdentityFlag`, `SupportRequest`) names where that flag is persisted.

**Two compliant builders diverge:**
- **Builder A** (building the Event-creation path, `EventDataService`, which AD-13 binds): stores the flag as a field on the `Event` document itself (e.g. `Event.duplicateFlagged: boolean` + `Event.duplicateOfEventId`), since that's the entity the check runs against and no new collection is named for it.
- **Builder B** (building the Admin review-queue screen, per the Capability Map's `feature/admin/` "duplicate-event review (AD-13)" row): assumes flags live in a dedicated queue-style collection (analogous to `DonationConflicts` in AD-3) separate from `Event`, since AD-13 explicitly parallels AD-3/AD-12's "same boundary" language and a boolean-on-Event can't hold structured detail like which other event(s) it matched against.

**Consequence:** whichever builder ships first defines the contract by accident; the other's screen reads from a field/collection that doesn't exist. Lower severity than Findings 1–3 because it's a missing-field problem rather than a security hole, but it's a genuine two-owner-of-one-concept gap the spine leaves open.

**Suggested AD fix:** Name the storage shape in AD-13 directly — either an `Event.duplicateFlag` field (and specify its shape) or state a new `DuplicateEventFlag`-style collection explicitly in the Structural Seed's collection list, matching the precedent AD-3 already set for `DonationConflicts`.

---

Full review written to: `_bmad-output/planning-artifacts/architecture/architecture-givio-2026-07-25/reviews/review-adversarial.md`
