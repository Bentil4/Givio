---
title: Givio Organizer Multi-Tenancy & Role Hierarchy
status: final
created: 2026-09-23
updated: 2026-09-23
---

# PRD: Givio Organizer Multi-Tenancy & Role Hierarchy
*Working title — confirm.*

## 0. Document Purpose

This PRD is for the Givio PM, stakeholders, and the downstream workflow owners (UX, Architecture, Epics/Stories) who will build against it. It defines the capability requirements for extending Givio's access-control model from a single global Admin/Operator/Family hierarchy into a full multi-tenant structure: **Super Admin > Admin > Super Organizer > Organizer > Operator > Family**, where multiple unrelated event companies share the platform without ever detecting each other. The Super Admin tier (§4.8) was added during the Architecture coaching pass that followed this PRD's initial finalize — once production turned out to already have multiple platform Admins, "who manages the Admins themselves" surfaced as a real gap the original v1.0 scope hadn't named. It builds on — and in places supersedes — the existing `docs/DMS_Product_Requirements_Document.md` (v1.0), `_bmad-output/planning-artifacts/epics.md`, and the Architecture Spine (`ARCHITECTURE-SPINE.md`, ADs 1–10); it does not restate their donation-recording, offline-sync, or receipt-generation requirements, all of which are already implemented (Epics 1–5 are substantially built and in review per `sprint-status.yaml`) and remain unchanged by this document. FRs here use a fresh global `FR-N` sequence distinct from v1's domain-prefixed `FR-AUTH-*`/`FR-USR-*` IDs; reconciling the two inventories into one epic breakdown is downstream work, not done here.

**Brownfield note:** v1's current model treats "Admin" as the single super-user *for one company* (`docs/DMS_Product_Requirements_Document.md` §4.2: "Typically the event coordinator or organisation lead"), with a single global Appwrite Label (AD-1) and `Event.assignedUserIds`-derived permissions (AD-2). This PRD reframes "Admin" as the *platform-wide* operator and introduces Super Organizer/Organizer as the company-level roles v1's "Admin" used to conflate. This is a structural change to an already-live, already-implemented system — though not a data-migration risk in practice, since Architecture confirmed the currently-live accounts are test data, not real tenants (§12).

Vocabulary in §3 (Glossary) is binding: every other section uses these terms verbatim.

## 1. Vision

Givio currently assumes one event company runs the whole platform. In reality, dozens of unrelated funeral and wedding companies will use Givio concurrently, each running several events at once, each employing staff who record donations at the venue. None of them should ever have to wonder whether a rival company can see their events, their donors, or even that they exist on the same platform.

This feature turns Givio from a single-tenant tool into a genuinely multi-tenant platform, where the atomic unit of access is never "this company" but always "this specific event" — enforced structurally, not by policy. It gives the platform a trust gate (Admin approves every Organizer) that exists to protect grieving families from being defrauded by an unvetted event company, not to gate billing. And it makes sure that when access is revoked — an Operator let go, an Organizer suspended under investigation — the people who touched money are never erased from the record, and a grieving family's own view of their event's donations never goes dark because of a dispute they have nothing to do with.

Every design choice here is anchored in one theme the brainstorming session kept surfacing: the family didn't choose this platform, an Organizer brought them onto it, and the strictness of who can see their event's data is ultimately about protecting their dignity in a moment of grief — not a generic privacy policy.

## 2. Target User

### 2.1 Jobs To Be Done

- **Super Admin (the one designated platform owner):** hold everything an Admin holds, plus the exclusive ability to create, promote, demote, or suspend Admin accounts themselves — so that as more platform staff get Admin access, no single Admin can go unchecked.
- **Admin (platform team):** vet and approve new event companies before they can touch real families' data; retain full system control and a platform-wide audit trail at all times; investigate and act on fraud/suspicion without ever losing oversight.
- **Super Organizer (first account at a company):** stand up their company on the platform, bring on co-Organizers and Operators under their own identities (not shared logins), and see a consolidated, near-real-time view of donations across all their company's concurrent events.
- **Organizer (added by a Super Organizer):** run their assigned events, add and manage the Operators who work them, without needing — or being able to get — the power to add another Organizer.
- **Operator:** log in with credentials scoped to the one company that hired them, always know unmistakably which event they're currently acting in, and record donations without any risk of touching the wrong event or another company's data.
- **Family Member:** check a loved one's event donation total in real time, without an account, without exposing themselves to a stranger who has no relationship to their event, and without the platform silently hiding any part of what was actually given.

### 2.2 Non-Users (v1)

- **Self-organizing families** running their own event without a professional event company — explicitly deferred (see §5 Non-Goals).
- **Donors** — external to the platform; they receive a receipt but never authenticate or view platform data.

### 2.3 Key User Journeys

- **UJ-1. Kwame stands up his company without ever seeing — or being seen by — a rival.**
  - **Persona + context:** Kwame Mensah owns a funeral-services company and is the first person from it to sign up for Givio, becoming its Super Organizer.
  - **Entry state:** unauthenticated, arrives at self-signup.
  - **Path:** submits company name, location, size, type, and estimated user count; uploads a business-registration document; two days later receives a verification phone call from Admin's team; gets an approval email; logs in for the first time to an empty Super Organizer dashboard.
  - **Climax:** he creates his first event and generates a family access code — and at no point does any screen, URL, dropdown, or error message hint that another company is even running on the same platform.
  - **Resolution:** he adds Ama, his ops manager, as a co-Organizer under her own identity — a distinct account (FR-5, FR-10), not shared credentials, added via the same identity-checked flow FR-9's approval gate used.
  - Realizes FR-6, FR-7, FR-8, FR-9, FR-2, FR-1, FR-5, FR-10.
  - **Edge case:** if Kwame's first Event happens to match a deceased/event already registered by another tenant, FR-14's platform-wide duplicate check flags it to Admin without ever letting Kwame see who else registered it. Realizes FR-14.

