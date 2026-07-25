**PRODUCT REQUIREMENTS DOCUMENT**

**Donation Management System**

*For Weddings & Funerals*

Angular · Appwrite · Offline-First · Multi-Event

|  |  |
|----|----|
| **Document Title** | Donation Management System --- PRD |
| **Version** | 1.0 |
| **Status** | Draft --- Awaiting Stakeholder Sign-off |
| **Prepared By** | Product Team |
| **Date** | March 2026 |
| **Classification** | Confidential |
| **Tech Stack** | Angular 17+ · Appwrite (Backend/DB) · IndexedDB (Offline) |
| **Target Platforms** | Web Browser (Mobile & Desktop) |

*CONFIDENTIAL --- FOR INTERNAL USE ONLY*

**Document Revision History**

|  |  |  |  |
|----|----|----|----|
| **Version** | **Date** | **Author** | **Change Summary** |
| 1.0 | March 2026 | Product Team | Initial draft derived from User Story document v1.0 |
| --- | --- | --- | --- |

**Table of Contents**

**1. Executive Summary**

**2. Product Overview**

**3. Scope**

**4. Stakeholders & User Roles**

**5. Assumptions & Constraints**

**6. Functional Requirements**

6.1 Authentication & Access Control

6.2 User Management

6.3 Event Management

6.4 Donation Recording & Management

6.5 Offline Mode & Data Synchronisation

6.6 Receipt Generation

6.7 Reporting & Data Export

6.8 Multi-Device Support

6.9 Security & Data Protection

**7. Non-Functional Requirements**

**8. System Architecture Overview**

**9. Data Model**

**10. UI/UX Requirements**

**11. Integration Requirements**

**12. Acceptance Criteria Summary**

**13. Risks & Mitigations**

**14. Glossary**

**15. Sign-Off**

**1. Executive Summary**

The Donation Management System (DMS) is a purpose-built, web-based application designed to digitise, streamline, and bring accountability to the collection and recording of monetary and in-kind donations at social events --- specifically weddings and funerals in the Ghanaian and broader West African context.

Currently, donation tracking at these events is handled manually through paper records or informal spreadsheets. This creates significant risk of data loss, arithmetic errors, missing receipts, and inability to generate timely reports for event organisers and family members. The DMS replaces this entirely with a real-time, role-aware, offline-capable platform.

This Product Requirements Document (PRD) defines the complete scope, functional requirements, non-functional requirements, data model, architecture, and acceptance criteria for DMS Version 1.0. It serves as the contract between product, engineering, and stakeholders throughout the build lifecycle.

|                     |                                              |
|---------------------|----------------------------------------------|
| **Product Name**    | Donation Management System (DMS)             |
| **Version Scope**   | v1.0 --- MVP                                 |
| **Primary Users**   | Admins, Operators (Users), Family Members    |
| **Event Types**     | Weddings, Funerals                           |
| **Core Platform**   | Angular 17+ Progressive Web App (PWA)        |
| **Backend**         | Appwrite (Auth, Database, Storage, Realtime) |
| **Offline Support** | IndexedDB / Service Workers with auto-sync   |
| **Target Region**   | Ghana / West Africa (initial deployment)     |
| **Currency**        | Ghanaian Cedi (GHS) --- primary; extensible  |

**2. Product Overview**

**2.1 Problem Statement**

Weddings and funerals in Ghana attract large numbers of well-wishers who donate cash, mobile money, and in-kind gifts. Event families and organisers rely on individuals to manually record these donations on paper or in basic spreadsheets. The resulting process suffers from:

- Lost or illegible records, especially in high-traffic events with hundreds of donors.

- No real-time visibility for family members monitoring contributions.

- Inability to issue acknowledgement receipts to donors promptly.

- Difficulty producing consolidated financial reports post-event.

- High risk of fraud or discrepancy with no audit trail.

**2.2 Proposed Solution**

DMS provides a structured, auditable, role-gated digital platform accessible on any browser-enabled device. Key capabilities include:

- Role-based access for Admins, Operators, and Family Members.

- Create and manage multiple concurrent events (weddings and funerals) without data conflict.

- Log donor details and donation records with full audit trail.

- Operate fully offline and sync automatically when connectivity resumes.

- Generate printable PDF receipts for donors at the point of entry.

- Export event donation reports as Excel (.xlsx) files.

- Real-time dashboards for family members during the event.

**2.3 Product Goals**

1.  Eliminate paper-based donor recording at weddings and funerals.

2.  Achieve zero data loss through offline-first architecture with reliable sync.

3.  Reduce donation entry time to under 30 seconds per donor.

4.  Provide family members with real-time donation visibility without requiring technical expertise.

5.  Enable post-event reporting in under 2 minutes via Excel export.

6.  Support concurrent management of unlimited events with no cross-contamination of data.

**2.4 Success Metrics**

|  |  |  |
|----|----|----|
| **Metric** | **Target (v1.0)** | **Measurement Method** |
| Donation entry time | **≤ 30 seconds per record** | Usability testing |
| Offline sync success rate | **≥ 99%** | Automated sync logs |
| Receipt generation time | **≤ 5 seconds** | Performance testing |
| Data conflict rate on sync | **\< 1% of records** | Conflict log review |
| User onboarding time | **≤ 10 minutes** | Operator training audit |
| System uptime (online) | **≥ 99.5%** | Appwrite monitoring |
| Export generation time | **≤ 10 seconds for 1,000 rows** | Performance testing |

**3. Scope**

**3.1 In Scope --- v1.0**

- User authentication and role-based access control (Admin, User, Family Member).

- Full event lifecycle management: create, update, assign users, close events.

- Concurrent management of multiple wedding and funeral events simultaneously.

- Donor and donation entry, editing, and soft-deletion with audit logs.

- Offline operation with IndexedDB local storage and Appwrite background sync.

- Conflict detection and resolution workflow for sync conflicts.

- Printable and downloadable PDF receipts per donation.

- Real-time donation dashboard per event (Admin and Family Member views).

- Excel (.xlsx) export of full donation records per event.

- Responsive PWA design: mobile browsers and desktop browsers.

- Basic security: HTTPS, Appwrite RBAC, session management, audit trails.

