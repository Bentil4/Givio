---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - docs/DMS_Product_Requirements_Document.md
  - _bmad-output/planning-artifacts/architecture/architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md
  - .claude/skills/plan/*.md (26 screen specs — treated as UI/UX detail input, no formal bmad-ux DESIGN.md/EXPERIENCE.md pair exists)
  - _bmad-output/planning-artifacts/prds/prd-givio-2026-09-23/prd.md (Organizer Multi-Tenancy & Role Hierarchy — added 2026-09-23; ARCHITECTURE-SPINE.md above was amended, not replaced, to cover it: AD-1/AD-2/AD-9 amended, AD-11/AD-12/AD-13 new)
  - _bmad-output/specs/spec-organizer-multi-tenancy/SPEC.md (adopts the two above as companions — cited for its CAP-1..CAP-8/constraint framing, not a separate source of requirements)
  - _bmad-output/planning-artifacts/ux-designs/ux-givio-2026-09-23/DESIGN.md (added 2026-09-23 — fills the gap flagged below; visual identity for the multi-tenancy capability, ratifies existing src/styles.scss tokens)
  - _bmad-output/planning-artifacts/ux-designs/ux-givio-2026-09-23/EXPERIENCE.md (added 2026-09-23 — IA, Key Flows UJ-1/2/3/4/5/7, Component/State Patterns for the multi-tenancy capability; companion mockups/approval-queue.html and mockups/tenant-switcher.html)
---

# Givio Donation Management System - Epic Breakdown

## Pre-Flight Risks (from Assumption Audit)

- **Verify Appwrite plan tier includes Functions and Realtime** in the console for project `69c270d10029e7ed7f82` before Epic 1 story work starts. AD-9 (single writer of Labels/permissions, load-bearing for Epic 1 *and* Epic 2) needs Functions; Epic 4's live dashboard needs Realtime. Neither has been confirmed available on the current plan.
- **Appwrite web SDK `^23.0.0`** is 3 majors behind current (26.x) — confirm it still talks to the provisioned Cloud project correctly before relying on it in Epic 1's first story.
- **AD-9 Function is now a single point of failure for safety, not just convenience** (surfaced during Epic 6-9 elicitation, 2026-09-24 cascading-failure simulation): by Epic 6, the Function is the sole writer for Memberships, Tenant approval, IdentityFlags, Admin/Super Admin accounts, and permission sweeps. A Function outage during Epic 8's Story 8.1 (Admin suspends a Tenant) can leave a suspended tenant's Operators with live access for the outage's duration — the worst possible timing, since an outage may correlate with the kind of incident that triggers a suspend. Story 8.1 now makes this failure visible (suspend reports failed, not succeeded, if the sweep doesn't confirm) rather than silent — but the Architecture Spine's already-Deferred "Operations envelope (monitoring/alerting/backup) for the Function" should be treated as higher-priority than its Deferred status implies once Epic 8 is being built, not left for an unspecified later pass.
- **Super Admin operational security is out of scope for this epic set** (PRD Non-Goals, added 2026-09-24 pre-mortem) — the single Super Admin account has no MFA/rotation/anomaly-detection story anywhere in Epics 6-9. Deliberately deferred to a follow-on pass, not silently missing.

## Cross-Cutting Definition of Done (from Inversion Analysis)

Applies across every epic below — a story isn't done just because its happy path works:

- Any story touching AD-1/AD-9 (role/Label writes) must be verified end-to-end against the real provisioned Appwrite Cloud project, not mocks alone.
- Any story touching offline entry/edit/sync (AD-3/AD-4, Epic 3) must include an explicit offline-simulation test step (e.g. devtools "Offline" throttling), not online-only/mocked tests.
- Any story adding a new lazy route (AD-6/AD-7, all epics) must re-verify that route has a guard attached — this regresses silently otherwise.
- Any story touching `share-access`-adjacent screens must stay within AD-10's v1 boundary (single read-only `accessCode`) — do not quietly rebuild the tiered scheme because the file is already open.
- The Excel export story (Epic 4) must vendor SheetJS from `cdn.sheetjs.com` per the Stack note — never `npm install xlsx`.
- The Excel export story (Epic 4) must verify exported totals match in-app totals to the pesewa (AD-5) — display-formatting must not reintroduce float math in the export path.
- **Every story that ships a new or changed screen must meet NFR-USE-003 (WCAG 2.1 AA) and pass AXE checks as part of that story's own Definition of Done** — focus management, color contrast, keyboard navigation, and ARIA attributes are built in screen-by-screen starting in Epic 1, not bolted on afterward. Story 5.1 (Epic 5) is the final full-app AXE/WCAG sweep, not the first time accessibility is addressed.

## Overview

This document provides the complete epic and story breakdown for Givio, decomposing the requirements from the PRD and the Architecture Spine into implementable stories. Per-screen UI detail is drawn from the 26 screen specs in `.claude/skills/plan/`.

## Requirements Inventory

### Functional Requirements

FR-AUTH-001: The system shall provide a secure login screen accessible to all user roles.
FR-AUTH-002: The system shall authenticate users against Appwrite Auth and issue session tokens on successful login.
FR-AUTH-003: The system shall redirect each user to a role-appropriate dashboard upon login.
FR-AUTH-004: The system shall support event-code-based login for Family Members.
FR-AUTH-005: The system shall provide a secure logout function from any screen.

FR-USR-001: Admin shall be able to create new user accounts with a defined role (Admin, User/Operator, Family Member).
FR-USR-002: Admin shall be able to edit user account details and roles.
FR-USR-003: Admin shall be able to deactivate or delete user accounts.
FR-USR-004: Admin shall be able to assign one or more Users (Operators) to specific events.
FR-USR-005: Assigned operators shall see only their assigned events in their dashboard.

FR-EVT-001: Admin shall be able to create a new event of type Wedding or Funeral.
FR-EVT-002: The system shall support multiple concurrent events with full data isolation.
FR-EVT-003: Admin shall be able to edit event details at any point before the event is closed.
FR-EVT-004: Admin shall be able to change an event's status: Active, Paused, or Closed.
FR-EVT-005: Admin shall be able to generate a unique access code for a Family Member per event.

FR-DON-001: Users shall be able to record a new donation entry against an assigned active event.
FR-DON-002: Users shall be able to edit a donation entry they recorded.
FR-DON-003: Admin shall be able to soft-delete a donation record.
FR-DON-004: Users shall be able to search and filter the donation list within an event.
FR-DON-005: The system shall display a running total of donations in real time during an event.

FR-OFF-001: The application shall detect network connectivity status and display it clearly.
FR-OFF-002: All donation entry, edit, and receipt functions shall work fully in offline mode.
FR-OFF-003: The system shall display the count of unsynced records pending upload.
FR-OFF-004: The system shall automatically sync local records to Appwrite upon detecting internet connectivity.
FR-OFF-005: The system shall detect and flag sync conflicts for Admin review.

FR-REC-001: The system shall generate a printable donation receipt immediately after a record is saved.
FR-REC-002: Each receipt shall contain a defined set of mandatory fields.
FR-REC-003: The receipt shall be downloadable as a PDF.
FR-REC-004: The receipt layout shall be professional and branded for the event.

FR-RPT-001: Admin shall be able to view a real-time donation summary dashboard per event.
FR-RPT-002: Admin shall be able to export the full donation record of an event as an .xlsx file.
FR-RPT-003: Family Members shall be able to view a live read-only summary for their event.
FR-RPT-004: Family Members shall be able to download a read-only Excel export of their event's data.

FR-DEV-001: The application shall be fully responsive and function correctly on mobile and desktop browsers.
FR-DEV-002: The application shall be installable as a Progressive Web App (PWA).
FR-DEV-003: Multiple operators shall be able to use the system on different devices simultaneously without conflict.

FR-SEC-001: All data in transit shall be encrypted using HTTPS/TLS.
FR-SEC-002: Role-Based Access Control (RBAC) shall be enforced at the Appwrite database permission level.
FR-SEC-003: Donor personal data (phone numbers) shall be accessible only to Admin and assigned Operators.
FR-SEC-004: The system shall maintain a full audit log for all create, edit, and delete operations.
FR-SEC-005: Session management shall enforce automatic expiry and secure token handling.

#### Multi-Tenancy & Role Hierarchy (added 2026-09-23, from `prd-givio-2026-09-23/prd.md`)

IDs below are the PRD's own stable `FR-N` sequence (distinct numbering track from the `FR-{DOMAIN}-NNN` IDs above) — kept verbatim rather than renumbered, since the Architecture Spine, SPEC.md, and the PRD itself already cite them by these exact IDs.

FR-1: The system shall resolve every access decision as an explicit per-Event grant, never an implicit company-wide permission, even for an Organizer's or Super Organizer's own tenant's Events.
FR-2: The system shall guarantee that no tenant can detect the existence of another tenant through any part of the product surface.
FR-3: An Operator assigned to more than one concurrent Event shall see an unmistakable on-screen indicator of which Event they are currently acting in, server-validated on every scoped write.
FR-4: An Operator shall authenticate using credentials scoped to the specific Organizer relationship that issued them, never a single identity reused across tenants.
FR-5: The system shall onboard each additional person at a tenant's leadership level as their own distinct account, never a shared credential set.
FR-6: The system shall support both Admin-invited and self-signup Organizer onboarding, with self-signup entering a pending state until Admin approves.
FR-7: The system shall collect company name, location, size, estimated user count, and company type before Admin can approve a self-signed-up Organizer.
FR-8: Admin shall review submitted intake info, a document upload, and complete a phone verification call before approving a self-signed-up Organizer.
FR-9: A pending-state Organizer shall have no access to create Events, add Operators, or view donation data.
FR-10: A Super Organizer shall be able to add co-Organizers and Operators, and manage or revoke either's privileges.
FR-11: A non-Super Organizer shall be able to add and manage Operators only, and shall never be able to add another Organizer.
FR-12: Adding a co-Organizer shall run the same identity checks as original Organizer signup and notify Admin on every addition.
FR-13: Revoking any person's access shall remove login/write access only — their name shall remain permanently attached to every donation they entered, and their account shall never be hard-deleted.
FR-14: The system shall detect potential duplicate Event registrations across tenants and notify Admin, without blocking Event creation.
FR-15: Audit log visibility shall follow the tenant boundary — Admin sees the platform-wide log, a Super Organizer sees only their own tenant's log.
FR-16: On family access-code entry, the system shall ask whether the device is personal; if not, the session shall auto-logout on navigation away, and the Organizer shall be able to invalidate/reissue a leaked code.
FR-17: If Admin suspends an Organizer account, the Family Member's read-only view for that tenant's Events shall keep working.
FR-18: A Family Member's view shall reflect every donation actually entered for their Event, with no partial or hidden totals.
FR-19: The system shall guarantee Admin can manage tenants independently with no cross-account interference, no Organizer gains Admin privileges, and every Admin access to tenant data is logged.
FR-20: The system shall provide a simple, logged Contact Admin form as the sole v1 support channel.
FR-21: A Super Organizer shall see a near-real-time consolidated donation total across their tenant's concurrent Events, updating within 15 seconds.
FR-22: The system shall provide a periodic settlement/export report of a tenant's consolidated donation totals.
FR-23: Adding an Operator shall run a lighter-weight identity check within the adding tenant, with Admin notified on a match.
FR-24: A person revoked for cause shall be added to the same banned/rejected cross-reference checked at signup and co-Organizer/Operator addition, platform-wide.
FR-25: Super Admin shall have every capability and access guarantee an ordinary Admin has, with nothing withheld.
FR-26: Only Super Admin shall be able to create, promote, demote, or suspend an Admin account.

### NonFunctional Requirements

NFR-PERF-001: Initial page load ≤ 3s on 4G.
NFR-PERF-002: Donation entry save ≤ 1s online, instant offline.
NFR-PERF-003: Receipt PDF generation ≤ 5s on mid-range mobile.
NFR-PERF-004: Excel export of 1,000 records ≤ 10s.
NFR-AVAIL-001: Online system uptime ≥ 99.5% monthly (Appwrite SLA).
NFR-AVAIL-002: 100% of core features available offline.
NFR-SCALE-001: ≥ 10 concurrent operators per event; ≥ 50 system-wide.
NFR-SCALE-002: ≥ 5,000 donation records per event with no degradation.
NFR-USE-001: Operator reaches full proficiency in ≤ 10 minutes.
NFR-USE-002: Donation entry form completion ≤ 30 seconds.
NFR-USE-003: WCAG 2.1 Level AA accessibility compliance.
NFR-SEC-001: Appwrite Auth with JWT; bcrypt password hashing.
NFR-SEC-002: TLS 1.2+ in transit; AES-256 at rest (Appwrite).
NFR-SEC-003: Penetration testing conducted before production release.
NFR-MAIN-001: ≥ 70% unit test coverage across Angular services/components.
NFR-MAIN-002: Appwrite collections versioned; schema migrations documented.
NFR-COMPAT-001: Chrome 90+, Safari 14+, Firefox 90+, Edge 90+.
NFR-COMPAT-002: Android 8+, iOS 14+, Windows 10+, macOS 11+.

#### Multi-Tenancy & Role Hierarchy (added 2026-09-23)

NFR-SEC-006: Tenant isolation and per-Event grants shall be enforced at the Appwrite permission/data layer, not just the UI.
NFR-SEC-007: Every access-control action (grant, revoke, approve, reject, suspend, co-Organizer addition) shall be logged immutably, with visibility following the tenant boundary.
NFR-SEC-008: No account that has ever recorded a donation shall be hard-deleted, platform-wide, under any admin tooling.
NFR-PERF-005: The consolidated cross-event total shall update within 15 seconds of a new donation.
NFR-USE-003 (existing, above) extends to every new screen this capability introduces (Organizer approval queue, event-switcher, Contact Admin form, consolidated dashboard) — no new ID needed.

### Additional Requirements

From the Architecture Spine (`ARCHITECTURE-SPINE.md`, 10 ADs) — each epic below must build to these, not re-derive them:

- AD-1: Global role (Admin/Operator) lives only as an Appwrite Label, never `account.prefs`. `AuthService` reads `account.labels`.
- AD-2: `Event.assignedUserIds` is the sole source of truth for operator assignment; Event/Donation document permissions are a projection derived from it (`Role.user(uid)` per assignee + `Role.label('admin')`), recomputed via AD-9's Function. Family read access derives from `Event.accessCode` the same way.
- AD-3: Conflict detection compares outbox `baseUpdatedAt` against the server's current `$updatedAt`. Conflicts land in a `DonationConflicts` collection (Admin-only), never silently overwritten. The `sync-status` screen's conflict section renders only for `Role.label('admin')`.
- AD-4: Every mutation writes Dexie + appends a per-entity outbox entry (`id, entityType, entityId, op, payload, baseUpdatedAt?, status, retries, createdAt`); `entityId` is client-generated via `ID.unique()` for idempotent create-retries; `SyncEngine` drains per-entity FIFO.
- AD-5: Money is integer minor units (GHS pesewas), never floats.
- AD-6: Route guards are functional `CanActivateFn`, checking `AuthService` role + the target event's `assignedUserIds`/`accessCode`.
- AD-7: Each role tree (admin/organizer/member) is a `loadChildren`/`loadComponent` lazy boundary.
- AD-8: Receipt numbers are provisional offline (`{eventShortCode}-P{n}`), finalized to a canonical sequential number via an atomic `nextReceiptSeq` counter on sync.
- AD-9: One Appwrite Function is the sole writer of Labels and derived permissions — invoked only from `data/repositories`, never Presentation directly.
- AD-10: v1 share access is exactly FR-AUTH-004's single hashed read-only `accessCode` — the richer `share-access.md` tiered/revocable scheme is explicitly out of scope for v1.

Layering (must be honored by every story): Presentation (`feature/{admin,organizer,member}`) → Domain/State (signal stores) → Data (`repositories/`, the only layer touching `appwrite`/`dexie`). No starter template — this is brownfield, not greenfield.

Brownfield state the epics must account for (from the Architecture Spine's reconciliation):
- `admin` page tree partially built (dashboard + stat-card/recent-activity/quick-actions/system-health widgets already exist).
- `organizer` tree currently exists only as an empty shell named `user` (`UserLayout`/`UserDashboard` have no logic).
- `member` tree does not exist at all yet.
- `auth/service/authservice.ts` is an empty, unused stub — to be replaced by `AuthService`.
- `src/lib/appwrite.ts` hardcodes the endpoint instead of reading `src/environments`, and only wraps `Account` — `Databases` is unused.
- Zero Dexie code exists anywhere — the entire offline layer is greenfield.
- Zero route guards exist; routing is flat and fully eager (4 routes).
- `shared/components` barrel exports only Button/Input/Preloader; Card/Checkbox/FilterTags/Progress/Radio/Select/Tag/Toggle exist as files but aren't wired in yet.

#### Multi-Tenancy & Role Hierarchy (added 2026-09-23)

AD-1, AD-2, and AD-9 above are **amended**, not superseded — their bullets are left as-written above since Epics 1–5's already-shipped stories were built against that wording; the amended text lives only in `ARCHITECTURE-SPINE.md` (cited here, not duplicated, to avoid the two copies drifting):

- AD-1 (amended): Appwrite Labels narrow to platform-wide `admin`/`super_admin` only (AD-11). Tenant-scoped role (Super Organizer/Organizer/Operator) moves to a new `Memberships` collection (`{userId, tenantId, role, status, grantedBy, grantedAt}`), written only by the AD-9 Function.
- AD-2 (amended): `Event` gains a `tenantId`. The Function refuses to grant `Role.user(uid)` unless `uid` holds an *active* Membership matching the Event's own tenant — this is where FR-2's structural isolation is enforced. Revocation or Tenant suspension now immediately sweeps and retracts affected permissions, not just on an `assignedUserIds` edit.
- AD-9 (amended, scope grown): the one Function is now also the sole writer of Memberships, Tenant approval state (`pending→approved/rejected/suspended`), the `IdentityFlags` banned/rejected cross-reference, and Admin/Super Admin account management — decomposed internally into per-concern files (extending the existing `admin-users.js`/`event-assignment.js` convention), still one deployable.
- AD-11 (new): Super Admin is dual-Labeled (`admin` + `super_admin`), bootstrapped out-of-band; admin-account management gates exclusively on `super_admin`.
- AD-12 (new): Admin/Super Admin read+write access logging is client-side (`AuditDataService`, extending the existing create/edit/delete pattern), at one-entry-per-Data-layer-method-invocation granularity — best-effort/accountability, not tamper-proof (deliberate trade-off, not a gap).
- AD-13 (new): duplicate-event detection runs only inside the Function (the one cross-tenant-visible trust boundary), writing to a dedicated `DuplicateEventFlags` collection; never blocks Event creation.
- New collections not covered above: `Tenants` (onboarding/approval state), a verification-document Storage bucket (Admin-only read), `SupportRequest` (Contact Admin form), and `audit_logs` gaining a `tenantId` column.
- Migration: existing test Admin/Event/Donation data clears before launch; new tenant-model code paths stay behind a feature flag until that reset is confirmed complete — no manual per-account reconciliation (production accounts are test data, not real tenants).
- Deferred to story-level design, not fixed by the Spine: duplicate-event matching algorithm, exact `IdentityFlags` matching fields, Super Admin succession mechanism, and the Function's operations/monitoring/backup envelope.

### UX Design Requirements

No formal bmad-ux `DESIGN.md`/`EXPERIENCE.md` contract exists. Instead, 26 per-screen specs in `.claude/skills/plan/*.md` supply UI/layout/content detail (sections, fields, states) for each screen and are cited directly in each story rather than restated here:

`admin-dashboard`, `admin-donations`, `admin-event`, `admin-report`, `admin-settings`, `organizer-dashboard`, `organizer-donations`, `organizer.events`, `organizer.report`, `member-dashboard`, `member-donation`, `member-events`, `login-screen`, `dashboard-screen`, `create-event-screen`, `edit-event`, `event-detail`, `add-donation`, `edit-donation`, `donation-list`, `donor-verify`, `export-preview`, `reports`, `event-reports`, `share-access` (v1.1+ per AD-10), `sync-status`.

**Gap (added 2026-09-23, resolved same day):** a `bmad-ux` pass ran and produced `DESIGN.md`/`EXPERIENCE.md` for this capability (`ux-designs/ux-givio-2026-09-23/`), reviewed and finalized. UX Design Requirements below are extracted from that pair, with the same rigor as the FR extraction above.

#### Multi-Tenancy & Role Hierarchy — UX Design Requirements (added 2026-09-23)

UX-DR1 (revised 2026-09-25): Build the new Organizer/Super-Organizer tier at a new route, `/company`, rather than reusing `/organizer` — the existing `/organizer` routes (today's Operator-tier, donation-recording staff) are left completely untouched. A rename was the original plan but was rejected as unnecessary regression risk on stable, shipped code for a naming-purity gain (EXPERIENCE.md Foundation).
UX-DR2: Build the Tier badge component — outlined pill, neutral color (never status-colored), icon + label always shown together, tooltip spelling out the tier's capability on hover/focus.
UX-DR3: Build the Tenant-status pill component — the existing `Tag` component re-skinned onto the existing 4-state status token vocabulary (pending/approved/rejected/suspended → pending/verified/flagged/reversed 1:1), always carrying a text label, never color alone.
UX-DR4: Build the Dignity banner component (patterned after the existing `ConnectionBanner`) in two variants: non-dismissible (family personal-device prompt — renders with no dismiss control at all, focus moves to it programmatically on render, behaves as a focus-trapping modal) and dismissible (Organizer-suspension family-safety message).
UX-DR5: Build the Approval-queue row component — `Card`-based, collapsed by default (name, tier badge, submitted date, tenant-status pill, Approve/Reject actions), expands inline via `aria-expanded` with focus moving into the expanded content on open and back to the row trigger on collapse; every action reachable by keyboard alone. See `mockups/approval-queue.html`.
UX-DR6: Build the Tenant-switcher component — `Select`-shaped, brand-blue border, always visible (never a hidden menu), a required pick before any scoped write. While unpicked, "Record Donation" renders enabled (never silently disabled) and on activation moves focus to the switcher with an explicit explanation message. See `mockups/tenant-switcher.html`.
UX-DR7: Build the Step-wizard shell for Organizer self-signup — numbered steps (company info → document upload → phone-verification-pending confirmation), Back always available, a single step's failure retains every other step's already-entered data, non-disclosing failure messaging when the identity/bypass check flags a match (never reveals why to the applicant).
UX-DR8: Implement the 7 new State Pattern rows: Tenant audit log empty state; Reports no-period-elapsed-yet state; Contact Admin submission-confirmation and submission-error states; consolidated cross-event total's loading (skeleton) and per-Event aggregation-error states (a failed Event's figure shows inline, never silently drops from or blocks the whole total).
UX-DR9: Implement the pending/rejected Organizer-dashboard full-page shell — while `Tenant.status` isn't `approved`, no sidebar nav renders at all (not merely hidden), matching FR-9's access boundary at the UI-shell level, not just the route-guard level.
UX-DR10: Wire the existing platform audit log screen (`admin-audit`, unchanged route) to display Admin/Super Admin's own tenant-data reads and writes as new rows — no new screen, an existing screen gains a row source (FR-19/FR-25's logging requirement made visible).

### FR Coverage Map

FR-AUTH-001: Epic 1 - Login screen, all roles
FR-AUTH-002: Epic 1 - Appwrite Auth session tokens
FR-AUTH-003: Epic 1 - Role-appropriate dashboard redirect
FR-AUTH-005: Epic 1 - Secure logout
FR-USR-001: Epic 1 - Admin creates user accounts with role
FR-USR-002: Epic 1 - Admin edits user accounts/roles
FR-USR-003: Epic 1 - Admin deactivates/deletes user accounts
FR-SEC-001: Epic 1 - HTTPS/TLS (hosting/deployment concern, verified at Epic 1 setup)
FR-SEC-005: Epic 1 - Session expiry, refresh rotation, force-expire
FR-EVT-001: Epic 2 - Create Wedding/Funeral event
FR-EVT-002: Epic 2 - Multi-event data isolation
FR-EVT-003: Epic 2 - Edit event details
FR-EVT-004: Epic 2 - Event status (Active/Paused/Closed)
FR-EVT-005: Epic 2 - Family access code generation
FR-AUTH-004: Epic 2 - Event-code login for Family Members (needs Event.accessCode, corrected from Epic 1)
FR-USR-004: Epic 2 - Assign operators to events
FR-USR-005: Epic 2 - Operators see only assigned events
FR-SEC-002: Epic 2 - RBAC enforced at Appwrite permission level (event-scoped)
FR-DON-001: Epic 3 - Record donation entry
FR-DON-002: Epic 3 - Edit donation entry
FR-DON-003: Epic 3 - Admin soft-delete donation
FR-DON-004: Epic 3 - Search/filter donation list
FR-DON-005: Epic 3 - Real-time running total
FR-OFF-001: Epic 3 - Connectivity detection
FR-OFF-002: Epic 3 - Full offline entry/edit/receipt
FR-OFF-003: Epic 3 - Pending sync count
FR-OFF-004: Epic 3 - Auto-sync on reconnect
FR-OFF-005: Epic 3 - Conflict detection/flagging
FR-REC-001: Epic 3 - Auto-generate receipt on save
FR-REC-002: Epic 3 - Mandatory receipt fields
FR-REC-003: Epic 3 - PDF download
FR-REC-004: Epic 3 - Branded receipt layout
FR-SEC-003: Epic 3 - Donor phone restricted to Admin/assigned Operators
FR-RPT-001: Epic 4 - Admin real-time summary dashboard
FR-RPT-002: Epic 4 - Admin Excel export
FR-RPT-003: Epic 4 - Family live read-only summary
FR-RPT-004: Epic 4 - Family Excel export (sanitized)
FR-SEC-004: Epic 4 - Full audit log, Admin-only viewer
FR-DEV-001: Epic 5 - Responsive mobile/desktop
FR-DEV-002: Epic 5 - Installable PWA
FR-DEV-003: Epic 5 - Multi-device concurrent operators

FR-1: Epic 6 - Per-event grant as the sole atomic unit
FR-2: Epic 6 - Structural tenant isolation
FR-3: Epic 6 - Operator event-switcher
FR-4: Epic 6 - Credentials-per-relationship
FR-5: Epic 6 - One human, one Organizer account
FR-6: Epic 6 - Two onboarding paths (Admin-invite / self-signup)
FR-7: Epic 6 - Required intake before approval
FR-8: Epic 6 - Manual v1 verification
FR-9: Epic 6 - Pending-state access boundary
FR-10: Epic 7 - Super Organizer manages co-Organizers and Operators
FR-11: Epic 7 - Organizer manages Operators only
FR-12: Epic 7 - Co-Organizer bypass-loophole closure
FR-13: Epic 7 - Revocation preserves attribution
FR-14: Epic 7 - Duplicate-event detection (platform-wide)
FR-15: Epic 7 - Tenant-scoped audit log visibility
FR-23: Epic 7 - Operator-addition identity check
FR-24: Epic 7 - Post-approval revocations feed the bypass check
FR-16: Epic 9 - Personal-device prompt and auto-logout
FR-17: Epic 9 - Family view survives Organizer suspension
FR-18: Epic 9 - Full donation visibility for family
FR-19: Epic 8 - Cross-account independence guarantees (Admin logging, Tenant suspend)
FR-20: Epic 8 - Contact Admin support form
FR-21: Epic 8 - Consolidated cross-event total
FR-22: Epic 8 - Periodic settlement/export report
FR-25: Epic 8 - Super Admin has full Admin capabilities
FR-26: Epic 8 - Super Admin manages Admin accounts

## Epic List

### Epic 1: Accounts, Roles & Secure Access
Admin can create Admin/Operator accounts with roles; any user can log in and land on a role-appropriate, route-guarded dashboard; sessions expire and rotate securely.
**FRs covered:** FR-AUTH-001..003, FR-AUTH-005, FR-USR-001..003, FR-SEC-001, FR-SEC-005
**Scope note:** FR-USR-001 lists "Family Member" as an account role option, but FR-AUTH-004/AD-2/AD-10 establish Family Members as `accessCode`-based (no real account) — reconciled here: the User Management role dropdown offers Admin/Operator only; Family Member access is granted per-event via access code (Epic 2), not a user account.
**Implementation notes:** Replaces the empty `Authservice` stub with `AuthService` (AD-1); consolidates `src/lib/appwrite.ts` into `data/appwrite/` reading `src/environments`; introduces functional route guards (AD-6) and the lazy-loaded admin/organizer/member route skeleton (AD-7); stands up the one Appwrite Function (AD-9) — this epic only needs its "write a Label" capability, extended in Epic 2 to also derive event permissions.
**Story sequencing:** the first story should be a thin end-to-end slice — login → guard → land on an empty role-appropriate dashboard — before building out full user-management CRUD, so the login/guard/AuthService chain is proven working early rather than validated only once the whole epic is done.

### Epic 2: Event Lifecycle & Assignment
Admin can create Wedding/Funeral events, edit them, control their status, assign Operators, and generate a Family Member access code that lets a Family Member log in without an account — with assignment enforced at the Appwrite permission level, not just the UI, so an unassigned Operator truly cannot reach an event's data.
**FRs covered:** FR-EVT-001..005, FR-USR-004..005, FR-SEC-002, FR-AUTH-004
**Implementation notes:** Builds `EventDataService`/`EventStore`/Dexie `events` table; extends the Epic 1 Function to derive Event/Donation permissions from `assignedUserIds` (AD-2); screens: `create-event-screen`, `edit-event`, `event-detail`, `admin-event`, the "Assign Operators" and access-code actions in `admin-settings`.

### Epic 3: Donation Recording, Offline Sync & Receipts
An Operator can record donations at a live event — online or fully offline — see the running total update, get an instant printable/PDF receipt, and have everything sync automatically once reconnected, with conflicts safely caught (never silently lost) and donor phone numbers visible only to Admin/assigned Operators.
**FRs covered:** FR-DON-001..005, FR-OFF-001..005, FR-REC-001..004, FR-SEC-003
**Implementation notes:** The core value-delivery epic — consolidated rather than split across Donation/Offline/Receipt epics since all three FR groups hit the same `DonationDataService`/Dexie outbox/`SyncEngine` files (AD-3, AD-4, AD-5, AD-8). Screens: `add-donation`, `edit-donation`, `donation-list`, `donor-verify`, `sync-status`. jsPDF added per Stack.

### Epic 4: Reporting, Dashboards, Export & Audit
Admin sees a real-time per-event dashboard and can export full donation records to Excel; Family Members see their own live read-only summary and a sanitized export; Admin can review the full, immutable audit log.
**FRs covered:** FR-RPT-001..004, FR-SEC-004
**Implementation notes:** Wires `admin-dashboard` widgets to real data, resolves the spine's Deferred Appwrite Realtime subscription; `ReportService` + vendored SheetJS export (per Stack note — not `npm install xlsx`); screens: `admin-report`, `organizer.report`, `event-reports`, `reports`, `export-preview`, `member-dashboard`, `member-donation`, `member-events`; `AuditDataService` + Audit Log Viewer.

### Epic 5: Install & Use Anywhere (PWA, Responsive, Multi-Device)
The app installs to a phone's home screen, works fully offline once installed, and multiple Operators can use it simultaneously on different devices without stepping on each other.
**FRs covered:** FR-DEV-001..003
**Implementation notes:** Fixes the duplicated `provideServiceWorker` call; adds `ngsw-config.json` `dataGroups` (currently asset-only); PWA manifest/icons; responsive pass (360px–1920px, ≥44px touch targets) across all 26 screens; Lighthouse PWA audit ≥ 90; multi-device concurrent-session verification (NFR-SCALE-001).

### Epic 6: Tenant Onboarding & Structural Isolation (added 2026-09-23)
An event company can sign up, get vetted by Admin, and start working — completely isolated from every other company on the platform, on their own scoped credentials.
**FRs covered:** FR-1..FR-9
**Implementation notes:** Foundational — every later epic in this set depends on it. Stands up `Tenants`/`Memberships` collections; amends AD-1 (Labels narrow to Admin/Super Admin only) and AD-2 (tenant-matched permission derivation) per the Architecture Spine. Includes UX-DR1 (the new tier lives at `/company`; the existing `/organizer` Operator-tier routes are untouched — no rename, see the Numbering note under Epic 6's detail section) and the approval-queue screen (UX-DR5) with its Organizer-applications tab.

### Epic 7: Team Lifecycle & Trust (added 2026-09-23)
Organizer leadership can grow their team safely — add co-Organizers and Operators with fraud checks built in, revoke access without erasing history — while the platform catches duplicate-event fraud across companies.
**FRs covered:** FR-10..FR-15, FR-23, FR-24
**Implementation notes:** Builds `IdentityFlags` and the AD-13 duplicate-detection logic; adds a second tab (Duplicate-event flags) to the approval-queue screen Epic 6 ships, rather than a new screen. Depends on Epic 6's Tenant/Membership infrastructure.

### Epic 8: Admin Oversight, Reporting & Platform Administration (added 2026-09-23)
Admin gets platform-wide oversight and support tooling; Super Organizer gets tenant-wide reporting; exactly one Super Admin can manage Admin accounts themselves.
**FRs covered:** FR-19..FR-22, FR-25, FR-26
**Implementation notes:** Implements AD-11 (Super Admin dual-Label) and AD-12 (client-side Admin access logging). Delivers `/dashboard/admins` inside the *existing* Admin route tree, gated by an additional `super_admin` check layered on the existing admin guard — no separate route tree/layout (this matches what the Architecture Spine's Capability Map already said; an earlier UX draft had introduced a redundant `/super-admin` tree, caught and dropped via Occam's Razor elicitation, 2026-09-25). This is where "suspend a Tenant" (consumed by FR-17 in Epic 9) actually gets built.

### Epic 9: Family Dignity & Access Safeguards (added 2026-09-23)
A grieving family always sees their event's true, complete donation picture — safely, even from a borrowed device, even if their Organizer's account is suspended.
**FRs covered:** FR-16..FR-18
**Implementation notes:** Deliberately last — FR-17 (view survives suspension) needs Epic 8's suspend capability to exist to be end-to-end testable. Mostly extends the existing v1 family access-code flow rather than building new infrastructure.

## Epic 1: Accounts, Roles & Secure Access

Admin can create Admin/Operator accounts with roles; any user can log in and land on a role-appropriate, route-guarded dashboard; sessions expire and rotate securely.

### Story 1.1: Secure Login & Role-Guarded Dashboard Landing

As an Admin or Operator,
I want to log in with my email and password and be taken straight to my own role's dashboard, and be blocked from any route outside my role,
So that I only ever operate within the part of the system meant for me.

**Acceptance Criteria:**

**Given** valid Admin credentials
**When** submitting the login form
**Then** an Appwrite session is created and I land on an empty `admin` dashboard shell
**And** my role is read from my Appwrite Label (AD-1), never from `account.prefs`

**Given** valid Operator credentials
**When** submitting the login form
**Then** I land on an empty `organizer` dashboard shell

**Given** invalid credentials
**When** submitting the login form
**Then** a generic "Invalid credentials" error is shown with no indication of whether the email or password was wrong
**And** after 5 failed attempts, further attempts are rate-limited (FR-AUTH-001)

**Given** I am logged in as an Operator
**When** I navigate directly to an admin-only URL (typed in the address bar, not via UI navigation)
**Then** a functional `CanActivateFn` guard (AD-6) denies access before the route loads
**And** the same guard protects every lazy-loaded route in the admin/organizer/member trees (AD-7), not just the ones with UI links to them

**Given** I am logged in
**When** I click Logout from any screen
**Then** my Appwrite session is cleared and I'm redirected to the login screen
**And** in-memory cached data is cleared, but the IndexedDB pending-sync outbox is retained (FR-AUTH-005)

### Story 1.2: Server-Side Role Writer (Appwrite Function)

As an Admin,
I want role changes to go through one trusted server-side Function rather than any client-writable mechanism,
So that no user — including a compromised or malicious client — can grant themselves elevated access.

**Acceptance Criteria:**

**Given** I am authenticated as an Admin
**When** a role-change request for a target user is submitted through `data/repositories` (exercised directly for this story — Story 1.3 wires a full User Management table to this same call)
**Then** the request is sent to the one Appwrite Function (never a direct client-side Label write, per AD-9)
**And** the Function verifies the caller holds `Role.label('admin')` before applying the change
**And** the target user's Appwrite Label is updated, taking effect on their next login (per FR-USR-002)

**Given** a non-Admin user
**When** they attempt to invoke the Function directly (e.g. via API tooling, bypassing the UI)
**Then** the Function rejects the call

**Given** the Function has just been deployed
**When** this story is verified
**Then** it is tested end-to-end against the real provisioned Appwrite Cloud project (project `69c270d10029e7ed7f82`), not a mock (Cross-Cutting DoD)

### Story 1.3: Admin User Management — Create, Edit, Deactivate

As an Admin,
I want to create, edit, and deactivate or delete user accounts with a role of Admin or Operator,
So that I control exactly who can access the system and what they can do.

**Acceptance Criteria:**

**Given** I am on the User Management screen (`admin-settings`)
**When** I create a new user with Name, Email, and Role (Admin or Operator only — Family Member is deliberately not offered here, see Epic 1's scope note)
**Then** the account is created and a password is auto-generated and emailed, or I set one manually (FR-USR-001)
**And** a duplicate email is rejected with a clear error

**Given** an existing user
**When** I edit their name, email, or role
**Then** the change is saved; an email change sends a verification to the new address; a role change routes through Story 1.2's Function (FR-USR-002)

**Given** an existing user
**When** I deactivate them
**Then** they can no longer log in, but their historical records are untouched

**Given** an existing user
**When** I delete them (with mandatory confirmation)
**Then** they are soft-deleted and any donation records they created are preserved and still display correctly (FR-USR-003)

### Story 1.4: Session Expiry & Security Hardening

As the system,
I want sessions to expire after inactivity, refresh tokens to rotate, and Admin to be able to force-expire a specific user's sessions,
So that stale or compromised sessions can't be abused.

**Acceptance Criteria:**

**Given** a logged-in user with no activity for 8 hours
**When** they next attempt an action
**Then** their session has expired and they're redirected to log in again (FR-SEC-005)

**Given** an active session
**When** a refresh occurs
**Then** the refresh token is rotated, not reused

**Given** an Admin viewing a specific user
**When** they trigger "force-expire sessions"
**Then** all of that user's active sessions end immediately, on every device

**Given** the app is deployed
**When** verified as part of this story's Definition of Done
**Then** it is served over HTTPS only, with HTTP redirected (FR-SEC-001 — a hosting/deployment check, not application code)

## Epic 2: Event Lifecycle & Assignment

Admin can create Wedding/Funeral events, edit them, control their status, assign Operators, and generate a Family Member access code that lets a Family Member log in without an account — with assignment enforced at the Appwrite permission level, not just the UI.

### Story 2.1: Create & Edit Events

As an Admin,
I want to create a new Wedding or Funeral event and edit its details afterward,
So that I can set up each event's basic record before donation-taking begins.

**Acceptance Criteria:**

**Given** I am on the Create Event screen (`create-event-screen`)
**When** I submit Event Name, Event Type (Wedding/Funeral), Date, and Host/Family Name (Venue/Description/Notes optional)
**Then** a new Event document is created with a unique system-generated ID, and `EventDataService`/`EventStore`/the Dexie `events` table (created for the first time in this story) all reflect it (FR-EVT-001)
**And** the event type is clearly labelled everywhere the event appears in the UI
**And** the Event document is created with its `nextReceiptSeq` counter initialized to 0 — Epic 3/Story 3.6 relies on this field already existing to assign canonical receipt numbers (AD-8)

**Given** two events exist
**When** donations are later recorded against each (Epic 3)
**Then** they are linked via `eventId` and never shared across events — this story lays the data-isolation foundation (FR-EVT-002)

**Given** an existing event, not yet closed
**When** I edit any of its fields via `edit-event`
**Then** the change is saved and a record is written to the `audit_logs` collection (entityType `event`, before/after values, my Admin ID, timestamp) — the Viewer UI for this log ships in Epic 4, but the write path starts here (FR-EVT-003)

**Given** an Admin or an assigned Operator logs in on a device/browser that has never locally created or synced a given event
**When** their event list loads
**Then** `EventDataService.listEvents()` queries Appwrite's `events` table — scoped automatically by Appwrite's own document permissions (Admin sees all events, an Operator sees only events where they're in `assignedUserIds`, per Story 2.3/AD-2) — and hydrates Dexie with the results, rather than only ever returning what this device itself previously wrote (FR-DEV-003)
**And** this query runs on login, not only once at first app install, so an event created or assigned on another device becomes visible without a fresh install

### Story 2.2: Event Status Lifecycle

As an Admin,
I want to set an event's status to Active, Paused, or Closed, and reopen a Closed event if needed,
So that I control whether an event currently accepts donations.

**Acceptance Criteria:**

**Given** an Active event
**When** I set its status to Closed
**Then** it stops accepting new donations (enforced when Epic 3's donation-entry story checks `event.status`) and the status change is logged

**Given** an Active event
**When** I set its status to Paused
**Then** new entry is temporarily blocked but all historical records remain fully accessible

**Given** a Closed event
**When** I reopen it
**Then** its status returns to Active and donation entry resumes (FR-EVT-004)

### Story 2.3: Assign Operators — Permission Derivation

As an Admin,
I want to assign one or more Operators to a specific event,
So that only the Operators I've assigned can ever see or record that event's data — enforced by Appwrite itself, not just the UI.

**Acceptance Criteria:**

**Given** I am on the event's assignment view (`admin-settings` / `event-detail`)
**When** I assign an Operator to an event
**Then** their user ID is added to `Event.assignedUserIds` (the sole source of truth, AD-2), and Story 1.2's Function recomputes the Event's and its Donations' Appwrite permissions to `[Role.user(uid) for uid in assignedUserIds] + Role.label('admin')`
**And** the same Operator can be assigned to multiple events simultaneously, and the assignment takes effect immediately without requiring the Operator to re-log in

**Given** an Operator not in `assignedUserIds` for a given event
**When** they attempt to read that event's data via the app, or via a direct Appwrite API call
**Then** access is denied at the Appwrite permission level itself — not only by the UI/route guard (FR-SEC-002, PRD acceptance criterion #16)

**Given** an Operator assigned to events A and B but not C
**When** they view their dashboard
**Then** only A and B appear in their event list; navigating directly to C's URL is denied by both the AD-6 guard and the underlying Appwrite permission (FR-USR-004, FR-USR-005)

### Story 2.4: Family Access Code & Event-Code Login

As an Admin,
I want to generate a Family Member access code for an event,
So that a family member can view that event's progress in real time without needing a full user account.

**Acceptance Criteria:**

**Given** an event
**When** I generate its Family access code
**Then** an alphanumeric code of at least 8 characters is created, stored hashed on `Event.accessCode`, and scoped to that one event only (FR-EVT-005)

**Given** an event already has an access code
**When** I regenerate it
**Then** the previous code is immediately invalidated

**Given** a valid access code
**When** someone enters it on the login screen (no account required)
**Then** they are granted read-only access scoped to that single event only, per AD-2/AD-10 — this is v1's *only* share-access mechanism; the richer `share-access.md` tiered/revocable scheme remains deferred (FR-AUTH-004)

## Epic 3: Donation Recording, Offline Sync & Receipts

An Operator can record donations at a live event — online or fully offline — see the running total update, get an instant printable/PDF receipt, and have everything sync automatically once reconnected, with conflicts safely caught and donor phone numbers restricted to Admin/assigned Operators.

### Story 3.1: Record a Donation — Online or Offline

As an Operator,
I want to record a donation against one of my assigned, Active events regardless of whether I currently have a connection,
So that I never lose a donation just because the venue's signal drops.

**Acceptance Criteria:**

**Given** I am on the Add Donation form (`add-donation`) for an assigned Active event
**When** I submit Donor Name, Amount, and Donation Type (Cash/Mobile Money/In-Kind), with optional Phone, "Donated On Behalf Of", and Notes
**Then** the entry is timestamped automatically, a confirmation dialog appears before saving, and the saved entry appears immediately in the event's donation list (FR-DON-001)

**Given** my device is offline
**When** I submit the exact same form
**Then** the donation is written to Dexie and an outbox entry is appended (client-generated `ID.unique()`, per-entity FIFO) — there is no separate "offline path," AD-4's write-local-then-queue pattern is identical whether online or offline

**Given** an amount like 150.50 GHS is entered
**When** it is saved
**Then** it is stored as integer pesewas (`15050`), never a float (AD-5)

**Given** a donor phone number is entered
**When** the record is later read by any role
**Then** it is visible only to Admin and the event's assigned Operators, never to a Family Member (FR-SEC-003, enforced by AD-2's derived permissions — this collection creates the Donation entity/Dexie table for the first time)

**Given** my connectivity status changes
**When** it does
**Then** a persistent Online/Offline indicator updates within 3 seconds with no action needed from me (FR-OFF-001)

**Given** an event whose status is Paused or Closed (set in Story 2.2)
**When** I attempt to submit the Add Donation form for it
**Then** the form rejects the attempt with a clear message — Closed/Paused events never accept new donations (FR-EVT-004)

### Story 3.2: Donation List — Search, Filter & Running Total

As an Operator or Admin,
I want to search, filter, and see a live running total on an event's donation list,
So that I can find a specific entry quickly and always know where the event stands.

**Acceptance Criteria:**

**Given** donations exist for an event
**When** I search by donor name (partial, case-insensitive) or phone
**Then** results update with a debounce of ≤ 300ms (FR-DON-004)

**Given** donations exist
**When** I filter by donation type or a date range
**Then** the list updates accordingly; an empty result shows "No donors found"

**Given** I am offline
**When** I view the donation list
**Then** every locally-stored record for my assigned events is visible, not just synced ones (FR-OFF-002)

**Given** I add or sync a new donation
**When** the list updates
**Then** the running total and per-type breakdown recalculate instantly on my own device — live cross-device push when *another* user adds one arrives in Epic 4 via Appwrite Realtime (FR-DON-005)

### Story 3.3: Edit a Donation Entry

As an Operator,
I want to edit a donation entry I recorded,
So that I can correct a mistake without losing accountability for what changed.

**Acceptance Criteria:**

**Given** a donation I recorded
**When** I edit any field (online or offline, via the same AD-4 outbox path)
**Then** the edit is applied and an edit log records my name, the original values, the new values, and the edit timestamp (FR-DON-002)

**Given** an edited record
**When** displayed in any list
**Then** it shows a visible "Edited" badge

**Given** Admin opens a record's history
**When** viewed
**Then** the full edit history is visible

### Story 3.4: Admin Soft-Delete a Donation

As an Admin,
I want to soft-delete a donation record,
So that I can remove erroneous entries from the active view while keeping them recoverable and logged.

**Acceptance Criteria:**

**Given** I am an Admin
**When** I delete a donation (mandatory confirmation prompt)
**Then** it is soft-deleted (`isDeleted`/`deletedAt`/`deletedBy` per PRD §9.1) — removed from the active list, retained in the database, recoverable within 30 days, and the deletion is logged (FR-DON-003)

**Given** I am an Operator, not an Admin
**When** I view a donation record
**Then** no delete action is available to me

### Story 3.5: Sync Engine — Auto-Sync, Pending Count & Conflict Detection

As an Operator,
I want my offline entries to sync automatically the moment I'm back online, see how many are still pending, and have any real conflict caught rather than silently overwritten,
So that I can trust the system never quietly loses or corrupts a donation.

**Acceptance Criteria:**

**Given** pending outbox entries exist
**When** viewing any screen
**Then** a badge shows the pending count (e.g. "3 pending sync"), disappearing once everything is synced (FR-OFF-003)

**Given** my device regains connectivity
**When** detected
**Then** `SyncEngine` begins draining the per-entity outbox within 5 seconds, in the background without blocking the UI, and a toast confirms "Sync complete — X records uploaded" (FR-OFF-004)

**Given** a sync attempt fails
**When** it does
**Then** the record is marked `failed`, retried on the next cycle, and a "Retry Sync" option is surfaced

**Given** two Operators offline-edited the same donation
**When** both later sync
**Then** the second push's `baseUpdatedAt` no longer matches the server's current `$updatedAt` (AD-3): the losing version is written to `DonationConflicts` (Admin-only, referencing both versions), the server document is left untouched, and the local record's `syncStatus` becomes `conflict` (FR-OFF-005)

**Given** this story is being verified (Cross-Cutting DoD)
**When** tested
**Then** the full offline → reconnect → sync cycle is exercised with an actual offline simulation (e.g. devtools throttling), not mocks alone

### Story 3.6: Receipt Generation, PDF & Provisional Numbering

As an Operator,
I want a printable receipt generated the instant I save a donation, online or offline,
So that the donor leaves with proof of their contribution regardless of connectivity.

**Acceptance Criteria:**

**Given** a donation is saved
**When** saved (online or offline)
**Then** a print-ready A5/A6 receipt is generated automatically, containing Event Name/Type, Donor Name, Amount (GHS), Donation Type, "Donated On Behalf Of" (if entered), Date/Time, receipt number, Operator name, and a thank-you message (FR-REC-001, FR-REC-002)

**Given** I am offline when the donation is saved
**When** the receipt is generated
**Then** it shows a provisional number (e.g. `WED42-P7`) with a small "provisional" marker (AD-8); once the donation syncs, the canonical sequential number is assigned via the Event's atomic `nextReceiptSeq` counter — nothing already printed needs reprinting

**Given** the receipt
**When** I download it
**Then** it's a client-generated PDF (jsPDF, fully offline-capable), named `Receipt_[EventName]_[ReceiptNo].pdf`, downloaded immediately with no server round-trip (FR-REC-003)

**Given** the receipt layout
**When** rendered
**Then** it's clean and legible for printing, with a prominent Event Name and a dividing border/line (FR-REC-004)

## Epic 4: Reporting, Dashboards, Export & Audit

Admin sees a real-time per-event dashboard and can export full donation records to Excel; Family Members see their own live read-only summary and a sanitized export; Admin can review the full, immutable audit log.

### Story 4.1: Admin Real-Time Dashboard

As an Admin,
I want an event dashboard that updates live as any Operator records a donation, on any device,
So that I always see the true current state without refreshing or asking anyone.

**Acceptance Criteria:**

**Given** I am viewing an event's dashboard
**When** any assigned Operator adds a donation from any device
**Then** the total, per-type breakdown, and donation list update automatically via an Appwrite Realtime subscription — no page reload, no polling (FR-RPT-001, resolves the Architecture Spine's Deferred Realtime item, and upgrades Story 3.2's own-device total to a true cross-device live total, FR-DON-005)

**Given** the dashboard opens on a device that has never locally created or synced this event's donations
**When** the page loads, before any Realtime event has fired
**Then** an initial list query against Appwrite's `donations` table for this event establishes the current total/breakdown/list first — the Realtime subscription only applies deltas on top of that baseline, it does not substitute for it

**Given** the dashboard
**When** displayed
**Then** it shows Total Amount, Number of Donors, breakdown by Donation Type, and a chronological donation list (donor, amount, type, time)

**Given** I apply a date range filter
**When** applied
**Then** the dashboard reflects only that range

**Given** the existing `admin-dashboard` widgets (`stat-card`, `recent-activity`, `quick-actions`, `system-health` — already built in the brownfield code with placeholder data)
**When** this story ships
**Then** they are wired to real Event/Donation data

### Story 4.2: Admin Excel Export

As an Admin,
I want to export an event's full donation record as an Excel file,
So that I can hand off clean, accountable records for bookkeeping or the host family.

**Acceptance Criteria:**

**Given** I am on an event
**When** I export
**Then** a `.xlsx` file named `DMS_[EventName]_[Date].xlsx` is generated client-side with columns Receipt No., Donor Name, Phone, Amount, Type, Donated On Behalf Of, Notes, Recorded By, Date & Time, plus a totals summary row (FR-RPT-002)

**Given** the export
**When** generated
**Then** it uses the vendored SheetJS tarball from `cdn.sheetjs.com` — never `npm install xlsx` (Cross-Cutting DoD)

**Given** exported totals
**When** compared against the in-app total
**Then** they match to the pesewa — no float drift (Cross-Cutting DoD, AD-5)

**Given** I want a subset
**When** I filter by date range before exporting
**Then** only that range is included

### Story 4.3: Family Live Summary

As a Family Member,
I want to see my event's live donation summary without needing an account,
So that I can follow along in real time using only my access code.

**Acceptance Criteria:**

**Given** I logged in via my event's access code
**When** I view my event summary
**Then** I see a real-time total, donor count, and donor list with Name and Amount — never phone numbers (FR-RPT-003)

**Given** a new donation is recorded by an Operator
**When** it's saved
**Then** my summary auto-refreshes without a page reload, via the same Realtime subscription pattern as Story 4.1, scoped read-only to my one event

### Story 4.4: Family Excel Export (Sanitized)

As a Family Member,
I want to download my event's data as Excel,
So that I have my own copy of the record without exposing Operator or donor phone information.

**Acceptance Criteria:**

**Given** I am a Family Member
**When** I export
**Then** the same `.xlsx` format as the Admin export (Story 4.2) is produced, with Operator names and donor phone numbers removed (FR-RPT-004)

### Story 4.5: Audit Log Viewer

As an Admin,
I want to review a complete, immutable log of every create/edit/delete across the system,
So that any dispute or discrepancy can be traced to exactly who did what and when.

**Acceptance Criteria:**

**Given** Event edits (Story 2.1) and Donation creates/edits/deletes (Stories 3.1/3.3/3.4) have been writing to `audit_logs` since those epics shipped
**When** I open the Audit Log Viewer
**Then** every mutation is listed with user ID, action type, timestamp, and before/after values (FR-SEC-004)

**Given** a non-Admin user
**When** they attempt to access the Audit Log Viewer
**Then** access is denied entirely

**Given** an audit log entry
**When** any attempt is made to edit or delete it
**Then** it is rejected — the log is immutable

## Epic 5: Install & Use Anywhere (PWA, Responsive, Multi-Device)

The app installs to a phone's home screen, works fully offline once installed, and multiple Operators can use it simultaneously on different devices without stepping on each other.

### Story 5.1: Responsive Layout Across All Screens

As any user, on any device,
I want every screen to work correctly whether I'm on a phone at the venue or a desktop in the office,
So that the tool I'm handed actually works on the device I have.

**Acceptance Criteria:**

**Given** any of the 26 screens
**When** viewed at any width from 360px to 1920px
**Then** all features work correctly with no horizontal scrolling (FR-DEV-001)

**Given** mobile use
**When** interacting with any control
**Then** touch targets are at least 44px

**Given** a form on a touchscreen
**When** filling it in
**Then** it's usable without needing to zoom

**Given** every screen across all 5 epics has already met the per-story WCAG/AXE Definition of Done as it was built
**When** this story runs a full-app AXE sweep
**Then** the whole application passes WCAG 2.1 AA — this story is the final cross-app check, not the first time accessibility was addressed (NFR-USE-003)

### Story 5.2: Installable PWA

As an Operator,
I want to install the app to my phone's home screen and have it work offline like a native app,
So that I don't need to find a browser tab mid-event.

**Acceptance Criteria:**

**Given** the app
**When** visited on Android or iOS
**Then** it can be installed to the home screen, with a configured app icon and splash screen (FR-DEV-002)

**Given** the currently duplicated `provideServiceWorker(...)` call in `app.config.ts`
**When** this story ships
**Then** it is fixed to a single registration

**Given** `ngsw-config.json` (currently asset-only caching)
**When** updated
**Then** appropriate `dataGroups` are added, consistent with the offline-first design already built in Epic 3

**Given** the installed PWA
**When** audited with Chrome Lighthouse
**Then** it scores ≥ 90 on the PWA audit

### Story 5.3: Multi-Device Concurrent Operators

As an Admin,
I want 10+ Operators to use the system simultaneously across different devices without any data race,
So that a large event with many helpers doesn't corrupt or lose anyone's entries.

**Acceptance Criteria:**

**Given** 10+ concurrent Operators across different devices, each recording donations
**When** tested under load
**Then** no data race conditions occur — every entry is isolated by the recording Operator's user ID (FR-DEV-003, NFR-SCALE-001)

**Given** another Operator's entry is saved
**When** it syncs
**Then** Appwrite Realtime (Story 4.1's subscription) pushes it to my event list without a page refresh

**Given** one Operator logged in on two devices at once
**When** both are active
**Then** this is explicitly allowed (per Story 1.4/FR-SEC-005) with no conflict between the sessions

## Epic 6: Tenant Onboarding & Structural Isolation

An event company can sign up, get vetted by Admin, and start working — completely isolated from every other company on the platform, on their own scoped credentials.

**Numbering note:** this epic starts at Story 6.2. Story 6.1 (renaming the existing `/organizer` Operator-tier routes to `/operator` to free the name up) was drafted, then dropped during a 2026-09-25 Steelmanning elicitation pass — the rename was unnecessary regression risk on stable, shipped code for a naming-purity gain. The new Organizer/Super Organizer tier is instead built at a new route, `/company`, from the start, leaving the existing `/organizer` routes completely untouched. The ID is left retired rather than renumbering every story that already cross-references 6.2–6.6 by number.

### Story 6.2: Tenant & Membership Foundation

As a Super Organizer,
I want my tenant's access boundaries enforced at the data layer, not just trusted to the UI,
So that I can be confident no client-side bug or malicious actor can grant themselves or anyone else access to my company's data.

**Acceptance Criteria:**

**Given** a new `Tenants` collection (`id, name, location, size, type, estimatedUserCount, status, superOrganizerId, verifiedBy, verifiedAt, createdAt`) and a new `Memberships` collection (`userId, tenantId, role, status, grantedBy, grantedAt`)
**When** this story ships
**Then** both collections have no client create/update/delete permission at all — every write goes through the existing AD-9 Function, extended to write Memberships and Tenant status (AD-1, AD-9)

**Given** `Event` gains a `tenantId` field, set at creation and immutable thereafter
**When** the Function is asked to add `Role.user(uid)` to an Event's (or its Donations') derived permissions
**Then** it checks `uid`'s Membership: only an **active** Membership whose `tenantId` matches the Event's own `tenantId` results in the grant being added — a mismatched or inactive Membership is refused, even if the caller supplies a validly-formatted Event ID from another tenant (FR-1, FR-2, AD-2)

**Given** a Membership's `status` changes to `revoked`, or a Tenant's `status` changes to `suspended` or `rejected`
**When** that change is written by the Function
**Then** every Event permission grant that depended on it is swept and retracted in the same operation — not deferred until a later, unrelated `assignedUserIds` edit (AD-2, tightened by the 2026-09-23 reviewer gate)

**Given** a newly created Membership with no Event grants yet
**When** the person it belongs to attempts any Event read or write
**Then** they are denied — a Membership alone confers identity, never Event access (FR-1)

**Given** an Organizer's own attempt to list or search for a person or Event to add to their team
**When** the query runs
**Then** it can never return a person or Event belonging to another tenant, and a "not found" response is indistinguishable in shape from an "exists but not yours" response (FR-2)

### Story 6.3: Credentials-Per-Relationship Enforcement

As a person who may work for more than one event company over time,
I want each company relationship to have its own separate login,
So that revoking my access at one company can never affect my access at another.

**Acceptance Criteria:**

**Given** a person who already holds an Appwrite Account tied to one tenant's Membership
**When** a second tenant tries to add that same person (matched by email), via a direct call to the Function (exercised directly for this story — Epic 7's Story 7.1 wires the Team-management UI to this same call)
**Then** the platform requires a distinct Account for the new relationship — there is no product surface anywhere that attaches a second tenant's Membership to an existing Account (FR-4, FR-5)

**Given** two separate Accounts belonging to the same human, one per tenant
**When** one relationship's Membership is revoked via a direct call to the Function (exercised directly for this story — Epic 7's Story 7.3 wires the Revoke action to this same call)
**Then** the other Account's session and Membership are completely unaffected — verified by revoking one and confirming the other's Event access is unchanged (FR-4)

**Given** a direct Function call adding a co-Organizer or Operator on a Super Organizer's behalf
**When** it's processed
**Then** the flow always provisions a new Account for that person, never a mechanism to share or forward the Super Organizer's own credentials (FR-5)

### Story 6.4: Organizer Onboarding — Admin-Invited & Self-Signup

As a prospective Organizer,
I want to either be invited directly by Admin or sign myself up and wait for approval,
So that I can start using the platform through whichever path fits how I found it.

**Acceptance Criteria:**

**Given** Admin creates/invites a new Organizer directly
**When** the invite is sent and accepted
**Then** the resulting Tenant and Super Organizer Membership are immediately `active` — no pending state (FR-6)

**Given** a prospective Organizer self-signs-up
**When** they complete the step-wizard intake — company name, location, size, estimated platform-user count, company type, then a document upload, then a confirmation step (UX-DR7) — and submit
**Then** a new `Tenant` is created with `status: pending` and a `Membership` for the applicant as `super_organizer`, and Admin's approval action is unavailable until every required intake field is present (FR-7)

**Given** the applicant's Tenant is `pending`
**When** they log in
**Then** the full-page pending shell renders — no sidebar navigation at all, not merely a hidden one — and every Event-facing and user-management route rejects them server-side, not just hides its UI entry point (FR-9, UX-DR9)

**Given** the step-wizard's document-upload step fails partway through
**When** the applicant retries
**Then** only that step resets — company info already entered in step 1 is retained, not lost (UX-DR7)

**Given** a Tenant whose `status` becomes `rejected`
**When** the applicant next logs in
**Then** they see the same pending-shell pattern with the message swapped to a generic "not approved" — no reason disclosed (FR-9 boundary, consistent with the non-disclosure rule Story 6.5/7.3 establish for identity-check failures)

### Story 6.5: Manual Verification & Admin Approval Queue

As Admin,
I want to review a self-signed-up Organizer's intake, document, and a phone call before approving them,
So that no unvetted company can start touching real families' data.

**Acceptance Criteria:**

**Given** a pending Tenant application
**When** Admin opens the Approvals screen
**Then** the row renders collapsed by default (name, tier badge, submitted date, pending status pill, Approve/Reject) and expands inline — via `aria-expanded`, focus moving into the expanded content on open and back to the row trigger on collapse — to show the intake fields and the verification-document link (FR-8, UX-DR5)

**Given** Admin has reviewed the document and completed the phone verification call
**When** they record that verification
**Then** `Tenant.verifiedBy` and `Tenant.verifiedAt` are set — the record shows who verified and when, not just a boolean "approved" (FR-8)

**Given** Admin clicks Approve
**When** the action completes
**Then** the Tenant's `status` becomes `approved`, the applicant's Membership becomes fully usable, and the applicant can log in to their real (empty) dashboard on next login — no separate activation step (FR-6, FR-8)

**Given** Admin clicks Reject
**When** the action completes
**Then** the Tenant's `status` becomes `rejected` and every row action for it disappears from the active queue

**Given** Admin has not yet completed the document review and phone call
**When** they attempt to Approve
**Then** the action is unavailable — an approval cannot be recorded without both verification steps present (FR-8)

**Given** the Approvals screen with no pending applications
**When** Admin opens it
**Then** it shows the empty-queue state ("No applications waiting"), not a blank or loading-forever screen

### Story 6.6: Operator Event-Switcher

As an Operator assigned to more than one concurrent Event,
I want to always know unmistakably which Event I'm currently acting in, and be unable to record against the wrong one,
So that I never fire a scoped action against an Event I didn't mean to.

**Acceptance Criteria:**

**Given** an Operator assigned to 2+ active Events
**When** they open their dashboard
**Then** the tenant-switcher is visible in the header at all times — never a hidden menu — and no Event is pre-selected by default (FR-3, UX-DR6)

**Given** no Event is yet picked
**When** the Operator attempts to record a donation
**Then** "Save Donation" renders enabled, not silently disabled — activating it moves focus to the switcher and shows an explicit "Pick an Event first" message (FR-3, UX-DR6)

**Given** the Operator picks an Event from the switcher
**When** the pick is made
**Then** the page-head updates to name that Event alongside the switcher itself — the active Event is confirmed in two places, not one (FR-3)

**Given** an Event is picked and a donation is submitted
**When** the save request reaches the server
**Then** it is validated against the Event the UI currently indicates as active — a mismatch between what the client claims and what the server independently verifies is rejected, never silently corrected to "the right one" (FR-3)

**Given** an Operator assigned to only one active Event
**When** they open their dashboard
**Then** the switcher does not render at all — the single-Event case has no ambiguity to resolve, per the underlying v1 assignment model this extends (FR-3)

## Epic 7: Team Lifecycle & Trust

Organizer leadership can grow their team safely — add co-Organizers and Operators with fraud checks built in, revoke access without erasing history — while the platform catches duplicate-event fraud across companies.

### Story 7.1: Add & Manage Team Members

As a Super Organizer,
I want to add co-Organizers and Operators and manage or revoke either's privileges,
So that I can build out my company's team without giving up control of who has it.

**Acceptance Criteria:**

**Given** I am a Super Organizer on `/company/team`
**When** I add a co-Organizer or an Operator
**Then** a new Membership is created for them at my tenant (Story 6.2's model) with zero Event access until I grant it against a specific Event (FR-10)

**Given** an existing co-Organizer
**When** I revoke their privileges
**Then** they immediately lose the ability to add or manage Operators — their own Membership status change cascades per Story 6.2's sweep behavior, not a separate mechanism (FR-10)

**Given** I am a non-Super Organizer on `/company/team`
**When** the page renders
**Then** "Add Operator" is available but "Add Organizer" is not present anywhere in the page — not disabled, not hidden behind a tooltip, simply never rendered — and a direct call attempting to add an Organizer is rejected server-side regardless (FR-11)

**Given** the team list is empty (first login after Story 6.5's approval)
**When** I open `/company/team`
**Then** I see the empty-team state ("You haven't added anyone yet") with primary "Add co-Organizer"/"Add Operator" actions

### Story 7.2: Identity Check on Team Additions

As Admin,
I want every co-Organizer or Operator addition checked against known bad actors before it takes effect,
So that someone rejected or removed elsewhere can't quietly join a different company.

**Acceptance Criteria:**

**Given** a new `IdentityFlags` collection (`name, email, phone, reason, flaggedAt, sourceType, flaggedByTenantId`), written only by the Function
**When** a Super Organizer adds a co-Organizer
**Then** the addition is cross-referenced against `IdentityFlags` and I am notified — every time, whether or not it matches (FR-12)

**Given** an Organizer (Super or not) adds an Operator
**When** the addition is submitted
**Then** it runs against the *same* platform-wide `IdentityFlags` cross-reference the co-Organizer check uses — this is what makes a for-cause revocation (Story 7.3, FR-24) actually catch someone re-attempting as an Operator at a different tenant — **plus** an additional, lighter-weight same-tenant check (name/email/phone against existing or previously-revoked people at that tenant); I am notified on either kind of match (FR-23). *(Corrected 2026-09-25 — an earlier draft scoped this check to same-tenant only, which directly contradicted Story 7.3's cross-tenant guarantee; caught via Assumption Audit.)*

**Given** an addition matches `IdentityFlags`
**When** the match is detected
**Then** the new row appears in the adding Organizer's team list with a pending status, not a rejection — no error, no explanation of why (FR-12, FR-23)

**Given** I review a flagged addition and confirm it's a real match
**When** I act on it
**Then** the row is removed from the team list on the adder's next view, with no notification explaining why (FR-12, FR-23)

**Given** I review a flagged addition and it's a false positive (coincidental name match)
**When** I clear it
**Then** the row silently transitions to active on the adder's next view — the adder never learns a check happened either way

**Given** I clear a false-positive match at one tenant
**When** a *different* tenant later attempts to add a person matching the same name/email/phone
**Then** that addition runs its own independent check and gets its own review if it matches — a clearance at one tenant is never treated as a platform-wide "this identity is fine" record, since caching it that way would let a real bad actor get laundered through one easy clearance and walk into every other tenant unchecked

### Story 7.3: Revocation Preserves Attribution; For-Cause Revocations Feed the Bypass List

As anyone reviewing an event's donation history,
I want every donation's recorder name to stay exactly as it was, no matter what happened to that person's access since,
So that accountability for money never depends on an account still existing.

**Acceptance Criteria:**

**Given** a person (Organizer, co-Organizer, or Operator) with donations recorded under their name
**When** their access is revoked, for any reason
**Then** their login/write access is removed but every donation they recorded still displays their name identically to before — no delete operation exists anywhere in the product for an account any donation references (FR-13)

**Given** I am revoking someone's access
**When** I complete the revoke action
**Then** I must state whether this is routine offboarding or for-cause (fraud/active investigation) — the two are never conflated into one generic "revoke" (FR-13, FR-24)

**Given** I mark a revocation as for-cause
**When** it's recorded
**Then** that person is added to the same `IdentityFlags` list Story 7.2 checks, platform-wide — so a self-signup, co-Organizer addition, or Operator addition matching them at any other tenant gets flagged the same way (FR-24)

**Given** I mark a revocation as routine offboarding
**When** it's recorded
**Then** no `IdentityFlags` entry is created — an Operator who simply left is never treated as a fraud signal (FR-24)

### Story 7.4: Platform-Wide Duplicate-Event Detection

As Admin,
I want the platform to flag when the same event or deceased individual looks like it's been registered more than once, across different companies,
So that a family can't be double-billed by two companies claiming the same funeral.

**Acceptance Criteria:**

**Given** a new Event is created, by any tenant
**When** the Function processes the creation
**Then** it compares against Events platform-wide — the only place this comparison can run, since it's the sole boundary with cross-tenant reach — never a tenant-scoped check an Organizer's own client could perform (FR-14)

**Given** a potential duplicate is detected
**When** the Event is created
**Then** Event creation is **not** blocked — the Organizer's flow completes normally, and a flag appears on the Duplicate-event flags tab of the Approvals screen (Story 6.5) for Admin to review (FR-14)

**Given** I review a duplicate-event flag
**When** I confirm it's a genuine duplicate or clear it as a false positive (e.g. a legitimate reschedule)
**Then** the flag is resolved and removed from the active queue either way — a cleared flag never reappears for the same pair of Events

**Given** no duplicate-event flags are pending
**When** I open that tab
**Then** I see the same empty-queue state pattern as the Organizer-applications tab

### Story 7.5: Tenant-Scoped Audit Log

As a Super Organizer,
I want to see my own company's activity trail — and only my own company's,
So that I can review what my co-Organizers and Operators have done without needing Admin's help.

**Acceptance Criteria:**

**Given** I am a Super Organizer on `/company/audit`
**When** the page loads
**Then** I see every logged action taken by my tenant's co-Organizers and Operators — never another tenant's, even attempted via direct API access, since visibility is enforced at the query/permission level, not filtered client-side (FR-15)

**Given** my tenant has no logged activity yet
**When** I open `/company/audit`
**Then** I see an empty-log state ("No activity yet"), reusing the existing empty-state pattern

**Given** Admin's existing platform-wide audit log (`admin-audit`, unchanged)
**When** compared against my tenant-scoped view
**Then** Admin's log includes everything mine does plus every other tenant's — my view is a strict subset, never a divergent one

## Epic 8: Admin Oversight, Reporting & Platform Administration

Admin gets platform-wide oversight and support tooling; Super Organizer gets tenant-wide reporting; exactly one Super Admin can manage Admin accounts themselves.

### Story 8.1: Admin Suspends a Tenant

As Admin,
I want to suspend an entire Organizer account under investigation,
So that its Organizer and Operators lose access immediately without me having to hunt down each of their Memberships individually.

**Acceptance Criteria:**

**Given** an `approved` Tenant
**When** Admin suspends it
**Then** `Tenant.status` becomes `suspended`, and every Membership under that tenant is swept per Story 6.2's cascade — every Organizer, co-Organizer, and Operator loses login/write access in the same operation, not eventually (FR-19)

**Given** a suspended Tenant
**When** Admin reviews and clears the investigation
**Then** Admin can transition it back to `approved`, and Memberships resume normal access without needing to be individually re-granted

**Given** any Organizer or Operator action, at any tenant
**When** it executes
**Then** it can never modify Admin's own access level or any other tenant's account state — verified by attempting a suspend/approve action from a non-Admin role and confirming server-side rejection (FR-19)

**Given** a tenant whose sole Super Organizer has been revoked (Story 7.3), leaving co-Organizers or Operators with no one able to add/manage the team
**When** Admin reviews the tenant
**Then** Admin can designate an existing co-Organizer (or a newly-added person) as the new Super Organizer, using Admin's own standing cross-tenant access (FR-19) — a tenant is never permanently orphaned by losing its Super Organizer

**Given** the suspend action's permission-sweep is attempted (Story 6.2's cascade)
**When** the underlying Function call fails or times out (e.g. during an outage) rather than succeeding
**Then** the suspend is reported to Admin as failed, not as succeeded — the UI never shows "Tenant suspended" unless the sweep is confirmed complete, since a silently-incomplete sweep would leave a suspended tenant's Operators with live access exactly when the investigation needs them cut off

### Story 8.2: Admin/Super Admin Access Logging

As Admin,
I want my own reads and writes of any tenant's data to be logged, the same way an Organizer's actions already are,
So that my own access is accountable, not a silent exception to the system's own audit discipline.

**Acceptance Criteria:**

**Given** I (Admin or Super Admin) list or view any tenant's Events or Donations
**When** the query resolves
**Then** `EventDataService`/`DonationDataService` fire one audit-log entry per Data-layer method invocation — not per row — recording actor, tenant, and timestamp (AD-12, FR-19)

**Given** those entries
**When** I open the platform-wide audit log (`admin-audit`)
**Then** my own past reads/writes appear alongside every Organizer's and Operator's — self-visible, not hidden from the log I myself can see

**Given** this logging mechanism is client-side, not Function-proxied
**When** verified
**Then** it's documented as best-effort/accountability, not tamper-proof — a deliberate trade-off (AD-12), not treated anywhere in this story as a gap to close

### Story 8.3: Contact Admin Support Form

As a Super Organizer or Organizer,
I want a simple way to reach Admin with a question,
So that I'm not stuck without a support channel when something looks wrong.

**Acceptance Criteria:**

**Given** a new `SupportRequests` collection (`tenantId, userId, message, createdAt, status`), Admin-only read
**When** I submit the Contact Admin form at `/company/support`
**Then** the submission is retained and associated with my tenant/account, and I see an inline confirmation ("Sent — Admin will follow up") replacing the form, with no redirect (FR-20)

**Given** the submission fails (network/server error)
**When** it happens
**Then** my entered text is retained and an inline error appears above the submit button, matching the existing donation-entry save-failure pattern (FR-20)

**Given** this is v1's only support channel
**When** verified
**Then** no ticket-status-tracking UI exists anywhere — a logged form, not a ticketing system (FR-20, explicit Non-Goal)

**Given** my tenant has been suspended (Story 8.1) and I can no longer log in
**When** I need to dispute it
**Then** I can still reach a public, unauthenticated dispute form at `/company/dispute`, identifying myself by email and tenant name — the same `SupportRequests` collection, a submission type Admin can distinguish from an ordinary question, so suspension never also cuts off the one channel that could correct a wrongful suspension (FR-20, added 2026-09-25 via Stakeholder Lens Rotation elicitation)

### Story 8.4: Consolidated Cross-Event Total

As a Super Organizer,
I want to see a live total across all of my company's concurrently running Events,
So that I know where my company stands without opening each Event individually.

**Acceptance Criteria:**

**Given** my tenant has 2+ concurrently Active Events
**When** I open my dashboard
**Then** I see a consolidated total that reflects a new donation recorded on any of those Events within 15 seconds, without a manual refresh (FR-21)

**Given** my tenant is newly approved with zero Events or zero donations recorded yet
**When** I open my dashboard
**Then** I see a real, explicit `GH₵0.00` total — never an error, a blank area, or a "no data" state that could be mistaken for something broken or hidden (FR-21, mirrors FR-18's same zero-state discipline for the family view)

**Given** the dashboard is loading
**When** the page first renders
**Then** the total/breakdown area shows a skeleton placeholder, matching the existing admin-dashboard's own loading treatment — never a blank flash

**Given** one Event's figures fail to aggregate
**When** the total renders
**Then** that Event's row shows a small inline "couldn't load" note rather than silently dropping from, or blocking, the whole total (FR-21)

### Story 8.5: Periodic Settlement/Export Report

As a Super Organizer,
I want to export my company's consolidated donation totals periodically,
So that I have a clean accounting record without pulling numbers from each Event by hand.

**Acceptance Criteria:**

**Given** I am on `/company/reports`
**When** I generate an export
**Then** it reuses the existing SheetJS export pattern (vendored, never `npm install xlsx`), scoped to my tenant's Events, and its totals reconcile exactly — to the minor currency unit — with the sum of my tenant's individual Event totals at export time (FR-22, AD-5)

**Given** no full period has elapsed yet since my tenant was approved
**When** I open `/company/reports`
**Then** I see "Your first settlement export will be available after your first full period" rather than an empty or broken export attempt

### Story 8.6: Super Admin Manages Admin Accounts

As Super Admin,
I want to be the only one who can create, promote, demote, or suspend an Admin account,
So that as more platform staff get Admin access, no single Admin can go unchecked.

**Acceptance Criteria:**

**Given** the single designated Super Admin account, holding both `admin` and `super_admin` Appwrite Labels (AD-11)
**When** they access any existing Admin screen or action
**Then** it works identically to an ordinary Admin's access — nothing withheld, no separate capability gate anywhere (FR-25)

**Given** Super Admin on `/dashboard/admins`
**When** they create, promote, demote, or suspend an Admin account
**Then** the action succeeds and is gated exclusively on `Role.label('super_admin')`, enforced inside the Function — never a client-side-only check (FR-26)

**Given** any account other than the designated Super Admin (including another Admin)
**When** it attempts a create/promote/demote/suspend action against an Admin account
**Then** it is rejected server-side, with no exception (FR-26)

**Given** an Admin account is suspended by Super Admin
**When** the suspension takes effect
**Then** that Admin immediately loses approval authority, suspension authority, and platform-wide audit visibility — but their historical audit-log entries remain visible and attributed, never hidden or reassigned (FR-26, extending FR-13's attribution-retention principle one tier up)

## Epic 9: Family Dignity & Access Safeguards

A grieving family always sees their event's true, complete donation picture — safely, even from a borrowed device, even if their Organizer's account is suspended.

### Story 9.1: Personal-Device Prompt & Auto-Logout

As a Family Member viewing my event's donations via access code,
I want to be asked whether this is my own phone, and signed out automatically if it isn't the moment I leave,
So that a stranger who later picks up a borrowed device never sees my family's information.

**Acceptance Criteria:**

**Given** I enter a valid family access code
**When** the page is about to render the donation total
**Then** a dignity-banner prompt asks whether this is my personal phone, and renders before the total does — with no dismiss control, focus moving to it programmatically on render, behaving as a focus-trapping modal (FR-16)

**Given** I answer "No, not my phone"
**When** I later navigate away from the page or background the tab
**Then** my session clears immediately — the next visitor to this device sees the access-code entry screen, not my family's data (FR-16)

**Given** I answer "Yes, my personal phone"
**When** I navigate away and return
**Then** my session persists normally, matching the existing v1 behavior — the prompt only changes behavior for the "no" answer

**Given** a family access code has been shared beyond the intended family (forwarded, posted, guessed)
**When** the Organizer notices
**Then** they can invalidate and reissue it at any time from their Tenant/Event detail view — reusing the existing v1 regenerate-code action (Story 2.4), now framed as leak recovery, not just a mechanism swap; regenerating immediately invalidates the old code (FR-16)

### Story 9.2: Family View Survives Organizer Suspension

As a Family Member,
I want my event's donation view to keep working even if something goes wrong with my Organizer's account,
So that a dispute I have nothing to do with never interrupts my ability to follow my own event.

**Acceptance Criteria:**

**Given** Admin suspends the Tenant that owns my Event (Story 8.1)
**When** I open my family access-code view afterward
**Then** it continues to resolve and render exactly as before — the total and donor list either freeze at their last known state or keep updating, but access itself is never blocked (FR-17)

**Given** my view is open in a tab at the moment a suspension takes effect
**When** the suspension happens
**Then** I see no interruption, no banner, no flicker — the guarantee is invisible by design, verified by confirming no error state or access-denial path exists on this route for a suspended tenant

**Given** the same suspended Tenant
**When** an Operator or Organizer from it attempts to log in
**Then** they are blocked, in contrast to my unaffected family view — the suspension's effect is asymmetric on purpose (FR-17)

### Story 9.3: Full Donation Visibility for Family

As a Family Member,
I want to see every donation actually entered for my event, with nothing hidden or partial,
So that I never have to wonder if the total I'm shown is the real one.

**Acceptance Criteria:**

**Given** donations have been recorded for my Event by one or more Operators
**When** I view my family summary
**Then** the total and donor list reconcile exactly with the Operator/Organizer-facing total for the same Event — modulo only the fields already excluded for privacy (donor phone, per existing FR-SEC-003/FR-RPT-003) (FR-18)

**Given** a donation is edited or soft-deleted by an Operator or Admin
**When** I next view my family summary
**Then** it reflects the current, corrected state — never a stale or partially-updated figure

**Given** no donations have been recorded yet
**When** I view my family summary
**Then** I see a real zero total, not an error or a "no data" state that could be mistaken for something hidden