- **UJ-2. Ama adds an Operator who can't fire an action at the wrong event.**
  - **Persona + context:** Ama, Kwame's newly added co-Organizer, needs help covering two funerals happening the same weekend.
  - **Entry state:** authenticated, on her own dashboard.
  - **Path:** she adds Kwesi as an Operator and assigns him to both events; Givio emails Kwesi credentials scoped to Kwame's company only.
  - **Climax:** Kwesi logs in and sees an event-switcher that makes it unmistakable which single event he's currently acting in, before he can record anything.
  - **Resolution:** he records a donation against the correct event; switching requires an explicit action, so a scoped write can never silently fire against the wrong one.
  - Realizes FR-4, FR-3, FR-11.

- **UJ-3. Kojo, previously rejected, tries the co-Organizer bypass through his friend Yaw and gets caught.**
  - **Persona + context:** Kojo was rejected at signup after his ID didn't match his story; he asks his friend Yaw, who runs an already-approved company, to route around vetting by adding him as a co-Organizer.
  - **Entry state:** Yaw is an authenticated, approved Organizer.
  - **Path:** Yaw submits the co-Organizer addition for Kojo.
  - **Climax:** the addition runs the same identity cross-reference used at original signup, flags Kojo's match against the banned/rejected list, and notifies Admin the moment it's attempted.
  - **Resolution:** Admin reviews the flagged addition and blocks it before it takes effect.
  - Realizes FR-12.
  - **Edge case:** if the cross-reference produces a false positive (a common name, not the same person), Admin's review — not an automatic block — is the final word.
  - **Edge case:** if Kojo's history were instead a for-cause revocation at another tenant (not a signup rejection), the same check still catches him — FR-24 feeds revoked-for-cause people into the identical list FR-12 checks. Realizes FR-24.

- **UJ-4. Comfort checks her father's funeral totals from a borrowed phone.**
  - **Persona + context:** Comfort, grieving and not especially tech-forward, was given a family access code by her family's Organizer.
  - **Entry state:** unauthenticated, entering the code on her cousin's phone, not her own.
  - **Path:** on code entry, the app asks whether this is her personal phone; she answers no; she sees the live, complete donation total and list — every donation actually entered, no hidden partial totals.
  - **Climax:** a call pulls her away and she leaves the page; the session logs out automatically the moment she navigates away, so the next person to pick up her cousin's phone sees nothing.
  - **Resolution:** she can re-enter the code from any device, any time, to check back in.
  - Realizes FR-16, FR-18.

- **UJ-5. The family's view survives when Admin has to shut an Organizer down mid-event.**
  - **Persona + context:** Admin is investigating a fraud report against an Organizer while one of that Organizer's funerals is actively collecting donations.
  - **Entry state:** authenticated as Admin.
  - **Path:** Admin suspends the entire Organizer account; the Organizer and every one of their Operators immediately lose login/write access.
  - **Climax:** the grieving family, mid-event, opens their family-code link and sees the donation total exactly as expected — frozen or still updating — with no indication anything happened behind the scenes.
  - **Resolution:** Admin resolves the investigation without the family's experience ever being touched by it — and because Admin's own access to the tenant's Events is itself logged (FR-19), the investigation leaves its own accountable trail, and the suspended Operators' historical donations still display their names (FR-13), unaffected by the suspension.
  - Realizes FR-17, FR-19, FR-13, FR-15.

- **UJ-6. Kwame checks his cross-event total on a busy weekend and flags a number that looks off.**
  - **Persona + context:** Kwame (from UJ-1) is now running two funerals simultaneously as Super Organizer.
  - **Entry state:** authenticated, on his Super Organizer dashboard.
  - **Path:** he opens his consolidated dashboard and sees a near-real-time total across both events; one figure looks stale, so he submits a Contact Admin form describing what he's seeing.
  - **Climax:** the submission is logged and tied to his tenant account, so Admin can follow up without Kwame needing to open a full support ticket.
  - **Resolution:** at month-end he pulls the periodic settlement export to reconcile against his own books.
  - Realizes FR-20, FR-21, FR-22.

- **UJ-7. The Super Admin suspends an Admin whose access looks compromised.**
  - **Persona + context:** Nana, the platform's one Super Admin, notices one of the platform's several Admin accounts making unusual approval decisions and suspects it's been compromised.
  - **Entry state:** authenticated as Super Admin.
  - **Path:** Nana opens the Admin account list — a view only Super Admin has — and suspends the affected Admin account.
  - **Climax:** the suspended Admin immediately loses approval/suspension authority and platform-wide audit access; every other Admin and every tenant is unaffected.
  - **Resolution:** the suspended Admin's own past actions stay visible and attributed in the platform-wide audit log — nothing they already did is hidden or erased, only their ability to act further is cut off.
  - Realizes FR-25, FR-26.

## 3. Glossary