**3.2 Out of Scope --- v1.0**

- Native mobile applications (iOS/Android) --- web PWA only in v1.0.

- Payment gateway or mobile money API integration --- amounts are entered manually.

- SMS or WhatsApp automated thank-you messages --- deferred to v2.0.

- Multi-language / localisation --- English only in v1.0.

- Advanced analytics dashboards or AI-driven insights.

- Cloud print server integration --- browser print dialog is used.

- Third-party accounting system integration (QuickBooks, Xero, etc.).

**4. Stakeholders & User Roles**

**4.1 Stakeholder Map**

|  |  |  |
|----|----|----|
| **Stakeholder** | **Interest** | **Influence** |
| **Event Organiser / Host Family** | Accurate records and post-event reports | High --- defines event data |
| **Admin (System Operator Lead)** | Full system control and oversight | High --- manages all data |
| **Operator (User)** | Fast, reliable donation entry at the venue | Medium --- primary data entry |
| **Family Member** | Real-time visibility of contribution totals | Medium --- view only |
| **Donors** | Timely receipt for their contribution | Low --- external |
| **Development Team** | Clear, testable requirements | High --- builds the system |

**4.2 User Role Definitions**

|  |  |  |  |
|----|----|----|----|
| **Role** | **Description** | **Permissions** | **Limitations** |
| **Admin** | Super-user with full platform access. Typically the event coordinator or organisation lead. | Create/manage all events and users. View all donation data. Delete records. Export reports. Manage roles. | None within the system. |
| **User (Operator)** | Staff member assigned to one or more events to record donations at the venue. | Add, edit donations for assigned events. Generate receipts. View event summary. | Cannot access unassigned events. Cannot delete records. Cannot manage users. |
| **Family Member** | A member of the host family given read-only access to monitor their event. | View real-time donation summary and donor list for their event. Download export. | No data entry or modification. Limited to their own event only. |

**5. Assumptions & Constraints**

**5.1 Assumptions**

- Operators will have access to at least one browser-capable device (smartphone, tablet, or laptop) at the event venue.

- Appwrite will be self-hosted or used via Appwrite Cloud with appropriate plan for realtime support.

- Events will be created and configured by the Admin before the event date.

- Internet connectivity, while desirable, cannot be guaranteed at all event venues --- hence offline-first is mandatory.

- All monetary amounts are entered manually by operators; no payment gateway is involved.

- The system will initially be used for events in Ghana; currency defaults to GHS.

- Operators will receive at least one training session before using the system at a live event.

**5.2 Constraints**

- Tech Stack is fixed: Angular (frontend), Appwrite (backend/database), IndexedDB (offline storage).

- The system must function as a Progressive Web App (PWA) --- no native app builds in v1.0.

- Receipt generation must work offline (using in-browser PDF generation, e.g., jsPDF or similar).

- Data export must produce valid .xlsx files compatible with Microsoft Excel and Google Sheets.

- All Appwrite security rules (RBAC) must enforce role separation at the database permission level --- not just at UI level.

- The system must support a minimum of 10 concurrent operators across different events without performance degradation.

**5.3 Dependencies**

- Appwrite instance (Cloud or self-hosted) must be provisioned before development begins.

- Angular 17+ with PWA support (@angular/pwa) must be configured from project inception.

- A PDF generation library (jsPDF / pdfmake) must be selected and integrated for offline receipt generation.

- An Excel generation library (SheetJS / xlsx) must be integrated for report export.

**6. Functional Requirements**

The following sections define all functional requirements. Priority levels are: Critical (must have for launch), High (strongly required), Medium (important but deferrable to a follow-on sprint).

**6.1 Authentication & Access Control**

<table style="width:97%;">
<colgroup>
<col style="width: 11%" />
<col style="width: 33%" />
<col style="width: 9%" />
<col style="width: 11%" />
<col style="width: 30%" />
</colgroup>
<tbody>
<tr>
<td><strong>Req ID</strong></td>
<td><strong>Requirement Description</strong></td>
<td><strong>Priority</strong></td>
<td><strong>User Story</strong></td>
<td><strong>Acceptance Criteria</strong></td>
</tr>
<tr>
<td><strong>FR-AUTH-001</strong></td>
<td>The system shall provide a secure login screen accessible to all user roles.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-001, US-002, US-003</td>
<td><ul>
<li><p>Email and password fields are present.</p></li>
<li><p>Failed login shows 'Invalid credentials' error.</p></li>
<li><p>No information leakage about whether email or password is wrong.</p></li>
<li><p>Rate limiting applied after 5 failed attempts.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-AUTH-002</strong></td>
<td>The system shall authenticate users against Appwrite Auth and issue session tokens on successful login.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-001, US-002</td>
<td><ul>
<li><p>Successful login creates a valid Appwrite session.</p></li>
<li><p>Session token is stored securely (not in localStorage in plain text).</p></li>
<li><p>Session expires after 8 hours of inactivity.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-AUTH-003</strong></td>
<td>The system shall redirect each user to a role-appropriate dashboard upon login.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-001, US-002, US-003</td>
<td><ul>
<li><p>Admin lands on the Master Dashboard.</p></li>
<li><p>Operator lands on their assigned events list.</p></li>
<li><p>Family Member lands on their specific event summary.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-AUTH-004</strong></td>
<td>The system shall support event-code-based login for Family Members.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-003</td>
<td><ul>
<li><p>Admin can generate a unique event access code per event.</p></li>
<li><p>Family Member can log in using the event code without a full account.</p></li>
<li><p>Event code login grants read-only access to the specific event only.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-AUTH-005</strong></td>
<td>The system shall provide a secure logout function from any screen.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-001, US-002, US-003</td>
<td><ul>
<li><p>Logout clears the session from Appwrite and the client.</p></li>
<li><p>User is redirected to the login screen after logout.</p></li>
<li><p>Offline-cached data is cleared from memory on logout (but not from IndexedDB pending sync queue).</p></li>
</ul></td>
</tr>
</tbody>
</table>

**6.2 User Management**

