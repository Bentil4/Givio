---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - docs/DMS_Product_Requirements_Document.md
  - _bmad-output/planning-artifacts/architecture/architecture-givio-2026-07-25/ARCHITECTURE-SPINE.md
  - .claude/skills/plan/*.md (26 screen specs — treated as UI/UX detail input, no formal bmad-ux DESIGN.md/EXPERIENCE.md pair exists)
---

# Givio Donation Management System - Epic Breakdown

## Pre-Flight Risks (from Assumption Audit)

- **Verify Appwrite plan tier includes Functions and Realtime** in the console for project `69c270d10029e7ed7f82` before Epic 1 story work starts. AD-9 (single writer of Labels/permissions, load-bearing for Epic 1 *and* Epic 2) needs Functions; Epic 4's live dashboard needs Realtime. Neither has been confirmed available on the current plan.
- **Appwrite web SDK `^23.0.0`** is 3 majors behind current (26.x) — confirm it still talks to the provisioned Cloud project correctly before relying on it in Epic 1's first story.

## Cross-Cutting Definition of Done (from Inversion Analysis)

Applies across every epic below — a story isn't done just because its happy path works:

- Any story touching AD-1/AD-9 (role/Label writes) must be verified end-to-end against the real provisioned Appwrite Cloud project, not mocks alone.
- Any story touching offline entry/edit/sync (AD-3/AD-4, Epic 3) must include an explicit offline-simulation test step (e.g. devtools "Offline" throttling), not online-only/mocked tests.
- Any story adding a new lazy route (AD-6/AD-7, all epics) must re-verify that route has a guard attached — this regresses silently otherwise.
- Any story touching `share-access`-adjacent screens must stay within AD-10's v1 boundary (single read-only `accessCode`) — do not quietly rebuild the tiered scheme because the file is already open.
- The Excel export story (Epic 4) must vendor SheetJS from `cdn.sheetjs.com` per the Stack note — never `npm install xlsx`.
- The Excel export story (Epic 4) must verify exported totals match in-app totals to the pesewa (AD-5) — display-formatting must not reintroduce float math in the export path.

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

### Additional Requirements

From the Architecture Spine (`ARCHITECTURE-SPINE.md`, 10 ADs) — each epic below must build to these, not re-derive them:

- AD-1: Global role (Admin/Operator) lives only as an Appwrite Label, never `account.prefs`. `AuthStore` reads `account.labels`.
- AD-2: `Event.assignedUserIds` is the sole source of truth for operator assignment; Event/Donation document permissions are a projection derived from it (`Role.user(uid)` per assignee + `Role.label('admin')`), recomputed via AD-9's Function. Family read access derives from `Event.accessCode` the same way.
- AD-3: Conflict detection compares outbox `baseUpdatedAt` against the server's current `$updatedAt`. Conflicts land in a `DonationConflicts` collection (Admin-only), never silently overwritten. The `sync-status` screen's conflict section renders only for `Role.label('admin')`.
- AD-4: Every mutation writes Dexie + appends a per-entity outbox entry (`id, entityType, entityId, op, payload, baseUpdatedAt?, status, retries, createdAt`); `entityId` is client-generated via `ID.unique()` for idempotent create-retries; `SyncEngine` drains per-entity FIFO.
- AD-5: Money is integer minor units (GHS pesewas), never floats.
- AD-6: Route guards are functional `CanActivateFn`, checking `AuthStore` role + the target event's `assignedUserIds`/`accessCode`.
- AD-7: Each role tree (admin/organizer/member) is a `loadChildren`/`loadComponent` lazy boundary.
- AD-8: Receipt numbers are provisional offline (`{eventShortCode}-P{n}`), finalized to a canonical sequential number via an atomic `nextReceiptSeq` counter on sync.
- AD-9: One Appwrite Function is the sole writer of Labels and derived permissions — invoked only from `data/repositories`, never Presentation directly.
- AD-10: v1 share access is exactly FR-AUTH-004's single hashed read-only `accessCode` — the richer `share-access.md` tiered/revocable scheme is explicitly out of scope for v1.

Layering (must be honored by every story): Presentation (`feature/{admin,organizer,member}`) → Domain/State (signal stores) → Data (`repositories/`, the only layer touching `appwrite`/`dexie`). No starter template — this is brownfield, not greenfield.

Brownfield state the epics must account for (from the Architecture Spine's reconciliation):
- `admin` page tree partially built (dashboard + stat-card/recent-activity/quick-actions/system-health widgets already exist).
- `organizer` tree currently exists only as an empty shell named `user` (`UserLayout`/`UserDashboard` have no logic).
- `member` tree does not exist at all yet.
- `auth/service/authservice.ts` is an empty, unused stub — to be replaced by `AuthStore`.
- `src/lib/appwrite.ts` hardcodes the endpoint instead of reading `src/environments`, and only wraps `Account` — `Databases` is unused.
- Zero Dexie code exists anywhere — the entire offline layer is greenfield.
- Zero route guards exist; routing is flat and fully eager (4 routes).
- `shared/components` barrel exports only Button/Input/Preloader; Card/Checkbox/FilterTags/Progress/Radio/Select/Tag/Toggle exist as files but aren't wired in yet.

### UX Design Requirements

No formal bmad-ux `DESIGN.md`/`EXPERIENCE.md` contract exists. Instead, 26 per-screen specs in `.claude/skills/plan/*.md` supply UI/layout/content detail (sections, fields, states) for each screen and are cited directly in each story rather than restated here:

`admin-dashboard`, `admin-donations`, `admin-event`, `admin-report`, `admin-settings`, `organizer-dashboard`, `organizer-donations`, `organizer.events`, `organizer.report`, `member-dashboard`, `member-donation`, `member-events`, `login-screen`, `dashboard-screen`, `create-event-screen`, `edit-event`, `event-detail`, `add-donation`, `edit-donation`, `donation-list`, `donor-verify`, `export-preview`, `reports`, `event-reports`, `share-access` (v1.1+ per AD-10), `sync-status`.

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

## Epic List

### Epic 1: Accounts, Roles & Secure Access
Admin can create Admin/Operator accounts with roles; any user can log in and land on a role-appropriate, route-guarded dashboard; sessions expire and rotate securely.
**FRs covered:** FR-AUTH-001..003, FR-AUTH-005, FR-USR-001..003, FR-SEC-001, FR-SEC-005
**Scope note:** FR-USR-001 lists "Family Member" as an account role option, but FR-AUTH-004/AD-2/AD-10 establish Family Members as `accessCode`-based (no real account) — reconciled here: the User Management role dropdown offers Admin/Operator only; Family Member access is granted per-event via access code (Epic 2), not a user account.
**Implementation notes:** Replaces the empty `Authservice` stub with `AuthStore` (AD-1); consolidates `src/lib/appwrite.ts` into `data/appwrite/` reading `src/environments`; introduces functional route guards (AD-6) and the lazy-loaded admin/organizer/member route skeleton (AD-7); stands up the one Appwrite Function (AD-9) — this epic only needs its "write a Label" capability, extended in Epic 2 to also derive event permissions.
**Story sequencing:** the first story should be a thin end-to-end slice — login → guard → land on an empty role-appropriate dashboard — before building out full user-management CRUD, so the login/guard/AuthStore chain is proven working early rather than validated only once the whole epic is done.

### Epic 2: Event Lifecycle & Assignment
Admin can create Wedding/Funeral events, edit them, control their status, assign Operators, and generate a Family Member access code that lets a Family Member log in without an account — with assignment enforced at the Appwrite permission level, not just the UI, so an unassigned Operator truly cannot reach an event's data.
**FRs covered:** FR-EVT-001..005, FR-USR-004..005, FR-SEC-002, FR-AUTH-004
**Implementation notes:** Builds `EventRepository`/`EventStore`/Dexie `events` table; extends the Epic 1 Function to derive Event/Donation permissions from `assignedUserIds` (AD-2); screens: `create-event-screen`, `edit-event`, `event-detail`, `admin-event`, the "Assign Operators" and access-code actions in `admin-settings`.

### Epic 3: Donation Recording, Offline Sync & Receipts
An Operator can record donations at a live event — online or fully offline — see the running total update, get an instant printable/PDF receipt, and have everything sync automatically once reconnected, with conflicts safely caught (never silently lost) and donor phone numbers visible only to Admin/assigned Operators.
**FRs covered:** FR-DON-001..005, FR-OFF-001..005, FR-REC-001..004, FR-SEC-003
**Implementation notes:** The core value-delivery epic — consolidated rather than split across Donation/Offline/Receipt epics since all three FR groups hit the same `DonationRepository`/Dexie outbox/`SyncEngine` files (AD-3, AD-4, AD-5, AD-8). Screens: `add-donation`, `edit-donation`, `donation-list`, `donor-verify`, `sync-status`. jsPDF added per Stack.

### Epic 4: Reporting, Dashboards, Export & Audit
Admin sees a real-time per-event dashboard and can export full donation records to Excel; Family Members see their own live read-only summary and a sanitized export; Admin can review the full, immutable audit log.
**FRs covered:** FR-RPT-001..004, FR-SEC-004
**Implementation notes:** Wires `admin-dashboard` widgets to real data, resolves the spine's Deferred Appwrite Realtime subscription; `ReportService` + vendored SheetJS export (per Stack note — not `npm install xlsx`); screens: `admin-report`, `organizer.report`, `event-reports`, `reports`, `export-preview`, `member-dashboard`, `member-donation`, `member-events`; `AuditRepository` + Audit Log Viewer.

### Epic 5: Install & Use Anywhere (PWA, Responsive, Multi-Device)
The app installs to a phone's home screen, works fully offline once installed, and multiple Operators can use it simultaneously on different devices without stepping on each other.
**FRs covered:** FR-DEV-001..003
**Implementation notes:** Fixes the duplicated `provideServiceWorker` call; adds `ngsw-config.json` `dataGroups` (currently asset-only); PWA manifest/icons; responsive pass (360px–1920px, ≥44px touch targets) across all 26 screens; Lighthouse PWA audit ≥ 90; multi-device concurrent-session verification (NFR-SCALE-001).

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
**Then** a new Event document is created with a unique system-generated ID, and `EventRepository`/`EventStore`/the Dexie `events` table (created for the first time in this story) all reflect it (FR-EVT-001)
**And** the event type is clearly labelled everywhere the event appears in the UI

**Given** two events exist
**When** donations are later recorded against each (Epic 3)
**Then** they are linked via `eventId` and never shared across events — this story lays the data-isolation foundation (FR-EVT-002)

**Given** an existing event, not yet closed
**When** I edit any of its fields via `edit-event`
**Then** the change is saved and a record is written to the `audit_logs` collection (entityType `event`, before/after values, my Admin ID, timestamp) — the Viewer UI for this log ships in Epic 4, but the write path starts here (FR-EVT-003)

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