- **Super Admin** — The single designated platform owner. Holds every Admin capability plus the exclusive power to create, promote, demote, or suspend Admin accounts. Exactly one account holds this role at a time.
- **Admin** — Platform-wide super-user. Approves/rejects Organizer applications, retains full system access at all times, sees the platform-wide audit log. Distinct from v1's overloaded "Admin," which conflated this role with company-level ownership (see §0 Brownfield note). Unlike Super Admin, an Admin's own access can itself be suspended (by Super Admin only).
- **Tenant / Event Company** — An organization onboarded onto Givio as an Organizer entity. Owns one or more Events. Two tenants must never be able to detect each other's existence.
- **Super Organizer** — The first Organizer account created for a tenant. Can add co-Organizers and Operators; manages/revokes privileges for both; sees the tenant's own audit trail and a consolidated cross-event donation total.
- **Organizer** (incl. **Co-Organizer**) — An account added to a tenant by its Super Organizer. Can add/manage Operators only; cannot add another Organizer. "Co-Organizer" refers to any Organizer beyond the first (Super) one.
- **Operator** — Scoped to only the specific Events they're assigned to, within one tenant. Equivalent in capability to v1's "User (Operator)," now explicitly scoped per-tenant rather than platform-wide.
- **Family Member** — Read-only viewer of a single Event's donation data via that Event's access code. No account.
- **Event** — A single wedding or funeral, owned by exactly one tenant. The sole unit that access is ever granted against (see Per-Event Grant).
- **Per-Event Grant** — The atomic unit of access control at every tier: a person's access to a specific Event, explicit and revocable independent of any other Event, even one owned by the same tenant.
- **Credentials-per-Relationship** — A person's login is scoped to the one tenant relationship that issued it; the same person working for two tenants holds two separate credential sets. Stated in the source brainstorm primarily for Operators, but it holds structurally for any role: a person leading two companies holds two separate Organizer accounts, never one identity switching between them.
- **Tenant Isolation** — The structural (not policy-based) guarantee that one tenant's identifiers, names, and errors are never exposed to another tenant.
- **Approval Gate** — The state a self-signed-up Organizer sits in until Admin approves them; exists for fraud/trust protection, not billing.
- **Duplicate-Event Detection** — System-side flagging of a potential duplicate Event registration (e.g., the same deceased registered twice), surfaced to Admin.
- **Revocation** — Removal of a person's login/write access. Never removes their historical attribution (see Attribution Retention).
- **Attribution Retention** — The guarantee that a person's name stays permanently on every donation they entered, even after revocation; no account that has touched money is ever hard-deleted.
- **Consolidated Cross-Event Total** — A Super Organizer's near-real-time aggregate donation total across all of their tenant's concurrently running Events.
- **Settlement/Export Report** — A periodic (non-real-time) accounting export of a tenant's donation totals, secondary to the Consolidated Cross-Event Total.
- **Contact Admin Form** — v1's sole in-platform support channel: a simple logged form, not a ticketing system.
- **Access Code** (also "family access code," "family code" — same referent) — v1's existing single hashed, per-Event, read-only credential a Family Member uses to view an Event (unchanged; extended by §4.6's dignity safeguards).

## 4. Features

### 4.1 Tenant Hierarchy & Per-Event Access Model
**Description:** The foundation every other feature depends on: access is never granted at the company level, and tenants are structurally invisible to one another. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-1: Per-event grant as the sole atomic unit

The system must resolve every access decision — including an Organizer's or Super Organizer's access to their own tenant's Events — as an explicit per-Event grant, never an implicit company-wide permission.

**Consequences (testable):**
- No code path grants read or write access to an Event based on tenant membership alone, without a corresponding per-Event grant record.
- A newly added Organizer or Operator has zero Event access until a grant is explicitly created for at least one Event.
- Removing a person's per-Event grant for Event A has no effect on any grant they hold for Event B.

#### FR-2: Structural tenant isolation

The system must guarantee that no tenant can detect the existence of another tenant through any part of the product surface.

**Consequences (testable):**
- No shared, guessable, or sequential identifiers are exposed across tenants in URLs, API responses, or error messages.
- An Organizer's add-Operator/add-co-Organizer flow can never list, search, or accidentally select a person or Event belonging to another tenant.
- Error responses (e.g., "not found," "access denied") are identical in shape whether an Event doesn't exist or belongs to another tenant — never distinguishable.
- This guarantee holds **between tenants**. It does not constrain Admin: FR-19 defines Admin's own cross-tenant access as a separate, explicitly logged exception, not a hole in this guarantee.

**Out of Scope:** Isolation between two Events within the *same* tenant is governed by FR-1, not this FR — same-tenant users may legitimately see their own tenant's other Events depending on their grants.

#### FR-3: Operator event-switcher

An Operator assigned to more than one concurrent Event must see, at all times while acting, an unmistakable on-screen indicator of which single Event they are currently acting in. Realizes UJ-2.

**Consequences (testable):**
- Every scoped write action (e.g., recording a donation) is validated server-side against the Event the UI currently indicates as active — a mismatch is rejected, not silently corrected.
- Switching the active Event requires an explicit user action; it is never inferred from which Event was most recently viewed or synced.

### 4.2 Credentials & Identity
**Description:** Identity is per-relationship and per-human, never shared. Realizes UJ-2.

**Functional Requirements:**

#### FR-4: Credentials-per-relationship

An Operator must authenticate using credentials scoped to the specific Organizer relationship that issued them, not a single identity reused across tenants.

**Consequences (testable):**
- A person working for two tenants holds two distinct credential sets, each usable only within its own tenant.
- Revoking one relationship's credentials has no effect on the person's other relationship's credentials.

#### FR-5: One human, one Organizer account

At provisioning time, the system must ensure each additional person at a tenant's leadership level is onboarded as their own distinct account, never added as a shared credential set under an existing Organizer's identity.