<table style="width:97%;">
<colgroup>
<col style="width: 11%" />
<col style="width: 33%" />
<col style="width: 9%" />
<col style="width: 11%" />
<col style="width: 30%" />
</colgroup>
<tbody>
<tr>
<td><strong>Req ID</strong></td>
<td><strong>Requirement Description</strong></td>
<td><strong>Priority</strong></td>
<td><strong>User Story</strong></td>
<td><strong>Acceptance Criteria</strong></td>
</tr>
<tr>
<td><strong>FR-USR-001</strong></td>
<td>Admin shall be able to create new user accounts with a defined role.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-004</td>
<td><ul>
<li><p>Role options: Admin, User (Operator), Family Member.</p></li>
<li><p>Required fields: Full Name, Email, Role.</p></li>
<li><p>Password is auto-generated and sent via email notification, or Admin sets it manually.</p></li>
<li><p>Duplicate email addresses are rejected.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-USR-002</strong></td>
<td>Admin shall be able to edit user account details and roles.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-004</td>
<td><ul>
<li><p>Admin can update name, email, and role.</p></li>
<li><p>Role changes take effect on the user's next action.</p></li>
<li><p>Email change sends a verification to the new address.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-USR-003</strong></td>
<td>Admin shall be able to deactivate or delete user accounts.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-004</td>
<td><ul>
<li><p>Deactivated users cannot log in.</p></li>
<li><p>Deleted users are soft-deleted; their donation records are preserved.</p></li>
<li><p>Admin is prompted to confirm before deletion.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-USR-004</strong></td>
<td>Admin shall be able to assign one or more Users (Operators) to specific events.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-005</td>
<td><ul>
<li><p>Admin selects an event and assigns operators from a user list.</p></li>
<li><p>One operator can be assigned to multiple events simultaneously.</p></li>
<li><p>Assignment changes take effect in real time.</p></li>
<li><p>Unassigned operators see no event data.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-USR-005</strong></td>
<td>Assigned operators shall see only their assigned events in their dashboard.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-005</td>
<td><ul>
<li><p>Operator dashboard lists assigned events only.</p></li>
<li><p>Any attempt to access an unassigned event via URL returns an 'Access Denied' error.</p></li>
<li><p>Appwrite database-level permissions enforce this — not just UI guards.</p></li>
</ul></td>
</tr>
</tbody>
</table>

**6.3 Event Management**

<table style="width:97%;">
<colgroup>
<col style="width: 11%" />
<col style="width: 33%" />
<col style="width: 9%" />
<col style="width: 11%" />
<col style="width: 30%" />
</colgroup>
<tbody>
<tr>
<td><strong>Req ID</strong></td>
<td><strong>Requirement Description</strong></td>
<td><strong>Priority</strong></td>
<td><strong>User Story</strong></td>
<td><strong>Acceptance Criteria</strong></td>
</tr>
<tr>
<td><strong>FR-EVT-001</strong></td>
<td>Admin shall be able to create a new event of type Wedding or Funeral.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-006</td>
<td><ul>
<li><p>Required fields: Event Name, Event Type, Date, Host/Family Name.</p></li>
<li><p>Optional fields: Venue, Description, Notes.</p></li>
<li><p>Each event is assigned a unique system-generated ID.</p></li>
<li><p>Event type is clearly labelled throughout the UI.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-EVT-002</strong></td>
<td>The system shall support multiple concurrent events with full data isolation.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-007</td>
<td><ul>
<li><p>Donations are linked to events via event ID — never shared across events.</p></li>
<li><p>Different operators can work on different events simultaneously without conflict.</p></li>
<li><p>Admin dashboard displays all active events with their running totals independently.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-EVT-003</strong></td>
<td>Admin shall be able to edit event details at any point before the event is closed.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-008</td>
<td><ul>
<li><p>All event fields are editable.</p></li>
<li><p>Edit history is logged with timestamp and Admin ID.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-EVT-004</strong></td>
<td>Admin shall be able to change an event's status: Active, Paused, or Closed.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-008</td>
<td><ul>
<li><p>Closed events no longer accept new donations.</p></li>
<li><p>Paused events temporarily prevent entry without losing access to historical records.</p></li>
<li><p>Status changes are logged.</p></li>
<li><p>Admin can reopen a Closed event if needed.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-EVT-005</strong></td>
<td>Admin shall be able to generate a unique access code for a Family Member per event.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-003</td>
<td><ul>
<li><p>Code is alphanumeric, minimum 8 characters.</p></li>
<li><p>Code is single-event-scoped and grants read-only access.</p></li>
<li><p>Admin can regenerate the code, immediately invalidating the previous one.</p></li>
</ul></td>
</tr>
</tbody>
</table>

**6.4 Donation Recording & Management**

<table style="width:97%;">
<colgroup>
<col style="width: 11%" />
<col style="width: 33%" />
<col style="width: 9%" />
<col style="width: 11%" />
<col style="width: 30%" />
</colgroup>
<tbody>
<tr>
<td><strong>Req ID</strong></td>
<td><strong>Requirement Description</strong></td>
<td><strong>Priority</strong></td>
<td><strong>User Story</strong></td>
<td><strong>Acceptance Criteria</strong></td>
</tr>
<tr>
<td><strong>FR-DON-001</strong></td>
<td>Users shall be able to record a new donation entry against an assigned active event.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-009</td>
<td><ul>
<li><p>Required fields: Donor Name, Donation Amount, Donation Type (Cash / Mobile Money / In-Kind).</p></li>
<li><p>Optional fields: Donor Phone Number, Donated On Behalf Of, Notes/Remarks.</p></li>
<li><p>Entry is timestamped automatically.</p></li>
<li><p>A confirmation dialog appears before saving.</p></li>
<li><p>Saved entry appears immediately in the event's donation list.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-DON-002</strong></td>
<td>Users shall be able to edit a donation entry they recorded.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-010</td>
<td><ul>
<li><p>All fields are editable post-save.</p></li>
<li><p>Edit log records: editor's name, original values, new values, edit timestamp.</p></li>
<li><p>Edited records display a visual 'Edited' badge.</p></li>
<li><p>Admin can view full edit history for any record.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-DON-003</strong></td>
<td>Admin shall be able to soft-delete a donation record.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-011</td>
<td><ul>
<li><p>Only Admin role can trigger deletion.</p></li>
<li><p>Confirmation prompt is mandatory.</p></li>
<li><p>Record is soft-deleted: removed from active view but retained in database.</p></li>
<li><p>Deleted records are recoverable by Admin within 30 days.</p></li>
<li><p>Deletion is logged with Admin ID and timestamp.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-DON-004</strong></td>
<td>Users shall be able to search and filter the donation list within an event.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-012</td>
<td><ul>
<li><p>Search by donor name (partial match, case-insensitive).</p></li>
<li><p>Search by donor phone number.</p></li>
<li><p>Filter by donation type (Cash, Mobile Money, In-Kind).</p></li>
<li><p>Filter by date range.</p></li>
<li><p>Search results update in real time (debounced, ≤ 300ms).</p></li>
<li><p>Empty result state displays 'No donors found' message.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-DON-005</strong></td>
<td>The system shall display a running total of donations in real time during an event.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-016</td>
<td><ul>
<li><p>Total amount updates immediately on each new entry.</p></li>
<li><p>Breakdown by donation type is shown (Cash total, Mobile Money total, In-Kind total).</p></li>
<li><p>Total is visible to Admin and to assigned Operators on the event screen.</p></li>
<li><p>Family Member sees the total on their read-only summary screen.</p></li>
</ul></td>
</tr>
</tbody>
</table>