**Consequences (testable):**
- Adding a second person at a tenant's leadership level creates a distinct co-Organizer account (via FR-12's flow), never a shared login under the Super Organizer's identity — there is no product surface that lets a Super Organizer hand out a second copy of their own credentials.
- [ASSUMPTION: this FR covers provisioning-time prevention only. Detecting or stopping shared-credential *use* after an account already exists is out of scope for v1 — enforcement there rests on the identity checks at signup/co-Organizer-addition (FR-12) and platform terms, not technical device-fingerprinting or concurrent-session blocking, since the source brainstorm specifies no such mechanism.]

### 4.3 Organizer Onboarding & Approval Gate
**Description:** The trust gate that keeps unvetted event companies off the platform before they can touch a grieving family. Realizes UJ-1.

**Functional Requirements:**

#### FR-6: Two onboarding paths

The system must support both: (a) Admin creates/invites an Organizer directly and sends credentials, and (b) an Organizer self-signs-up and sets their own credentials, entering a pending state until Admin approves.

**Consequences (testable):**
- Path (a) accounts are immediately active; path (b) accounts cannot log in to any Event-facing functionality until Admin approval.
- Both paths converge on the same account shape afterward — no functional difference in a Super Organizer's capabilities based on which path they arrived through.

#### FR-7: Required intake before approval

Before Admin can approve a self-signed-up Organizer, the system must collect: event company name, location, company size, estimated number of platform users, and company type.