**6.5 Offline Mode & Data Synchronisation**

<table style="width:97%;">
<colgroup>
<col style="width: 11%" />
<col style="width: 33%" />
<col style="width: 9%" />
<col style="width: 11%" />
<col style="width: 30%" />
</colgroup>
<tbody>
<tr>
<td><strong>Req ID</strong></td>
<td><strong>Requirement Description</strong></td>
<td><strong>Priority</strong></td>
<td><strong>User Story</strong></td>
<td><strong>Acceptance Criteria</strong></td>
</tr>
<tr>
<td><strong>FR-OFF-001</strong></td>
<td>The application shall detect network connectivity status and display it clearly.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-013</td>
<td><ul>
<li><p>A persistent status bar/indicator shows 'Online' or 'Offline'.</p></li>
<li><p>Status updates within 3 seconds of connectivity change.</p></li>
<li><p>No user action is required to detect the change.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-OFF-002</strong></td>
<td>All donation entry, edit, and receipt functions shall work fully in offline mode.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-013</td>
<td><ul>
<li><p>New donations are saved to IndexedDB when offline.</p></li>
<li><p>Edits to unsynced records are applied locally.</p></li>
<li><p>User can view all locally stored donation records while offline.</p></li>
<li><p>Receipt generation works offline without network access.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-OFF-003</strong></td>
<td>The system shall display the count of unsynced records pending upload.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-013</td>
<td><ul>
<li><p>A sync badge shows number of pending records (e.g., '3 pending sync').</p></li>
<li><p>Badge disappears when all records are synced.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-OFF-004</strong></td>
<td>The system shall automatically sync local records to Appwrite upon detecting internet connectivity.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-014</td>
<td><ul>
<li><p>Sync begins within 5 seconds of reconnection — no manual trigger needed.</p></li>
<li><p>Sync runs in the background without blocking the UI.</p></li>
<li><p>User receives a toast notification: 'Sync complete — X records uploaded'.</p></li>
<li><p>Sync failures are logged and surfaced with a 'Retry Sync' option.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-OFF-005</strong></td>
<td>The system shall detect and flag sync conflicts for Admin review.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-014</td>
<td><ul>
<li><p>A conflict occurs when the same record was modified by two different users while both were offline.</p></li>
<li><p>Conflicting records are flagged in the Admin dashboard with both versions displayed.</p></li>
<li><p>Admin can choose which version to keep or merge fields manually.</p></li>
<li><p>Conflict resolution is logged.</p></li>
</ul></td>
</tr>
</tbody>
</table>

**6.6 Receipt Generation**

<table style="width:97%;">
<colgroup>
<col style="width: 11%" />
<col style="width: 33%" />
<col style="width: 9%" />
<col style="width: 11%" />
<col style="width: 30%" />
</colgroup>
<tbody>
<tr>
<td><strong>Req ID</strong></td>
<td><strong>Requirement Description</strong></td>
<td><strong>Priority</strong></td>
<td><strong>User Story</strong></td>
<td><strong>Acceptance Criteria</strong></td>
</tr>
<tr>
<td><strong>FR-REC-001</strong></td>
<td>The system shall generate a printable donation receipt immediately after a record is saved.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-015</td>
<td><ul>
<li><p>Receipt is generated automatically on save — no separate action needed.</p></li>
<li><p>User can also manually trigger receipt from any existing donation record.</p></li>
<li><p>Receipt renders in a print-ready layout (A5 or A6 portrait format).</p></li>
<li><p>Receipt is accessible both online and offline.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-REC-002</strong></td>
<td>Each receipt shall contain a defined set of mandatory fields.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-015</td>
<td><ul>
<li><p>Event Name and Event Type (Wedding / Funeral).</p></li>
<li><p>Donor Name.</p></li>
<li><p>Donation Amount (in GHS).</p></li>
<li><p>Donation Type (Cash / Mobile Money / In-Kind).</p></li>
<li><p>'Donated On Behalf Of' field (if entered).</p></li>
<li><p>Date and Time of donation.</p></li>
<li><p>Unique Receipt Number (auto-generated, sequential per event).</p></li>
<li><p>Operator name (who recorded the entry).</p></li>
<li><p>A 'Thank you' message.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-REC-003</strong></td>
<td>The receipt shall be downloadable as a PDF.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-015</td>
<td><ul>
<li><p>PDF is generated client-side using a library (jsPDF or pdfmake).</p></li>
<li><p>Works fully offline.</p></li>
<li><p>PDF filename format: Receipt_[EventName]_[ReceiptNo].pdf.</p></li>
<li><p>File is downloaded immediately on click without server round-trip.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-REC-004</strong></td>
<td>The receipt layout shall be professional and branded for the event.</td>
<td style="text-align: center;"><strong>Medium</strong></td>
<td>US-015</td>
<td><ul>
<li><p>Receipt header includes the Event Name prominently.</p></li>
<li><p>Clean, legible typography suitable for printing on standard paper.</p></li>
<li><p>Includes a dividing line or border for visual separation.</p></li>
<li><p>Optional: event-specific logo or banner if provided by Admin.</p></li>
</ul></td>
</tr>
</tbody>
</table>

**6.7 Reporting & Data Export**

<table style="width:97%;">
<colgroup>
<col style="width: 11%" />
<col style="width: 33%" />
<col style="width: 9%" />
<col style="width: 11%" />
<col style="width: 30%" />
</colgroup>
<tbody>
<tr>
<td><strong>Req ID</strong></td>
<td><strong>Requirement Description</strong></td>
<td><strong>Priority</strong></td>
<td><strong>User Story</strong></td>
<td><strong>Acceptance Criteria</strong></td>
</tr>
<tr>
<td><strong>FR-RPT-001</strong></td>
<td>Admin shall be able to view a real-time donation summary dashboard per event.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-016</td>
<td><ul>
<li><p>Dashboard shows: Total Amount, Number of Donors, Breakdown by Donation Type.</p></li>
<li><p>Chronological list of all donations with donor name, amount, type, time.</p></li>
<li><p>Dashboard auto-refreshes via Appwrite Realtime subscriptions.</p></li>
<li><p>Admin can apply date range filters on the dashboard.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-RPT-002</strong></td>
<td>Admin shall be able to export the full donation record of an event as an .xlsx file.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-017</td>
<td><ul>
<li><p>Export includes all columns: Receipt No., Donor Name, Phone, Amount, Type, Donated On Behalf Of, Notes, Recorded By, Date &amp; Time.</p></li>
<li><p>A summary row at the bottom shows totals per column.</p></li>
<li><p>File is generated client-side (SheetJS).</p></li>
<li><p>Admin can optionally filter by date range before exporting.</p></li>
<li><p>File naming format: DMS_[EventName]_[Date].xlsx.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-RPT-003</strong></td>
<td>Family Members shall be able to view a live read-only summary for their event.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-018</td>
<td><ul>
<li><p>Real-time total donation amount.</p></li>
<li><p>Number of donors.</p></li>
<li><p>Donor list with Name and Amount visible (phone numbers hidden from family view).</p></li>
<li><p>Dashboard auto-refreshes without page reload.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-RPT-004</strong></td>
<td>Family Members shall be able to download a read-only Excel export of their event's data.</td>
<td style="text-align: center;"><strong>Medium</strong></td>
<td>US-017, US-018</td>
<td><ul>
<li><p>Exported file excludes operator names and phone numbers for donor privacy.</p></li>
<li><p>Same .xlsx format as Admin export, with sensitive columns removed.</p></li>
</ul></td>
</tr>
</tbody>
</table>

**6.8 Multi-Device & Responsive Support**

<table style="width:97%;">
<colgroup>
<col style="width: 11%" />
<col style="width: 33%" />
<col style="width: 9%" />
<col style="width: 11%" />
<col style="width: 30%" />
</colgroup>
<tbody>
<tr>
<td><strong>Req ID</strong></td>
<td><strong>Requirement Description</strong></td>
<td><strong>Priority</strong></td>
<td><strong>User Story</strong></td>
<td><strong>Acceptance Criteria</strong></td>
</tr>
<tr>
<td><strong>FR-DEV-001</strong></td>
<td>The application shall be fully responsive and function correctly on mobile and desktop browsers.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-019</td>
<td><ul>
<li><p>All features work on screen widths from 360px (mobile) to 1920px (desktop).</p></li>
<li><p>Touch targets are ≥ 44px for mobile usability.</p></li>
<li><p>No horizontal scrolling on mobile devices.</p></li>
<li><p>Forms are usable on touchscreens without zooming.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-DEV-002</strong></td>
<td>The application shall be installable as a Progressive Web App (PWA).</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-019</td>
<td><ul>
<li><p>Users can install DMS to their home screen on Android and iOS.</p></li>
<li><p>App icon and splash screen are configured.</p></li>
<li><p>Service worker enables offline functionality post-installation.</p></li>
<li><p>PWA passes Chrome Lighthouse PWA audit at ≥ 90 score.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-DEV-003</strong></td>
<td>Multiple operators shall be able to use the system on different devices simultaneously without conflict.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-007, US-019</td>
<td><ul>
<li><p>10+ concurrent users tested without data race conditions.</p></li>
<li><p>Each operator's entries are isolated by user ID.</p></li>
<li><p>Appwrite Realtime pushes other users' entries to the event list without page refresh.</p></li>
</ul></td>
</tr>
</tbody>
</table>

**6.9 Security & Data Protection**

<table style="width:97%;">
<colgroup>
<col style="width: 11%" />
<col style="width: 33%" />
<col style="width: 9%" />
<col style="width: 11%" />
<col style="width: 30%" />
</colgroup>
<tbody>
<tr>
<td><strong>Req ID</strong></td>
<td><strong>Requirement Description</strong></td>
<td><strong>Priority</strong></td>
<td><strong>User Story</strong></td>
<td><strong>Acceptance Criteria</strong></td>
</tr>
<tr>
<td><strong>FR-SEC-001</strong></td>
<td>All data in transit shall be encrypted using HTTPS/TLS.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-020</td>
<td><ul>
<li><p>Application is served over HTTPS only.</p></li>
<li><p>All Appwrite API calls use HTTPS.</p></li>
<li><p>HTTP requests are redirected to HTTPS.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-SEC-002</strong></td>
<td>Role-Based Access Control (RBAC) shall be enforced at the Appwrite database permission level.</td>
<td style="text-align: center;"><strong>Critical</strong></td>
<td>US-020</td>
<td><ul>
<li><p>Appwrite collection permissions restrict read/write/delete by role.</p></li>
<li><p>Operators cannot read data from events they are not assigned to — even via direct API call.</p></li>
<li><p>Family Members have read-only collection permissions scoped to their event.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-SEC-003</strong></td>
<td>Donor personal data (phone numbers) shall be accessible only to Admin and assigned Operators.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-020</td>
<td><ul>
<li><p>Phone numbers are stored in Appwrite with restricted read permissions.</p></li>
<li><p>Family Member API responses exclude phone number fields.</p></li>
<li><p>Receipt PDFs generated for family use exclude phone numbers.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-SEC-004</strong></td>
<td>The system shall maintain a full audit log for all create, edit, and delete operations.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-010, US-011, US-020</td>
<td><ul>
<li><p>Every mutation records: user ID, action type, timestamp, before/after values.</p></li>
<li><p>Audit logs are viewable by Admin only.</p></li>
<li><p>Logs are immutable — cannot be edited or deleted.</p></li>
</ul></td>
</tr>
<tr>
<td><strong>FR-SEC-005</strong></td>
<td>Session management shall enforce automatic expiry and secure token handling.</td>
<td style="text-align: center;"><strong>High</strong></td>
<td>US-020</td>
<td><ul>
<li><p>Sessions expire after 8 hours of inactivity.</p></li>
<li><p>Refresh tokens are rotated on each use.</p></li>
<li><p>Concurrent sessions on multiple devices are allowed (for operators switching devices).</p></li>
<li><p>Admin can force-expire all sessions for a specific user.</p></li>
</ul></td>
</tr>
</tbody>
</table>