**Consequences (testable):**
- Admin's approval action is unavailable until all required intake fields are present.
- [ASSUMPTION: the brainstorm's "plus other onboarding info" is not itemized further — see Open Question 2 for the exact remaining field list.]

#### FR-8: Manual v1 verification

Before approving a self-signed-up Organizer, Admin must review the submitted intake info and document upload (business registration or ID), and complete a phone verification call.

**Consequences (testable):**
- The approval action records that a document was reviewed and a verification call occurred (who, when) — not just a boolean "approved."
- Automated third-party verification is explicitly not built in v1 (see §5 Non-Goals).

#### FR-9: Pending-state access boundary

A self-signed-up Organizer in the pending state must have no access to create Events, add Operators, or view any donation data.

**Consequences (testable):**
- Every Event-facing and user-management route rejects a pending-state Organizer, not just hides UI entry points to them.

### 4.4 Co-Organizer & Operator Lifecycle Management
**Description:** Who can add whom, and what happens when access is taken away. Realizes UJ-2.

**Functional Requirements:**

#### FR-10: Super Organizer manages co-Organizers and Operators

A Super Organizer must be able to add co-Organizers and Operators, and manage or revoke either's privileges.

**Consequences (testable):**
- An added co-Organizer or Operator has an active account with zero Event access until a per-Event grant is created for them (per FR-1) — "add" alone confers identity, not access.
- A Super Organizer's revoke action on a co-Organizer immediately blocks that co-Organizer's own ability to add/manage Operators.

#### FR-11: Organizer manages Operators only

A non-Super Organizer must be able to add and manage Operators, but must not be able to add another Organizer under any circumstance.

**Consequences (testable):**
- The add-Organizer action is not merely hidden but rejected server-side if attempted by a non-Super Organizer.

#### FR-12: Co-Organizer bypass-loophole closure

Adding a co-Organizer must run the same identity checks used at original Organizer signup (cross-reference against banned/rejected applicants), and must notify Admin on every co-Organizer addition, without requiring a separate vetting system. Realizes UJ-3.

**Consequences (testable):**
- A co-Organizer addition matching a banned/rejected applicant is flagged for Admin review before taking effect, not silently allowed.
- Admin receives a notification for every co-Organizer addition across every tenant, regardless of whether the identity check flagged it.

**Note:** Operators — who actually record donations — get their own, lighter-weight version of this check under FR-23; this FR covers co-Organizer additions only.

#### FR-13: Revocation preserves attribution

Revoking any person's access (Organizer, co-Organizer, or Operator) must remove their login/write access only; their name must remain permanently attached to every donation they previously entered, and their account must never be hard-deleted once they've touched money.

**Consequences (testable):**
- A revoked person's historical donation records display their name identically to before revocation.
- No delete operation exists in the product that permanently removes a person's account record if any donation references them as its recorder.

**Note:** Whether a for-cause revocation also feeds FR-12's/FR-23's banned/rejected cross-reference is covered by FR-24, not here — routine offboarding (e.g., an Operator who simply left) must not be conflated with a for-cause revocation.

### 4.5 Trust & Fraud Prevention
**Description:** Beyond the approval gate itself — ongoing detection and tenant-scoped visibility. Realizes UJ-3.

**Functional Requirements:**

#### FR-14: Duplicate-event detection

The system must detect potential duplicate Event registrations — including across different tenants, not only within one (e.g., the same event or deceased individual registered more than once, a pattern consistent with double-collecting donations) — and notify Admin.

**Consequences (testable):**
- The comparison runs at Admin's platform-wide layer, the only layer with cross-tenant visibility (per FR-2/FR-19) — it is never delegated to a tenant-scoped role, since a same-tenant Organizer duplicating their own event is a different, much lower-severity case than two unrelated tenants registering the same deceased.
- A flagged duplicate does not block Event creation outright; it surfaces to Admin for review (avoids blocking legitimate re-created/rescheduled events — see SM-C2), tracked against SM-7's review-time target.

#### FR-15: Tenant-scoped audit log visibility

Audit log visibility must follow the tenant boundary: Admin sees the platform-wide log across all tenants; a Super Organizer sees only their own tenant's audit trail (their co-Organizers' and Operators' activity); no one sees another tenant's log.

**Consequences (testable):**
- A Super Organizer's audit log query can never return an entry belonging to another tenant, even via direct API access.

#### FR-23: Operator-addition identity check

Adding an Operator must run an identity check against the same platform-wide banned/rejected cross-reference FR-12 and FR-24 check, plus an additional, lighter-weight same-tenant match (at minimum, duplicate name/email/phone against that tenant's existing or previously-revoked Operators and Organizers) — with Admin notified on either kind of match. Realizes UJ-2 (extended).

**Consequences (testable):**
- An Operator addition matching the platform-wide banned/rejected list is flagged for Admin review, exactly as a co-Organizer addition would be (FR-12) — this is what makes FR-24's "flagged at any other tenant" guarantee actually hold for Operators, not just Organizers.
- An Operator addition matching an existing or previously-revoked identity at the *same* tenant (the lighter-weight, additional check) is also flagged for Admin review — closing the gap FR-12 alone leaves at the Operator layer, where donations are actually recorded.
- [CORRECTION, 2026-09-25 — supersedes the prior reading]: "lighter-weight" is the *same-tenant addition* to the check, not a *narrower substitute* for the platform-wide one. An earlier draft read it as same-tenant-only, which directly contradicted FR-24's own "at any other tenant" wording — caught via an Assumption Audit during epic/story elicitation. See Open Question 6 for exact field/matching rules on the same-tenant layer specifically.]

#### FR-24: Post-approval revocations feed the bypass check

A person revoked for cause (fraud or an active investigation, not routine offboarding) must be added to the same banned/rejected cross-reference that FR-12 and FR-23 check, platform-wide.

**Consequences (testable):**
- A person revoked for cause at one tenant is flagged if they, or someone adding them, later attempt a self-signup, co-Organizer addition, or Operator addition at any other tenant.
- Routine offboarding (e.g., an Operator who simply left the company) does not add anyone to this list — only Admin-confirmed for-cause revocations do.

### 4.6 Family Experience & Dignity Safeguards
**Description:** The real reason for strict Operator scoping is protecting a grieving family's dignity — being seen, in their grief and finances, only by people with an actual relationship to their event. This framing governs the language and UX of this feature, not just its access rules. Realizes UJ-4, UJ-5.

**Functional Requirements:**

#### FR-16: Personal-device prompt and auto-logout

On family access-code entry, the system must ask whether the current device is the person's own personal phone; if the answer is no, the session must auto-logout as soon as the person navigates away from the app or page.

**Consequences (testable):**
- Answering "no" sets a session behavior (auto-logout on `visibilitychange`/navigation-away) distinct from answering "yes," where the session persists normally.
- Auto-logout clears the viewed session state so a subsequent user of the same device sees the family code entry screen, not the prior viewer's data.
- If a code is shared beyond the intended family (forwarded, posted, guessed), the Organizer must be able to invalidate it and issue a new one at any time — extending the regenerate/invalidate capability that already exists for v1's access code (AD-10) so this feature's dignity guarantee includes leak recovery, not just wrong-device recovery.

#### FR-17: Family view survives Organizer suspension

If Admin suspends an entire Organizer account, the Family Member's read-only view for that tenant's Events must keep working — it may freeze at its last known state or continue updating, but must not be blocked. Only the Organizer's/Operators' write and login access is blocked. Realizes UJ-5.

**Consequences (testable):**
- A family access code for an Event under a suspended tenant continues to resolve and render a donation view after the suspension takes effect.

#### FR-18: Full donation visibility for family

A Family Member's view must reflect every donation actually entered for their Event — no partial or hidden totals.

**Consequences (testable):**
- The total and list a Family Member sees reconcile exactly with the Operator/Organizer-facing total for the same Event, modulo only the fields already excluded for privacy (e.g., donor phone, per existing v1 FR-SEC-003 / FR-RPT-003).

### 4.7 Admin Oversight, Support & Cross-Event Reporting
**Description:** What Admin can always guarantee, and what a Super Organizer sees across their own tenant. Realizes UJ-1, UJ-5, UJ-6.

**Functional Requirements:**

#### FR-19: Cross-account independence guarantees

The system must guarantee, at all times: Admin can manage multiple tenants' accounts and Events independently with no cross-account interference; no Organizer can see or manage another tenant's account info or Events; no Organizer ever gains full Admin privileges; the platform itself never loses full system control/access — Super Admin's own access can never be suspended or revoked by anyone (§4.8), though an ordinary Admin's access can be, by Super Admin. Realizes UJ-5.

**Consequences (testable):**
- No action available to any Organizer or Operator role can modify Admin's own access level or another tenant's account state.
- Admin's access to any tenant's Event data requires no per-Event grant — access is standing and unconditional, unlike every other role (FR-1). This is the one explicit exception to FR-1's "no code path grants access without a per-event grant" rule.
- Every instance of Admin accessing a tenant's Event data is written to the platform-wide audit log (FR-15) — actor, tenant, event, and timestamp — visible to Admin, never to the tenant itself. FR-2's "structural isolation" is scoped to hold *between tenants*; it does not extend to Admin, whose standing access is instead made accountable through this immutable log rather than through a grant requirement.

#### FR-20: Contact Admin support form (v1)

The system must provide a simple, logged "Contact Admin" form as the sole v1 support channel — not a full ticketing system.

**Consequences (testable):**
- Every submission is retained and associated with the submitting tenant/account for Admin's later reference.
- A suspended tenant's Organizer(s) can still reach a form to dispute the suspension, without needing to log in — suspension blocks Event/donation access (FR-19), it must not also cut off the one channel that could correct a wrongful suspension. The unauthenticated version identifies the submitter by email and tenant name rather than a session. *(Added 2026-09-25 — a Stakeholder Lens Rotation elicitation found the original Contact Admin form was reachable by every role except the one whose need for it is most acute.)*

**Out of Scope:** Full ticketing/status-tracking system (see §5 Non-Goals).

**Note:** Family Members have no dedicated support channel of their own in v1 — a confused or concerned Family Member routes through the Organizer who gave them their access code, not through the platform directly. This is a deliberate scope boundary, not an oversight (also surfaced 2026-09-25).

#### FR-21: Consolidated cross-event total

A Super Organizer must see a near-real-time consolidated donation total across all of their tenant's concurrently running Events, at the same consistency bar as the existing Family live view.

**Consequences (testable):**
- The consolidated total reflects a new donation recorded on any of the tenant's Events within 15 seconds without requiring a manual refresh — matching v1's existing Family live view, which currently updates on a 15-second poll (Family has no Appwrite session to subscribe with, per AD-10). Architecture may exceed this bound (e.g., a true push subscription, as the existing Admin per-event dashboard already uses) but must not fall behind it.

#### FR-22: Periodic settlement/export report

The system must provide a periodic (non-real-time) settlement/export report of a tenant's consolidated donation totals, as a secondary accounting feature to FR-21.

**Consequences (testable):**
- The export's totals reconcile exactly (to the minor currency unit, per existing AD-5) with the sum of the tenant's individual Event totals at the time of export.

**Feature-specific NFRs:**
- Every new screen this feature introduces (Organizer approval queue, event-switcher, Contact Admin form, consolidated dashboard) must meet WCAG 2.1 AA and pass AXE checks, per the project's existing accessibility standard (carrying forward v1's NFR-USE-003).

### 4.8 Platform Administration Hierarchy
**Description:** Added during the Architecture coaching pass, once production turned out to already have multiple platform Admins with no oversight tier above them. A single Super Admin sits above ordinary Admins — holding everything an Admin holds, plus the exclusive power to manage Admin accounts themselves. Realizes UJ-7.

**Functional Requirements:**

#### FR-25: Super Admin has full Admin capabilities

The system must give the single Super Admin account every capability and access guarantee an ordinary Admin has — including FR-19's cross-account independence guarantees and FR-15's platform-wide audit visibility — with nothing withheld.

**Consequences (testable):**
- Every action available to Admin is also available to Super Admin, with no separate capability gate blocking Super Admin from an Admin-level action.
- Super Admin's own reads and writes of tenant data are logged identically to an ordinary Admin's — FR-19's logging consequence applies without exception for Super Admin.

#### FR-26: Super Admin manages Admin accounts

The system must let Super Admin — and only Super Admin — create, promote, demote, or suspend an Admin account.

**Consequences (testable):**
- Creating, promoting, demoting, or suspending an Admin account is rejected server-side if attempted by anyone other than Super Admin, including by another Admin.
- A suspended Admin immediately loses all Admin-level access (approval authority, suspension authority, platform-wide audit visibility), the same way FR-17 blocks a suspended Organizer's write/login access — but their historical actions remain visible and attributed in the platform-wide audit log, never hidden or reassigned (extending FR-13's attribution-retention principle one tier up).
- Exactly one account holds Super Admin at any time. [ASSUMPTION: transferring Super Admin to a different account is a manual, out-of-band operation in v1 (not an in-app flow) — a rare, high-trust event no workflow has been specified for. See Open Question 7.]