**7. Non-Functional Requirements**

|  |  |  |  |
|----|----|----|----|
| **Category** | **NFR ID** | **Requirement** | **Target / Measure** |
| **Performance** | NFR-PERF-001 | Page load time (initial) | **≤ 3 seconds on 4G connection** |
| **Performance** | NFR-PERF-002 | Donation entry save time | **≤ 1 second (online); instant (offline)** |
| **Performance** | NFR-PERF-003 | Receipt PDF generation | **≤ 5 seconds on mid-range mobile device** |
| **Performance** | NFR-PERF-004 | Excel export (1,000 records) | **≤ 10 seconds** |
| **Availability** | NFR-AVAIL-001 | Online system uptime | **≥ 99.5% monthly (Appwrite SLA)** |
| **Availability** | NFR-AVAIL-002 | Offline functionality | **100% of core features available offline** |
| **Scalability** | NFR-SCALE-001 | Concurrent active operators | **≥ 10 per event; ≥ 50 system-wide** |
| **Scalability** | NFR-SCALE-002 | Records per event | **≥ 5,000 donation records with no degradation** |
| **Usability** | NFR-USE-001 | Operator training time | **≤ 10 minutes to full proficiency** |
| **Usability** | NFR-USE-002 | Form completion time | **≤ 30 seconds per donation entry** |
| **Usability** | NFR-USE-003 | Accessibility | **WCAG 2.1 Level AA compliance** |
| **Security** | NFR-SEC-001 | Authentication protocol | **Appwrite Auth with JWT; bcrypt password hashing** |
| **Security** | NFR-SEC-002 | Data encryption | **TLS 1.2+ in transit; AES-256 at rest (Appwrite)** |
| **Security** | NFR-SEC-003 | Penetration testing | **Conducted before production release** |
| **Maintainability** | NFR-MAIN-001 | Code coverage (unit tests) | **≥ 70% across Angular services and components** |
| **Maintainability** | NFR-MAIN-002 | API versioning | **Appwrite collections versioned; schema migrations documented** |
| **Compatibility** | NFR-COMPAT-001 | Browser support | **Chrome 90+, Safari 14+, Firefox 90+, Edge 90+** |
| **Compatibility** | NFR-COMPAT-002 | OS support | **Android 8+, iOS 14+, Windows 10+, macOS 11+** |

**8. System Architecture Overview**

**8.1 High-Level Architecture**

DMS follows an offline-first, single-page application (SPA) architecture built on Angular 17+ with Appwrite as the Backend-as-a-Service (BaaS) layer. The system is structured into three logical tiers:

|  |  |  |
|----|----|----|
| **Tier** | **Technology** | **Responsibility** |
| **Presentation Layer** | Angular 17+ PWA (TypeScript, Angular Material / TailwindCSS) | All UI rendering, routing, offline detection, form validation, PDF/Excel generation client-side. |
| **Offline Storage** | IndexedDB (via Dexie.js or direct) | Persist donation records, pending sync queue, and event metadata locally when offline. |
| **Service Layer** | Angular Services + Appwrite SDK | Business logic, Appwrite API calls, sync management, auth token handling, conflict detection. |
| **Backend / BaaS** | Appwrite (Auth, Databases, Realtime, Storage) | User authentication, database CRUD, role permissions, realtime push updates, file storage for receipts/exports. |
| **Sync Engine** | Custom Angular service + Appwrite Realtime | Background sync of IndexedDB queue to Appwrite on reconnection; conflict detection; retry logic. |

**8.2 Key Appwrite Services Used**

- Appwrite Auth --- User accounts, sessions, JWT tokens, role-based permissions.

- Appwrite Databases --- Collections for Events, Donations, Users, Audit Logs, Sync Queue.

- Appwrite Realtime --- Live subscription to donation collection per event for real-time dashboard updates.

- Appwrite Storage --- Optional: store generated PDF receipts for re-download.

- Appwrite Functions (optional v1.1) --- Server-side Excel generation for large exports.

**8.3 Offline Sync Strategy**

7.  On save (offline): Donation written to IndexedDB with status = \'pending\'.

8.  On reconnect: Sync engine reads all \'pending\' records from IndexedDB.

9.  For each record: attempt Appwrite create/update. On success, mark record status = \'synced\'.

10. On conflict: If Appwrite record has a newer \`updatedAt\` timestamp, flag as \'conflict\' and surface to Admin.

11. On failure: Mark record status = \'failed\', increment retry counter, retry on next sync cycle.

**9. Data Model**

All collections reside in Appwrite Databases. The following defines the schema for each collection, field types, and access control.

**9.1 Collections**

**Collection: events**

|  |  |  |  |
|----|----|----|----|
| **Field** | **Type** | **Required** | **Notes** |
| **\$id** | String | Auto | Appwrite document ID |
| **name** | String | Yes | Event name |
| **type** | Enum | Yes | \'wedding\' \| \'funeral\' |
| **date** | DateTime | Yes | Event date |
| **hostName** | String | Yes | Host or family name |
| **venue** | String | No | Event location |
| **status** | Enum | Yes | \'active\' \| \'paused\' \| \'closed\' |
| **accessCode** | String | No | Family Member access code (hashed) |
| **assignedUserIds** | String\[\] | Yes | Array of Operator user IDs |
| **createdBy** | String | Yes | Admin user ID |
| **createdAt** | DateTime | Auto | Appwrite \$createdAt |
| **updatedAt** | DateTime | Auto | Appwrite \$updatedAt |

**Collection: donations**

|  |  |  |  |
|----|----|----|----|
| **Field** | **Type** | **Required** | **Notes** |
| **\$id** | String | Auto | Appwrite document ID |
| **eventId** | String | Yes | Foreign key → events.\$id |
| **donorName** | String | Yes | Full name of donor |
| **donorPhone** | String | No | Encrypted; restricted read |
| **amount** | Number | Yes | Donation amount in GHS (0 for in-kind) |
| **donationType** | Enum | Yes | \'cash\' \| \'mobile_money\' \| \'in_kind\' |
| **onBehalfOf** | String | No | Who the donation is on behalf of |
| **notes** | String | No | Operator remarks |
| **receiptNumber** | String | Yes | Auto-generated sequential per event |
| **recordedBy** | String | Yes | Operator user ID |
| **isDeleted** | Boolean | Yes | Soft-delete flag; default false |
| **deletedAt** | DateTime | No | Timestamp of soft-delete |
| **deletedBy** | String | No | Admin user ID of deleter |
| **syncStatus** | Enum | Client | \'synced\' \| \'pending\' \| \'conflict\' \| \'failed\' (local only) |
| **createdAt** | DateTime | Auto | Appwrite \$createdAt |
| **updatedAt** | DateTime | Auto | Appwrite \$updatedAt |

**Collection: audit_logs**

|  |  |  |  |
|----|----|----|----|
| **Field** | **Type** | **Required** | **Notes** |
| **\$id** | String | Auto | Appwrite document ID |
| **entityType** | String | Yes | \'donation\' \| \'event\' \| \'user\' |
| **entityId** | String | Yes | ID of affected record |
| **action** | Enum | Yes | \'create\' \| \'edit\' \| \'delete\' \| \'restore\' |
| **performedBy** | String | Yes | User ID |
| **previousValues** | JSON | No | Snapshot before change |
| **newValues** | JSON | No | Snapshot after change |
| **timestamp** | DateTime | Yes | Time of action |

**10. UI/UX Requirements**

**10.1 Design Principles**

- Speed first: Forms should allow a complete donation entry in ≤ 30 seconds. Minimise fields and clicks.

- Clarity at a glance: Running totals, event names, and status indicators must be readable from arm\'s length on a mobile device.

- Error prevention: Inline validation on required fields; confirm dialogs before destructive actions (delete, close event).

- Graceful degradation: Offline mode must be visually distinct but fully functional, not a degraded experience.

- Accessible: Minimum font size 14px. WCAG 2.1 AA colour contrast. All interactive elements keyboard-accessible.

**10.2 Screen Inventory**

|  |  |  |
|----|----|----|
| **Screen** | **Accessible By** | **Primary Function** |
| **Login Screen** | All Roles | Authenticate user or enter event code |
| **Master Dashboard** | Admin only | Overview of all events, totals, quick actions |
| **Event List** | Admin, Operator | List of events (filtered by assignment for Operators) |
| **Create / Edit Event** | Admin only | Event creation and management form |
| **Event Detail / Donation List** | Admin, Operator | Active donation list, running totals, search/filter |
| **Add Donation Form** | Admin, Operator | Fast entry form for new donations |
| **Edit Donation Form** | Admin, Operator | Edit an existing donation record |
| **Receipt Preview & Print** | Admin, Operator | Print or download receipt PDF |
| **Family Summary View** | Family Member | Read-only live donation dashboard |
| **Reports & Export** | Admin, Family Member | Summary stats and Excel export trigger |
| **User Management** | Admin only | Create, edit, deactivate user accounts |
| **Assign Operators** | Admin only | Assign operators to specific events |
| **Audit Log Viewer** | Admin only | Immutable log of all system actions |
| **Conflict Resolution** | Admin only | Review and resolve sync conflicts |
| **Settings** | Admin only | System preferences, session management |

**10.3 Key UI Behaviours**

- Offline status bar: Persistent top or bottom bar changes to amber/red when offline, with pending sync count badge.

- Real-time updates: Donation list refreshes automatically via Appwrite Realtime without full page reload.

- Toast notifications: Non-blocking notifications for save success, sync complete, errors.

- Skeleton loaders: Used while data is fetching to prevent layout shift.

- Confirm dialogs: Required for all destructive actions (delete, close event, deactivate user).

**11. Integration Requirements**

|  |  |  |
|----|----|----|
| **Integration** | **Type** | **Details** |
| **Appwrite Auth** | Internal BaaS | JWT-based authentication. Appwrite SDK for Angular handles session tokens. Role labels stored in Appwrite user prefs or team memberships. |
| **Appwrite Databases** | Internal BaaS | Primary persistence layer. All collections with document-level permissions. Angular service layer abstracts all CRUD operations. |
| **Appwrite Realtime** | Internal BaaS | Subscribe to donations collection per eventId. Pushes live updates to dashboard without polling. |
| **IndexedDB (Dexie.js)** | Client-side | Offline storage for donation records, pending sync queue, and event cache. Dexie.js provides a clean Promise-based API over IndexedDB. |
| **jsPDF / pdfmake** | Client-side library | Client-side PDF generation for donation receipts. Fully offline-capable. No server required. |
| **SheetJS (xlsx)** | Client-side library | Client-side .xlsx generation for donation export. Runs in-browser; no server round-trip. |
| **Angular Service Worker** | PWA | Enables installation to home screen, offline asset caching, and background sync hooks via @angular/pwa. |
| **Email (Appwrite SMTP)** | Backend | Sends account creation emails and password resets via Appwrite\'s built-in SMTP configuration. |

**12. Acceptance Criteria Summary**

The following master checklist defines the minimum acceptance criteria that must pass before DMS v1.0 is considered release-ready.

|  |  |  |  |
|----|----|----|----|
| **\#** | **Acceptance Criterion** | **Priority** | **User Story** |
| **1** | Admin can log in and is redirected to the master dashboard. | **Critical** | US-001 |
| **2** | Operator sees only assigned events after login. | **Critical** | US-002, US-005 |
| **3** | Family Member can log in via event code with read-only access. | **High** | US-003 |
| **4** | Admin can create a Wedding and a Funeral event simultaneously; their data is fully isolated. | **Critical** | US-006, US-007 |
| **5** | Operator can enter a donation in ≤ 30 seconds with all required fields. | **Critical** | US-009 |
| **6** | Donation entry form works and saves locally when the device is offline. | **Critical** | US-013 |
| **7** | All offline-recorded donations sync automatically within 5 seconds of reconnection. | **Critical** | US-014 |
| **8** | Sync conflicts are flagged in the Admin dashboard, not silently overwritten. | **High** | US-014 |
| **9** | A printable PDF receipt is generated immediately after saving a donation, both online and offline. | **Critical** | US-015 |
| **10** | Receipt includes: Event Name, Donor Name, Amount, Type, Donated On Behalf Of, Date/Time, Receipt Number. | **Critical** | US-015 |
| **11** | Admin dashboard shows running total and breakdown by donation type, updating in real time. | **Critical** | US-016 |
| **12** | Admin can export all donations for an event as a valid .xlsx file. | **Critical** | US-017 |
| **13** | Exported Excel file opens correctly in Microsoft Excel and Google Sheets. | **Critical** | US-017 |
| **14** | Family Member sees live total and donor list without phone numbers visible. | **High** | US-018 |
| **15** | All features (entry, edit, search, receipt) function correctly on a mobile browser at 375px width. | **Critical** | US-019 |
| **16** | Operator on an unassigned event is denied access, even via direct URL. | **Critical** | US-005, US-020 |
| **17** | Admin can soft-delete a record; it disappears from the active list but is recoverable. | **High** | US-011 |
| **18** | Audit log captures all creates, edits, and deletes with user ID and timestamp. | **High** | US-020 |
| **19** | Sessions expire after 8 hours of inactivity. | **High** | US-020 |
| **20** | PWA installs to home screen on Android Chrome and functions offline after install. | **High** | US-019 |

**13. Risks & Mitigations**

|  |  |  |  |  |
|----|----|----|----|----|
| **Risk ID** | **Risk Description** | **Likelihood** | **Impact** | **Mitigation Strategy** |
| **R-001** | Poor internet connectivity at event venues causes sync failures and data loss. | **High** | **Critical** | Offline-first architecture with IndexedDB. Auto-retry sync. Clear offline indicator. Operator training on offline mode. |
| **R-002** | Sync conflicts when two operators edit the same record while both offline. | **Medium** | **High** | Conflict detection engine flags affected records. Admin resolution UI shows both versions. Never silently overwrites. |
| **R-003** | Operator enters wrong donation amount with no way to correct. | **Medium** | **High** | Edit functionality for all operators. Edit audit trail for accountability. Confirmation dialog before saving. |
| **R-004** | Family Member account code is shared with unauthorised parties. | **Medium** | **Medium** | Code is single-use per event. Admin can regenerate code at any time, invalidating previous code. Code grants read-only access only. |
| **R-005** | IndexedDB storage limit exceeded on device (typically \~50% of free disk). | **Low** | **High** | Monitor storage usage. Warn user when ≥ 80% of estimated quota is used. Encourage regular sync before events. |
| **R-006** | Appwrite Cloud service outage during a live event. | **Low** | **Critical** | Offline mode covers all core features. Self-hosted Appwrite option for critical deployments. Data never lost from IndexedDB during outage. |
| **R-007** | Operators share login credentials, breaking audit trail. | **Medium** | **Medium** | Enforce unique credentials per operator. Session logs include device fingerprint. Admin training on security policy. |
| **R-008** | PDF or Excel libraries fail silently on low-memory mobile devices. | **Medium** | **Medium** | Test on low-end Android devices. Implement error boundaries with fallback message and retry option. |

**14. Glossary**

|  |  |
|----|----|
| **Term** | **Definition** |
| **Admin** | Super-user role with full system access. Manages users, events, and all data. |
| **Appwrite** | Open-source Backend-as-a-Service (BaaS) platform used for authentication, database, realtime, and storage. |
| **Audit Log** | An immutable chronological record of all create, edit, and delete operations in the system. |
| **DMS** | Donation Management System --- the product defined in this document. |
| **Donation Type** | Classification of a donation: Cash, Mobile Money, or In-Kind (goods/services). |
| **Event** | A single wedding or funeral occasion registered in the system, with its own isolated donation records. |
| **Family Member** | A user role with read-only access to a specific event\'s donation summary. |
| **GHS** | Ghanaian Cedi --- the primary currency used for donation amounts in DMS v1.0. |
| **IndexedDB** | A browser-native NoSQL database used for offline data storage in the Angular PWA. |
| **In-Kind Donation** | A non-monetary donation (goods, food, services, etc.). Entered with amount = 0 or an estimated value. |
| **Offline-First** | An architecture approach where the application is fully functional without internet, and syncs when connectivity is available. |
| **Operator** | A User role assigned to record donations at a specific event. Also referred to as \'User\' in user stories. |
| **PWA** | Progressive Web App --- a web application that can be installed on a device and works offline like a native app. |
| **RBAC** | Role-Based Access Control --- a security model where permissions are assigned based on a user\'s role. |
| **Receipt** | A printable or downloadable PDF acknowledgement issued to a donor confirming their contribution. |
| **Soft Delete** | A deletion method where records are flagged as deleted but retained in the database for audit and recovery. |
| **Sync Conflict** | A situation where the same record was modified by two different users while offline, resulting in competing versions. |
| **Sync Queue** | A local list of offline-created or offline-edited records waiting to be uploaded to Appwrite on reconnection. |

**15. Sign-Off**

This Product Requirements Document requires formal sign-off from the following parties before development commences. By signing below, each stakeholder confirms they have reviewed and approved the requirements as defined in this document.

|                  |          |               |          |
|------------------|----------|---------------|----------|
| **Name & Title** | **Role** | **Signature** | **Date** |
|                  |          |               |          |
|                  |          |               |          |
|                  |          |               |          |
|                  |          |               |          |

*--- End of Document --- Donation Management System PRD v1.0 ---*