## 5. Non-Goals (Explicit)

- **Family-as-self-organizer.** A family member acting as their own Organizer without a professional event company. Explicitly Won't-this-time; parked as a future direction.
- **Automated third-party company-info verification.** v1 uses manual review only (FR-8); automated verification is deferred.
- **Full ticketing/support system.** v1 uses the Contact Admin form only (FR-20); ticketing deferred as a later Should.
- **Offline-first / unreliable-connectivity handling for this feature.** Explicitly excluded as a design constraint for the tenant/role/access layer — v1's existing offline-sync behavior (Epic 3) is untouched by this PRD.
- **Recorder-vs-viewer as distinct roles or locations.** Explicitly excluded as a design constraint.
- **Designing around Event temporariness/time-boundedness.** Explicitly excluded as a design constraint.
- **Re-scoping v1's already-shipped donation recording, receipts, or reporting mechanics.** This PRD is scoped to the tenant/role/access layer only (Epics 1–5's donation/offline/receipt/reporting behavior is unchanged).
- **Billing/monetization.** The Approval Gate exists for fraud/trust protection, not billing (root-caused in the source brainstorm); whether and how tenants are billed is a separate, out-of-scope concern.
- **In-app Super Admin succession/transfer.** Moving the Super Admin role to a different account (§4.8) is a manual, out-of-band operation in v1, not a product flow.
- **Super Admin operational security hardening** (dedicated MFA, credential rotation, anomaly detection on Super Admin's own actions). Surfaced during epic/story elicitation (2026-09-24 pre-mortem): the single Super Admin account is the platform's highest-value, least-replaceable credential, and v1 gives it no protection beyond what an ordinary Appwrite Account already has. Explicitly deferred to a follow-on pass after this capability ships — not resolved here — rather than silently left unaddressed.

## 6. MVP Scope

### 6.1 In Scope

All of FR-1 through FR-26 above constitute v1 scope — the brainstorm's decisions were already scoped to v1, not a future release (FR-23/FR-24 tighten two gaps a security review surfaced in this same load-bearing set; FR-25/FR-26 were added during the Architecture coaching pass, §4.8 — none are new v2 scope).

### 6.2 Out of Scope for MVP

- Family-as-self-organizer (future direction — see §5).
- Automated third-party verification (later — see §5).
- Full ticketing system (later Should — see §5).
- In-app Super Admin succession (see §5).
- Migration is no longer a [NOTE FOR PM] risk: Architecture confirmed (2026-09-23 coaching pass) that today's Admin accounts are test/dev data, not real tenants, so the tenant layer launches on a clean slate rather than needing the reconciliation Open Question 1 originally flagged. See §12.

## 7. Success Metrics

**Primary**
- **SM-1**: Organizer approval turnaround — median time from a self-signup submission to Admin's approve/reject decision. Target: [ASSUMPTION] ≤ 3 business days. Validates FR-6, FR-8, FR-9.
- **SM-2**: Confirmed cross-tenant data exposure incidents in production. Target: 0. Validates FR-2.
- **SM-3**: Attribution integrity — % of donations that retain correct recorder attribution after the recording person's access is revoked. Target: 100%. Validates FR-13.

**Secondary**
- **SM-4**: Duplicate-event flag precision — % of Admin-notified duplicate-Event flags Admin confirms as genuine. Tracked, no v1 target [ASSUMPTION]. Validates FR-14.
- **SM-5**: Family dignity compliance — % of non-personal-device family sessions that correctly auto-logout on navigation-away. Target: 100%. Validates FR-16.
- **SM-6**: Co-Organizer bypass attempts caught — count of co-Organizer and Operator additions flagged by the identity cross-reference. Validates FR-12, FR-23, FR-24.
- **SM-7**: Duplicate-event flag review time — time from a duplicate-Event flag (FR-14) to Admin's review decision. Target: [ASSUMPTION] ≤ 24 hours, tighter than SM-1's approval turnaround since an already-approved tenant may be actively collecting. Validates FR-14.
- **SM-8**: Unauthorized Admin-account-management attempts blocked — count of create/promote/demote/suspend attempts against an Admin account rejected because the caller wasn't Super Admin. Validates FR-26.

**Counter-metrics (do not optimize)**
- **SM-C1**: Approval turnaround (SM-1) must never improve by skipping the document-upload or phone-verification step — a faster median achieved that way is a regression, not progress. Counterbalances SM-1.
- **SM-C2**: Duplicate-event false-positive rate — flagging a legitimate rescheduled/re-created Event as fraud erodes trust and Organizer experience. Counterbalances SM-4.

## 8. Cross-Cutting NFRs

- **Isolation as a data-layer guarantee, not a UI one.** Tenant isolation (FR-2) and per-Event grants (FR-1) must be enforced at the permission/data layer, mirroring v1's existing precedent that RBAC is enforced at the Appwrite permission level, not just in the UI (existing FR-SEC-002).
- **Auditability.** Every access-control action — grant, revoke, approve, reject, suspend, co-Organizer addition — is logged immutably; visibility of that log follows the tenant boundary (FR-15).
- **Attribution durability.** No account that has ever recorded a donation is hard-deleted, platform-wide, under any admin tooling built now or later (FR-13).
- **Accessibility.** WCAG 2.1 AA and AXE compliance for every new screen this feature introduces, carrying forward the project's existing standard (NFR-USE-003).
- **Performance.** The consolidated cross-event total (FR-21) updates within 15 seconds of a new donation, matching v1's existing Family live view's polling cadence — see FR-21's consequences for the full rationale and the bound Architecture may exceed but not fall behind.

## 9. Constraints and Guardrails

- **Dignity, not generic privacy.** Family-facing requirements (§4.6) and their copy/support scripts must be framed around protecting a grieving family's dignity — not being seen by a stranger with no relationship to their event — rather than generic data-privacy/compliance language. This is a stated framing requirement from the source brainstorm, not decoration.
- **Security.** Credentials-per-relationship (FR-4), structural isolation (FR-2), and per-event grants (FR-1) are non-negotiable guardrails — no future feature may introduce a company-level blanket permission as a shortcut.
- **Cost.** [ASSUMPTION] Manual verification (FR-8) is an Admin/ops-time cost, acceptable at current expected Organizer signup volume; revisit if volume grows enough to make phone-verification-per-Organizer a bottleneck.

## 10. Risk and Mitigations

| Risk | Mitigation |
|---|---|
| An unvetted Organizer defrauds a grieving family | Approval gate + manual verification before any Organizer can touch real Event data (FR-6, FR-8, FR-9) |
| A rejected/banned applicant routes around vetting via a co-Organizer addition | Same identity checks as signup applied to every co-Organizer addition, plus Admin notification on every addition (FR-12) |
| One tenant discovers or is exposed to another tenant's existence | Structural isolation enforced at the data layer, never policy-only (FR-2) |
| The wrong person (or a stranger) gains access to a family's donation details via a shared/borrowed device | Personal-device prompt + auto-logout on navigation-away (FR-16), per-event access-code scoping (existing AD-10) |
| A revoked person's donation history is altered or lost, breaking accountability | No hard-delete, attribution retention (FR-13) |
| An Operator juggling multiple concurrent Events fires a scoped action against the wrong one | Mandatory, server-validated event-switcher (FR-3) |
| Same event/deceased registered twice by two *different* tenants to double-collect donations | Platform-wide (not tenant-scoped) duplicate-event detection, executed at Admin's cross-tenant layer (FR-14) |
| A fraud-flagged Operator, who never went through Organizer-level vetting, is added under a different name at the same or another tenant | Operator-addition identity check (FR-23); post-approval for-cause revocations feed the same bypass list new signups/additions are checked against (FR-24) |
| A family access code leaks beyond the intended family (forwarded, posted, guessed) | Organizer-triggerable code invalidation/reissue (FR-16), extending v1's existing regenerate capability (AD-10) |
| Admin's own standing cross-tenant access becomes an unaccountable backdoor around the isolation guarantee it's meant to police | Every Admin access to a tenant's Event data is immutably logged and visible in the platform-wide audit log (FR-19, FR-15) |
| An Admin account is compromised or goes rogue, with no one able to rein it in | Super Admin — and only Super Admin — can suspend an Admin account; the suspended Admin's past actions stay attributed, only further action is blocked (FR-25, FR-26) |

## 11. Integration and Dependencies

- **Extends the existing Appwrite Label-based role writer** (Architecture Spine AD-9): the current model writes a single global role Label per user. Architecture's coaching pass (2026-09-23) resolved this: a new `Memberships` collection (`{userId, tenantId, role, status, grantedBy, grantedAt}`) becomes the sole source of truth for Super Organizer/Organizer/Operator, written only by the AD-9 Function — AD-1's Label narrows to platform-wide Admin/Super Admin only (the single Super Admin account holds both an `admin` and a new `super_admin` Label).
- **Extends the existing `Event.assignedUserIds`-derived permission model** (AD-2): `Event` gains a `tenantId`; the Function now refuses to add `Role.user(uid)` to an Event's derived permissions unless that `uid` holds an active Membership in the Event's own tenant — this is where structural isolation (FR-2) is actually enforced.
- **Extends, does not replace, v1's family access-code login** (AD-10, already implemented as a single hashed read-only `accessCode`): FR-16/FR-17's dignity safeguards layer onto this existing mechanism.
- **Admin read/write logging (FR-19, FR-25)** is client-side, not Function-proxied: the existing Data-layer classes (`EventDataService`/`DonationDataService`) fire an audit-log write whenever the caller holds `Role.label('admin')`, at query granularity — a deliberate trade-off (best-effort/accountability, not tamper-proof) Architecture chose to preserve the existing pure-client paradigm rather than proxy every Admin read through the Function.

## 12. Rollout and Change Management

v1's Admin/Operator/Family model is already live in production — Epics 1 through 5 are substantially built and in review (`sprint-status.yaml`, last updated 2026-09-12). This PRD originally flagged the introduction of the Super Organizer/Organizer tenant layer as a structural change to *existing* production accounts requiring careful migration (Open Question 1). Architecture's coaching pass (2026-09-23) resolved the actual risk: **today's Admin/Operator accounts are test/dev data, not real event companies** — there is no real tenant data to reconcile. The tenant layer therefore launches on a **clean slate**: existing test Admin/Event/Donation data is cleared or reset, new tenant-model code paths (Memberships, Tenant-scoped permissions) stay behind a flag until that reset is confirmed complete, then the flag flips on. No manual per-account reconciliation pass is needed — the phased, tenant-by-tenant migration this PRD originally proposed as a non-binding steer is superseded by this simpler story.

## 13. Open Questions

1. **~~Migration path~~ — Resolved during Architecture coaching (2026-09-23).** Confirmed clean-slate launch (§12); no reconciliation of real tenant data is needed since none exists yet.
2. **Exact onboarding field list.** FR-7 covers company name/location/size/estimated users/company type; the source brainstorm says "plus other onboarding info" without listing it — what else is required before Admin can approve?
3. **Verification specifics.** What document types count as a valid "business registration/ID" upload for FR-8? Who conducts the phone verification call — Admin personally, or a designated reviewer role that doesn't yet exist in this hierarchy?
4. **Numeric targets.** What are the actual targets for SM-1 (approval turnaround) and for the Contact Admin form's response-time expectation (FR-20)?
5. **Monetization interaction.** The approval gate is explicitly not for billing (root-caused via Five Whys in the source brainstorm) — is a billing/monetization model planned at all, and if so, does it interact with the pending/approved Organizer state?
6. **FR-23's exact matching rules.** What specific fields (name, email, phone, national ID?) does the Operator-addition identity check compare, and what counts as a "match" worth flagging to Admin versus a coincidental near-match (e.g., a common name)?
7. **Super Admin succession.** If the single Super Admin account is ever lost, compromised, or needs to be handed to a different person, what's the actual mechanism? v1 leaves this as a manual, out-of-band operation (§4.8, FR-26) — worth a real answer once the platform has more than a handful of Admins.

*Resolved during finalize:* Admin's cross-tenant access model (formerly Open Question 5) is now decided in FR-19 — standing access, immutably logged, never a per-Event grant requirement.

*Resolved during Architecture coaching (2026-09-23):* the migration path (formerly Open Question 1) is decided in §12 — clean-slate launch, no real tenant data to reconcile.

## 14. Assumptions Index

- §4.2 FR-5 — this FR covers provisioning-time prevention only; post-provisioning shared-credential *use* is out of scope for v1, resting on FR-12/FR-23's identity checks and platform terms, not technical detection.
- §4.3 FR-7 — the brainstorm's "plus other onboarding info" is not itemized further beyond the five named fields (also Open Question 2).
- §4.5 FR-23 — corrected 2026-09-25 (was an assumption, now resolved): "lighter-weight" means the platform-wide banned/rejected-list check runs for Operators too (same as FR-12), *plus* an additional same-tenant name/email/phone layer — not a narrower substitute for the platform-wide check. Exact same-tenant matching fields remain open (Open Question 6).
- §4.8 FR-26 — Super Admin succession/transfer is a manual, out-of-band v1 operation, not an in-app flow (also Open Question 7).
- §7 SM-1 — approval turnaround target of ≤ 3 business days.
- §7 SM-4 — no v1 numeric target for duplicate-event flag precision, tracked only.
- §7 SM-7 — duplicate-event flag review-time target of ≤ 24 hours.
- §9 — manual verification's Admin/ops-time cost is acceptable at current expected signup volume.
