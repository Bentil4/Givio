**SYSTEM FLOW DOCUMENTATION**

**Donation Management System**

*Complete Step-by-Step Flow for All User Roles, Processes & System Events*

Angular · Appwrite · Offline-First · Weddings & Funerals

|                    |                                     |
|--------------------|-------------------------------------|
| **Document**       | **DMS System Flow Documentation**   |
| **Version**        | 1.0                                 |
| **Status**         | Final                               |
| **Derived From**   | PRD v1.0 + User Stories v1.0        |
| **Date**           | March 2026                          |
| **Scope**          | All 8 system flows --- 3 user roles |
| **Tech Stack**     | Angular 17+ · Appwrite · IndexedDB  |
| **Classification** | Confidential                        |

*CONFIDENTIAL --- FOR ENGINEERING & PRODUCT TEAM ONLY*

**Role & Symbol Legend**

|  |  |  |
|----|----|----|
| **Actor** | **Colour Key** | **Description** |
| **Admin** | Navy / Blue (#1B3A57) | Full system access. Creates events, manages users, oversees all data, handles reports. |
| **Operator (User)** | Teal / Green (#0F6E56) | Assigned to specific events. Records donations, generates receipts. Primary data entry role. |
| **Family Member** | Purple (#534AB7) | Read-only access to their event. Views live totals and donor list via event code. |
| **System / Auto** | Grey (#888888) | Automated system actions: timestamps, audit logs, sync engine, Appwrite Realtime. |
| **Offline / Sync** | Amber (#B8860B) | Any step that involves offline storage (IndexedDB) or data synchronisation. |
| **Decision Point** | Diamond shape in flows | A branch in the flow where the path changes based on a condition (Yes/No). |
| **Output** | Blue italic text in tables | The result or next state produced by a step. |

**Table of Contents**

**1. System Overview Flow**

**2. Authentication Flow**

**3. Admin Flow**

3.1 Event Management

3.2 User Management

3.3 Donation Oversight

3.4 Audit & Security

**4. Operator Flow**

4.1 Event Selection

4.2 Online Donation Entry

4.3 Offline Donation Entry

**5. Donation Lifecycle Flow**

**6. Offline Mode & Sync Flow**

**7. Family Member Flow**

**8. Reports & Export Flow**

**9. Error & Edge Case Flows**

**10. Cross-Flow Interaction Summary**

**1. System Overview Flow**

This section describes the high-level flow of the entire DMS system --- how all three user roles enter the platform, diverge into their respective workflows, and how their data converges via Appwrite Realtime.

|  |  |
|----|----|
| **OVERVIEW** | \[Any user opens the DMS Angular PWA in a browser on mobile or desktop. All three roles enter through the same login screen, authenticate via Appwrite, and are directed to role-specific dashboards. All data ultimately resides in Appwrite and is served in real time to dashboards.\] |

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **System** | **App loads** | Angular PWA loads in browser. Service worker checks for cached assets. Offline indicator initialises. | Login screen rendered |
| **2** | **Any User** | **Opens DMS** | User navigates to DMS URL or launches installed PWA from home screen. | Login screen displayed |
| **3** | **Any User** | **Authenticates** | User enters credentials or event code. Appwrite Auth validates and issues session token. | Session token stored securely |
| **4** | **Admin** | **Redirected to master dashboard** | Admin sees all active events system-wide, running totals, and quick-action buttons. | Master dashboard rendered |
| **5** | **Operator** | **Redirected to assigned events list** | Operator sees only events they have been assigned to by Admin. | Event list rendered |
| **6** | **Family Member** | **Redirected to event summary** | Family Member lands on read-only live donation summary for their specific event. | Event summary rendered |
| **7** | **System** | **Appwrite Realtime subscribes** | All dashboards subscribe to their relevant Appwrite collection in real time. Any new donation pushes an update to all subscribed screens without page refresh. | Live dashboards active |
| **8** | **Any User** | **Performs role actions** | Each role executes their specific workflow (detailed in Sections 3--8). | Role-specific flow continues |
| **9** | **Any User** | **Logs out** | Session cleared from Appwrite and client. User redirected to login screen. | Session terminated |

**2. Authentication Flow**

All users --- Admin, Operator, and Family Member --- enter the system through the authentication flow. Two paths exist: standard email/password login and event-code login for Family Members.

**2.1 Standard Login (Admin & Operator)**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Any User** | **Opens login screen** | DMS login screen loads. Two input fields presented: Email and Password. A secondary CTA \'Enter Event Code\' is visible below. | Login screen displayed |
| **2** | **Any User** | **Enters credentials** | User types email address and password. Inline validation checks field format before submission. | Fields populated |
| **3** | **Any User** | **Submits login** | User taps/clicks \'Sign In\'. Angular makes an authentication request to Appwrite Auth endpoint. | Auth request sent |
| **4** | **System** | **Validates credentials** | Appwrite Auth checks email/password hash against stored user record. | Validation result returned |
| **5** | **System** | **Rate limit check** | System checks if this IP/account has exceeded 5 failed attempts. If yes, account is temporarily locked. | Rate limit status checked |
| **6** | **System** | **Issues session token** | On success, Appwrite issues a JWT session token. Token is stored securely in the Angular app (not localStorage in plain text). | Session token stored |
| **7** | **System** | **Checks user role** | Appwrite user record is read to determine role: Admin, Operator, or Family Member. | Role identified |
| **8** | **Admin** | **Redirected to master dashboard** | Admin is routed to the master dashboard showing all events, system-wide totals, and management actions. | Admin dashboard loaded |
| **9** | **Operator** | **Redirected to event list** | Operator is routed to their personal event list, filtered by assigned events only. | Operator event list loaded |

<table style="width:96%;">
<colgroup>
<col style="width: 2%" />
<col style="width: 93%" />
</colgroup>
<tbody>
<tr>
<td><strong>ERROR PATH — INVALID CREDENTIALS</strong></td>
<td><p>• Wrong email or password: generic error shown — 'Invalid credentials. Please try again.'</p>
<p>• Account locked after 5 failures: 'Account temporarily locked. Contact your administrator.'</p>
<p>• No information leakage about whether email or password is incorrect.</p></td>
</tr>
</tbody>
</table>

**2.2 Event Code Login (Family Member)**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Family Member** | **Taps \'Enter Event Code\'** | The event code input panel slides down below the main login card. An OTP-style input with individual character boxes is shown. | Code entry panel revealed |
| **2** | **Family Member** | **Enters event code** | Family Member types the alphanumeric code (minimum 8 characters) shared by the Admin. Input auto-advances between character boxes. | Code entered |
| **3** | **Family Member** | **Submits code** | User taps \'Access Event\'. Angular sends the code to Appwrite for validation against the events collection. | Code validation request sent |
| **4** | **System** | **Validates event code** | Appwrite checks if the code matches an active event record. Checks that the event is not closed. | Code validated or rejected |
| **5** | **System** | **Issues read-only session** | On success, a restricted session is issued with read-only permissions scoped to the specific event. | Restricted session token issued |
| **6** | **Family Member** | **Redirected to event summary** | Family Member lands on the read-only live donation summary for their event. No edit or navigation options are shown. | Event summary loaded |

|  |  |  |  |
|----|----|----|----|
| **Condition** | **If Yes** | **If No** | **Notes** |
| **Is the code valid?** | Issue read-only session → redirect to event summary | Show error: \'Invalid or expired code. Contact your administrator.\' | Code is single-event-scoped and case-sensitive. |
| **Is the event active?** | Allow access to event summary | Show error: \'This event has been closed.\' | Closed events block family member access. |
| **Is session still valid?** | Continue --- token auto-refreshes | Redirect to login screen with message: \'Session expired.\' | Sessions expire after 8 hours of inactivity. |

**3. Admin Flow**

The Admin is the system super-user. From the master dashboard, the Admin manages the full lifecycle of events, controls user access, oversees all donation records, resolves sync conflicts, and generates reports. The Admin flow is divided into four functional sub-flows.

**3.1 Event Management Flow**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Admin** | **Opens Event Management** | From the master dashboard sidebar, Admin clicks \'Events\'. The event list screen loads showing all events (active, paused, and closed) in a card grid. | Event list displayed |
| **2** | **Admin** | **Creates new event** | Admin clicks \'Create New Event\'. The event creation form opens as a centred card (or full page on mobile). | Event creation form rendered |
| **3** | **Admin** | **Selects event type** | Admin clicks either the \'Wedding\' or \'Funeral\' toggle card. Selection applies the appropriate accent colour (Gold/Slate) to the event throughout the system. | Event type selected |
| **4** | **Admin** | **Fills event details** | Admin enters: Event Name, Host/Family Name, Date, Venue (optional), Description (optional). All required fields validated inline. | Event fields completed |
| **5** | **Admin** | **Assigns operators** | Admin uses the multi-select operator dropdown to assign one or more Operators to the event. Selected operators appear as removable chips. | Operators assigned |
| **6** | **Admin** | **Configures family access** | Admin toggles \'Enable family member access\'. System auto-generates a unique 8-character alphanumeric event code. Admin copies and shares the code. | Event code generated |
| **7** | **Admin** | **Saves event** | Admin clicks \'Create Event\'. Event document is written to Appwrite with status = \'active\'. System assigns a unique event ID. | Event created in Appwrite |
| **8** | **System** | **Notifies assigned operators** | Assigned operators see the new event appear in their event list dashboard immediately via Appwrite Realtime. | Operators notified |
| **9** | **Admin** | **Edits event (ongoing)** | Admin can update any event field at any time before closing. All edits are logged in the audit log with timestamp. | Event updated --- audit logged |
| **10** | **Admin** | **Pauses event** | Admin sets status to \'Paused\'. Operators can no longer add new donations but can view existing records. | Event paused |
| **11** | **Admin** | **Closes event** | Admin sets status to \'Closed\'. Donations are locked. Event remains visible for reporting. Admin can reopen if needed. | Event closed --- reporting only |

**3.2 User Management Flow**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Admin** | **Opens User Management** | Admin navigates to \'Users\' in the sidebar. Full user list loads with search, role filter, and status filter controls. | User list displayed |
| **2** | **Admin** | **Creates new user** | Admin clicks \'Add New User\'. A side drawer slides in from the right with a creation form. | Side drawer opened |
| **3** | **Admin** | **Fills user details** | Admin enters Full Name, Email Address, and selects Role (Admin / Operator / Family Member). Optionally toggles \'Send invite email\'. | User form completed |
| **4** | **Admin** | **Saves user** | Admin clicks \'Save\'. User record is created in Appwrite Auth. If invite email is enabled, Appwrite SMTP sends account creation email with temporary credentials. | User created --- email sent |
| **5** | **Admin** | **Assigns operator to event** | Admin navigates to an event and uses the operator assignment dropdown to link the user to specific events. | Operator assignment saved |
| **6** | **Admin** | **Edits user** | Admin clicks the edit icon on a user row. Side drawer opens with pre-filled fields. Admin updates name, email, or role. Role changes take effect immediately. | User record updated |
| **7** | **Admin** | **Deactivates user** | Admin toggles the deactivate switch. User can no longer log in. All their donation records are preserved (soft association maintained). | User deactivated |
| **8** | **Admin** | **Deletes user** | Admin clicks delete icon, confirms in dialog. User is soft-deleted. Their donation records display \'Deleted User\' as operator name. Admin logged. | User soft-deleted |
| **9** | **Admin** | **Force-expires sessions** | Admin can force-expire all active sessions for a specific user from the user detail view. Used if a device is lost or access needs to be immediately revoked. | All user sessions terminated |

**3.3 Donation Oversight Flow**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Admin** | **Opens event detail** | Admin clicks \'View\' on any event card. The event detail screen loads with the full donation list, running totals, and real-time updates. | Event detail screen loaded |
| **2** | **Admin** | **Reviews donations** | Admin sees all donation entries in chronological order. Columns: Receipt \#, Donor Name, Amount, Type, On Behalf Of, Recorded By, Time. | Donation list reviewed |
| **3** | **Admin** | **Searches / filters** | Admin uses the search bar (by donor name or phone) and filter controls (by type, date range) to locate specific records. | Filtered list displayed |
| **4** | **Admin** | **Edits a donation** | Admin clicks the edit icon on any row. Edit form opens pre-filled. Admin corrects values and saves. All changes logged in audit trail with before/after values. | Record updated --- audit logged |
| **5** | **Admin** | **Soft-deletes a donation** | Admin clicks the delete icon. Confirmation dialog shown: \'Are you sure? This record can be recovered within 30 days.\' Admin confirms. | Record soft-deleted --- audit logged |
| **6** | **Admin** | **Recovers a deleted donation** | Within 30 days, Admin can navigate to the deleted records view and click \'Restore\'. Record reappears in the active donation list. | Record restored --- audit logged |
| **7** | **Admin** | **Reviews sync conflicts** | After an offline sync event, Appwrite flags records where two operators edited the same donation while offline. Admin sees a conflict resolution panel. | Conflict resolution UI shown |
| **8** | **Admin** | **Resolves conflict** | Admin reviews both versions side by side. Selects \'Keep Version A\', \'Keep Version B\', or \'Edit Manually\'. Decision is logged. | Conflict resolved --- one version kept |

**3.4 Audit & Security Flow**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Admin** | **Opens Audit Log** | Admin navigates to \'Audit Log\' in the sidebar. Full immutable log is displayed in reverse-chronological order. | Audit log displayed |
| **2** | **Admin** | **Filters log** | Admin uses filters: Date range, Action Type (Create/Edit/Delete/Restore), Entity Type (Donation/Event/User), and Performed By. | Filtered log shown |
| **3** | **Admin** | **Expands log entry** | Admin clicks \'Details\' on any log row. An expanded view shows: Entity ID, action performed, operator, timestamp, full before/after field values as a diff. | Audit entry detail shown |
| **4** | **Admin** | **Exports audit log** | Admin clicks \'Export CSV\'. Full filtered audit log is downloaded as a CSV file for compliance or external review. | Audit log exported |
| **5** | **System** | **Auto-logs all mutations** | Every create, edit, delete, and restore operation writes an immutable log entry to Appwrite. Logs cannot be edited or deleted --- even by Admin. | Continuous audit trail maintained |

**4. Operator Flow**

The Operator is the primary data-entry role. They are assigned to specific events and use DMS at the event venue to record donations as donors arrive. Their flow is designed for speed --- a complete donation entry should take under 30 seconds.

**4.1 Event Selection Flow**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Operator** | **Logs in** | Operator authenticates with email and password. Session token issued. | Operator dashboard loaded |
| **2** | **Operator** | **Views assigned events** | Event list shows only events the Operator is assigned to. Each card shows event name, type (Wedding/Funeral), date, host name, and current donation total. | Assigned events listed |
| **3** | **Operator** | **Checks connectivity** | DMS detects network status. If offline, the amber status bar is shown: \'Offline --- X records pending sync\'. Features remain fully functional. | Connectivity status shown |
| **4** | **Operator** | **Selects event** | Operator taps \'Enter Donations\' on the relevant event card. If multiple events are active, the Operator selects from their list --- there is no cross-event access. | Event detail screen loaded |
| **5** | **Operator** | **Reviews running state** | Event detail screen shows: live donation total at the top (bold, event-accent colour), donation list below, and the entry form (side panel on desktop, FAB on mobile). | Event state reviewed |

**4.2 Online Donation Entry Flow**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Operator** | **Opens donation form** | On desktop: form is always visible in the right panel. On mobile: Operator taps the Navy FAB (+) button. The entry form opens as a bottom sheet with auto-focus on Donor Name field. | Entry form opened |
| **2** | **Operator** | **Enters donor name** | Operator types the donor\'s full name. Field is required. Auto-capitalise enabled on mobile. | Name entered |
| **3** | **Operator** | **Enters donation amount** | Operator enters the GHS amount using the numeric keypad. Large font (24px) is used inside the amount field for easy reading. Field is required. | Amount entered |
| **4** | **Operator** | **Selects donation type** | Operator taps one of three segments: Cash / Mobile Money / In-Kind. For In-Kind, amount field may be set to 0 or estimated value. | Type selected |
| **5** | **Operator** | **Fills optional fields** | Operator enters \'On Behalf Of\' (who is the donation from), Donor Phone (optional), and Notes (optional). | Optional fields completed |
| **6** | **Operator** | **Confirms and saves** | Operator taps \'Save & Print Receipt\'. A confirmation dialog shows the entered details. Operator confirms. | Confirmation dialog shown |
| **7** | **System** | **Validates fields** | Angular validates all required fields. If any required field is empty or invalid, inline error messages appear and submission is blocked. | Validation passed or failed |
| **8** | **System** | **Saves to Appwrite** | On successful validation and confirmation, donation document is written to Appwrite. Fields: eventId, donorName, amount, donationType, onBehalfOf, donorPhone, notes, receiptNumber, recordedBy, createdAt. | Donation saved to Appwrite |
| **9** | **System** | **Generates receipt number** | System auto-generates a sequential receipt number per event (e.g. DMS-2026-0001, DMS-2026-0002). Number is assigned on save and is immutable. | Receipt number assigned |
| **10** | **System** | **Writes audit log** | An audit log entry is created: action = \'create\', entity = donation, performed by = operator ID, timestamp, all field values. | Audit log entry created |
| **11** | **System** | **Updates real-time dashboard** | Appwrite Realtime pushes the new donation to all subscribed dashboards (other operators on the same event, Admin, Family Member view). | All dashboards updated live |
| **12** | **Operator** | **Reviews and prints receipt** | Receipt PDF is rendered immediately. Operator can tap \'Print Receipt\' to open the browser print dialog, or \'Download PDF\' to save. | Receipt printed or downloaded |
| **13** | **Operator** | **Continues to next donor** | Form resets automatically after successful save. Operator is ready for the next donor entry. | Form reset --- ready for next |

**4.3 Offline Donation Entry Flow**

|  |  |
|----|----|
| **OFFLINE MODE** | DMS detects when the device loses internet connectivity. The amber offline bar appears instantly. The Operator continues entering donations normally --- the experience is identical to online mode, except records are saved to IndexedDB instead of Appwrite. |

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **System** | **Detects offline status** | Angular\'s network event listener fires. Offline status bar appears: \'Offline --- 0 records pending sync\'. All features remain active. | Offline mode activated |
| **2** | **Operator** | **Enters donation normally** | Operator fills the donation form exactly as in the online flow. No change to the UI or process from the operator\'s perspective. | Form completed normally |
| **3** | **System** | **Saves to IndexedDB** | On save, donation record is written to the device\'s IndexedDB with syncStatus = \'pending\'. A pending sync counter increments in the status bar. | Record saved locally |
| **4** | **System** | **Generates receipt offline** | Receipt PDF is generated entirely client-side using jsPDF / pdfmake. No network request needed. Receipt number is assigned locally (will be confirmed on sync). | Receipt generated offline |
| **5** | **Operator** | **Sees pending indicator** | Each locally saved record in the donation list shows a small amber cloud-slash icon indicating it has not yet synced to Appwrite. | Pending indicators shown |
| **6** | **Operator** | **Continues entering donations** | Multiple donations can be entered offline. All are queued in IndexedDB. The pending count updates with each save. | All donations queued locally |
| **7** | **System** | **Detects reconnection** | When internet connectivity resumes, the network listener fires. Sync engine activates automatically --- no Operator action required. | Sync engine triggered |
| **8** | **System** | **Syncs to Appwrite** | Sync engine reads all \'pending\' records from IndexedDB. Uploads each to Appwrite in order. On success, record\'s syncStatus = \'synced\'. Amber icon removed from that row. | Records synced to Appwrite |
| **9** | **System** | **Handles conflicts** | If a record was also modified by another operator while offline, a conflict is detected. The record is flagged as \'conflict\' and surfaced to Admin for resolution. | Conflicts flagged for Admin |
| **10** | **System** | **Notifies Operator** | On completion, a green toast notification is shown: \'Sync complete --- X records uploaded.\' Pending count resets to 0. Offline bar disappears. | Operator notified --- sync complete |

**5. Donation Lifecycle Flow**

This section documents the complete lifecycle of a single donation record --- from the moment a donor arrives at the event to the point where the record is fully synced, audited, and available in reports.

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **---** | **Donor arrives at event** | A donor approaches the donation desk at the wedding or funeral. The Operator is ready with DMS open on their device. | Donation process begins |
| **2** | **Operator** | **Opens entry form** | Operator opens the donation form (desktop: right panel; mobile: FAB → bottom sheet). Auto-focus lands on Donor Name field. | Entry form ready |
| **3** | **Operator** | **Enters all fields** | Donor Name (required), Amount in GHS (required), Donation Type (required), On Behalf Of (optional), Phone (optional), Notes (optional). | All fields entered |
| **4** | **System** | **Validates form** | Angular checks all required fields. Type-specific validation (e.g. amount must be a non-negative number). Inline errors shown instantly. | Validation result |
| **5** | **Operator** | **Confirms entry** | Confirmation dialog shown with all entered values. Operator reviews and confirms. Cancelling returns to the form without clearing fields. | Confirmed or cancelled |
| **6** | **System** | **Checks connectivity** | System determines if the device is online or offline. This determines the save target: Appwrite (online) or IndexedDB (offline). | Save target determined |
| **7A** | **System** | **\[ONLINE\] Saves to Appwrite** | Donation document written to Appwrite donations collection. Appwrite assigns \$id and \$createdAt automatically. Receipt number auto-generated. | Record persisted in Appwrite |
| **7B** | **System** | **\[OFFLINE\] Saves to IndexedDB** | Donation object written to IndexedDB with syncStatus = \'pending\' and a local UUID. Receipt number assigned locally with prefix \'LOCAL-\'. | Record queued in IndexedDB |
| **8** | **System** | **Creates audit log entry** | Immutable audit entry written: action = \'create\', entity = \'donation\', entityId, performedBy (operator ID), timestamp, all field values. | Audit entry created |
| **9** | **System** | **Generates receipt PDF** | jsPDF renders a formatted A5 receipt with: event name, donor name, amount, type, on behalf of, date/time, receipt number, operator name, thank-you message. Available immediately. | Receipt PDF ready |
| **10** | **Operator** | **Prints or downloads receipt** | Operator taps \'Print\' (browser print dialog) or \'Download PDF\'. Receipt is given to the donor as acknowledgement. | Donor receives receipt |
| **11** | **System** | **Updates real-time dashboards** | Appwrite Realtime pushes the new record to all subscribed clients: Admin dashboard, other operator dashboards for the same event, Family Member summary view. | All live views updated |
| **12** | **Operator** | **Edits record (if needed)** | If an error is discovered, Operator can edit the record. All edits are logged in the audit trail with before/after field values and editor ID. | Record corrected --- audit logged |
| **13** | **Admin** | **Deletes record (if needed)** | Admin can soft-delete erroneous or duplicate records. Soft-deleted records are removed from active view but retained for 30-day recovery window. | Record soft-deleted |
| **14** | **System** | **\[OFFLINE ONLY\] Syncs to Appwrite** | When connectivity is restored, sync engine uploads all pending IndexedDB records to Appwrite. Receipt numbers are finalised. syncStatus updated to \'synced\'. | Record fully persisted |
| **15** | **System** | **Record available in reports** | Synced record appears in Admin\'s report dashboard, contributes to event totals, and is included in Excel exports. | Record in reporting system |

**6. Offline Mode & Data Synchronisation Flow**

The offline-first architecture is one of the most critical aspects of DMS. Event venues may have poor or no internet connectivity. This section documents the complete offline detection, operation, sync, and conflict resolution flow.

**6.1 Offline Detection & Activation**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **System** | **Monitors network status** | Angular\'s network status service continuously monitors the browser\'s online/offline events using the window.navigator.onLine property and fetch-based probes to Appwrite. | Network status continuously monitored |
| **2** | **System** | **Detects offline event** | When connectivity is lost, the offline event fires. The app immediately transitions to offline mode. | Offline mode activated |
| **3** | **System** | **Shows offline indicator** | Amber status bar appears below the top navigation bar: \'Offline --- 0 records pending sync\'. The bar is persistent until connectivity returns. | Amber bar visible |
| **4** | **System** | **Disables sync-dependent UI** | Any \'Export to Excel\' or \'View Audit Log\' actions that require Appwrite are temporarily disabled. All core donation entry features remain fully active. | UI adapts to offline state |
| **5** | **Operator** | **Continues working normally** | Operator enters donations as usual. The only visible difference is the amber bar and the cloud-slash icons on unsynced rows. | Normal operation continues |

**6.2 Offline Data Storage**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **System** | **Writes to IndexedDB** | Every donation created or edited while offline is written to a local IndexedDB database (managed via Dexie.js). Each record has a local UUID and syncStatus = \'pending\'. | Record stored locally |
| **2** | **System** | **Updates pending count** | The pending sync counter in the offline status bar increments for each new pending record: \'Offline --- 3 records pending sync\'. | Counter updated |
| **3** | **System** | **Maintains full functionality** | Operators can view all locally stored records, search and filter them, edit them, and generate PDF receipts --- all without internet. | Full offline functionality confirmed |
| **4** | **System** | **Persists across page reloads** | IndexedDB data survives browser/app reloads. If the device restarts during an event, all pending records are retained. | Data survives restart |

**6.3 Reconnection & Sync**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **System** | **Detects reconnection** | When internet is restored, the online event fires. The sync engine activates automatically within 3 seconds. | Sync engine triggered |
| **2** | **System** | **Reads pending queue** | Sync engine queries IndexedDB for all records with syncStatus = \'pending\'. Records are processed in creation order (oldest first). | Pending queue read |
| **3** | **System** | **Uploads first record** | Sync engine sends the first pending record to Appwrite. If Appwrite accepts it, the record\'s syncStatus is updated to \'synced\' in IndexedDB. The row\'s cloud-slash icon is replaced with a green checkmark. | Record uploaded |
| **4** | **System** | **Continues queue processing** | Sync engine processes each pending record sequentially. Progress is shown in the sync overlay panel (if open): \'3 of 7 records synced\...\' | Queue processed progressively |
| **5** | **System** | **Handles upload failure** | If an individual record upload fails (e.g. network drops mid-sync), it is marked syncStatus = \'failed\' and a retry counter is incremented. The sync engine retries on the next reconnection. | Failed records queued for retry |
| **6** | **System** | **Completes sync** | When all records are synced, the offline bar disappears. A green toast notification is shown: \'All synced --- 7 records uploaded.\' The sync overlay shows a green success animation. | Sync complete --- user notified |
| **7** | **Operator** | **Verifies synced records** | Previously pending records in the donation list now display without the cloud-slash icon. They are fully persisted and real-time visible to Admin and Family Member views. | Records confirmed in Appwrite |

**6.4 Conflict Detection & Resolution**

|  |  |
|----|----|
| **WHEN CONFLICTS OCCUR** | A sync conflict occurs when two operators edited the same donation record while both were offline, resulting in two different versions of the same record. DMS never silently overwrites --- conflicts are always surfaced to Admin. |

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **System** | **Detects conflict on upload** | During sync, if an existing Appwrite record has a newer updatedAt timestamp than the local record being uploaded, a conflict is detected. | Conflict detected |
| **2** | **System** | **Flags conflicting record** | The record is marked syncStatus = \'conflict\' in IndexedDB. Neither version is automatically applied. A conflict badge appears in the Admin dashboard sidebar. | Conflict flagged --- Admin alerted |
| **3** | **Admin** | **Opens conflict resolution screen** | Admin navigates to the conflict resolution screen. A list of all conflicting records is shown, each with an amber accent and \'CONFLICT\' badge. | Conflict list displayed |
| **4** | **Admin** | **Reviews both versions** | For each conflict, Admin sees a two-column comparison table: Version A (Operator 1\'s edit) vs Version B (Operator 2\'s edit). Differing fields are highlighted in amber. | Both versions compared |
| **5** | **Admin** | **Resolves conflict** | Admin selects one of three options: \'Keep Version A\', \'Keep Version B\', or \'Edit Manually\' (opens the donation edit form pre-filled with Version A values). | Resolution action chosen |
| **6** | **System** | **Applies resolution** | The chosen version is written to Appwrite as the canonical record. The conflicting version is archived in the audit log as a historical record. | Canonical version saved |
| **7** | **System** | **Logs resolution** | Audit log entry created: action = \'conflict_resolved\', performed by Admin ID, both versions recorded as before/after values. | Conflict resolution audited |
| **8** | **Admin** | **Confirms progress** | Progress indicator updates: \'2 of 3 conflicts resolved.\' When all resolved, conflict badge disappears from dashboard. | All conflicts resolved |

**7. Family Member Flow**

The Family Member has a deliberately simple, read-only experience. They access a live summary of their event\'s donations using a unique event code provided by the Admin. They cannot modify any data.

**7.1 Access Setup (Admin side)**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Admin** | **Creates event** | Admin creates the wedding or funeral event in DMS with all required details. | Event created |
| **2** | **Admin** | **Enables family access** | Admin toggles \'Enable family member access\' on the event creation or edit screen. | Family access toggle enabled |
| **3** | **System** | **Generates event code** | Appwrite generates a unique 8-character alphanumeric code for the event. The code is stored (hashed) against the event record. | Event code generated |
| **4** | **Admin** | **Shares code** | Admin copies the code and shares it with the family member via WhatsApp, SMS, or in person. | Code shared with family |
| **5** | **Admin** | **Regenerates code (if needed)** | Admin can regenerate the code at any time from the event settings. The previous code is immediately invalidated. | New code issued --- old code invalid |

**7.2 Family Member Session Flow**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Family Member** | **Opens DMS** | Family member navigates to the DMS URL on their phone or tablet. The login screen is shown. | Login screen loaded |
| **2** | **Family Member** | **Taps \'Enter Event Code\'** | The event code input panel appears. OTP-style individual character boxes are shown. | Code entry panel shown |
| **3** | **Family Member** | **Enters code** | Family member types the code shared by Admin. Input auto-advances between character boxes. | Code entered |
| **4** | **System** | **Validates code** | Appwrite looks up the code against active events. Checks code is not expired and the event is not closed. | Code validated |
| **5** | **System** | **Issues read-only session** | A restricted session is issued. The session has read-only permissions scoped to the specific event\'s documents. Phone number fields are excluded from all queries. | Restricted session issued |
| **6** | **Family Member** | **Lands on event summary** | Family member sees their event summary: large event name hero banner, live total donation amount (event-accent colour), breakdown by type, and donor list. | Event summary displayed |
| **7** | **System** | **Subscribes to real-time updates** | Appwrite Realtime subscription is established for the family member\'s event. Any new donation added by operators appears within seconds --- no page refresh required. | Live updates active |
| **8** | **Family Member** | **Monitors live total** | Family member watches the running total update in real time as donors contribute throughout the event. | Live total monitored |
| **9** | **Family Member** | **Views donor list** | Family member sees a list of all donors: name, amount, donation type, and \'on behalf of\' field. Phone numbers are not shown. | Donor list reviewed |
| **10** | **Family Member** | **Downloads report** | Family member taps \'Download Report\'. A filtered .xlsx file is generated client-side (SheetJS). Sensitive columns (phone numbers, operator names) are excluded. | Report downloaded |

|  |  |
|----|----|
| **DATA PRIVACY NOTE** | Phone numbers and operator names are never exposed to Family Members. Appwrite database-level permissions enforce this --- it is not just a UI guard. Even a direct API call from the family member\'s session would not return these fields. |

**8. Reports & Export Flow**

DMS provides real-time reporting for Admins and a simplified view for Family Members. All exports are generated client-side in the browser, meaning they work even on low-bandwidth connections and require no server processing.

**8.1 Admin Report Flow**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Admin** | **Opens Reports section** | Admin clicks \'Reports\' in the sidebar. The reports screen loads with an event selector dropdown at the top. | Reports screen loaded |
| **2** | **Admin** | **Selects event** | Admin selects an event from the dropdown. The event name and type badge (Wedding/Funeral) are shown. All dashboard panels update to show data for the selected event. | Event selected --- dashboard loaded |
| **3** | **System** | **Loads summary statistics** | Appwrite query fetches: total donation amount, total donor count, average donation, and largest single donation. These populate the four stats cards. | Stats cards populated |
| **4** | **System** | **Loads type breakdown** | Appwrite aggregates donations by type (Cash, Mobile Money, In-Kind). A donut chart is rendered using Chart.js with event-accent colour. | Donut chart rendered |
| **5** | **System** | **Loads hourly chart** | Donations are grouped by hour of day. A bar chart shows peak donation times. Useful for identifying staffing patterns at future events. | Hourly bar chart rendered |
| **6** | **System** | **Loads full donation table** | Full paginated donation list for the event is loaded. All columns visible to Admin: Receipt \#, Donor Name, Phone, Amount, Type, On Behalf Of, Recorded By, Time. | Full table loaded |
| **7** | **Admin** | **Applies date range filter** | Admin optionally sets a \'From\' and \'To\' date using date pickers. All dashboard panels and the export re-query with the date filter applied. | Dashboard filtered by date |
| **8** | **Admin** | **Exports to Excel** | Admin clicks \'Export to Excel\'. SheetJS generates a .xlsx file in the browser. File includes all columns plus a summary row at the bottom showing totals. File is named: DMS\_\[EventName\]\_\[Date\].xlsx. | Excel file downloaded |
| **9** | **Admin** | **Reviews exported file** | Admin opens the .xlsx file in Microsoft Excel or Google Sheets. All data is correctly structured with headers, data rows, and a bold summary row. | Export validated |

**8.2 Family Member Export Flow**

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Actor** | **Action** | **Detail** | **Output / Next** |
| **1** | **Family Member** | **Taps \'Download Report\'** | Family member taps the download FAB on their event summary screen. | Export triggered |
| **2** | **System** | **Builds filtered dataset** | The export function reads from the already-loaded family member session data. Phone number and operator name columns are stripped from the dataset before export. | Filtered dataset built |
| **3** | **System** | **Generates Excel file** | SheetJS generates a .xlsx file client-side with: Donor Name, Amount, Type, On Behalf Of, Date/Time. A summary row shows total amount. | Family report generated |
| **4** | **Family Member** | **Downloads file** | Browser downloads the file: DMS\_\[EventName\]\_FamilySummary\_\[Date\].xlsx. No server round-trip required. | File downloaded |

**9. Error & Edge Case Flows**

This section documents how DMS handles error conditions, boundary cases, and edge scenarios across all flows.

|  |  |  |  |
|----|----|----|----|
| **Scenario** | **Trigger** | **System Response** | **User Action Required** |
| **Invalid login credentials** | Wrong email or password entered | Show generic error: \'Invalid credentials. Please try again.\' No detail about which field is wrong. | Re-enter credentials |
| **Account locked** | 5 consecutive failed login attempts | Show: \'Account temporarily locked. Contact your administrator.\' Login form disabled. | Contact Admin |
| **Session expired** | 8 hours of inactivity | User is silently redirected to login screen with message: \'Session expired. Please sign in again.\' | Re-authenticate |
| **Invalid event code** | Family member enters wrong code | Show error: \'Invalid or expired code. Contact your administrator.\' Code boxes highlighted red. | Get correct code from Admin |
| **Form validation failure** | Required field is empty or invalid | Inline error message appears below the relevant field. Form submission blocked. | Fix the highlighted fields |
| **Offline --- entry attempt** | Device is offline during donation entry | Form works normally. Record saved to IndexedDB. Amber toast: \'Saved locally --- syncing when online.\' | Continue normally |
| **Sync failure --- single record** | Appwrite rejects an individual record upload | Record stays in IndexedDB with syncStatus = \'failed\'. Retry on next sync cycle. Operator notified. | Wait for auto-retry |
| **Sync conflict** | Two operators edited same record offline | Record flagged as \'conflict\'. Admin dashboard shows conflict badge. Neither version auto-applied. | Admin resolves conflict |
| **IndexedDB quota exceeded** | Device storage nearly full | Warning toast: \'Storage almost full --- sync your data before continuing.\' | Connect to internet to sync |
| **Appwrite outage** | Cloud backend unavailable | Offline mode activates automatically. All operations continue locally. | Continue offline --- sync when restored |
| **Operator accesses unassigned event** | URL manipulation or direct link attempt | Appwrite RBAC denies the query. Screen shows: \'Access denied. You are not assigned to this event.\' | Contact Admin to request access |
| **Admin closes event mid-entry** | Event status set to \'Closed\' while operators are active | Operators see a banner: \'This event has been closed by the administrator.\' New entries blocked. | Contact Admin |
| **Receipt generation failure** | PDF library error on low-memory device | Error toast: \'Receipt could not be generated. Tap to retry.\' Donation record is still saved. | Tap retry to regenerate receipt |
| **Excel export failure** | SheetJS error or memory issue | Error toast: \'Export failed. Please try again.\' No partial file downloaded. | Retry export |
| **Duplicate donor name** | Same name entered for multiple donations | System allows it --- duplicate names are valid (multiple family members may have the same name). Receipt numbers distinguish records. | No action required |

**10. Cross-Flow Interaction Summary**

This section summarises how the different user flows interact with each other, showing data dependencies, real-time connections, and shared system events.

**10.1 Data Flow Between Roles**

|  |  |  |  |
|----|----|----|----|
| **From** | **To** | **Data / Event** | **Mechanism** |
| **Admin** | **Operator** | Event assignment | Appwrite Realtime --- event appears in operator\'s list instantly |
| **Admin** | **Family Member** | Event code | Manual --- Admin copies and shares the code outside DMS |
| **Admin** | **Operator** | Event status change (pause/close) | Appwrite Realtime --- banner shown on operator\'s screen |
| **Operator** | **Admin** | New donation record | Appwrite Realtime --- donation appears in Admin\'s event view instantly |
| **Operator** | **Family Member** | New donation record | Appwrite Realtime --- total and donor list updates on family view |
| **Operator** | **System** | Offline records | IndexedDB → sync engine → Appwrite on reconnection |
| **System** | **Admin** | Sync conflict alert | Appwrite --- conflict flag set, Admin dashboard badge updated |
| **System** | **All users** | Session expiry | Appwrite Auth --- redirect to login after 8 hours inactivity |
| **Admin** | **System** | Soft-delete record | Appwrite --- record marked isDeleted=true, removed from all active queries |
| **Admin** | **Operator** | Conflict resolution | Appwrite --- winning record version becomes canonical, all views update |

**10.2 Appwrite Realtime Subscription Map**

All three dashboards maintain live subscriptions to Appwrite. The following table shows which collections each role subscribes to and what events trigger a UI update.

|  |  |  |  |
|----|----|----|----|
| **User** | **Collection Subscribed** | **Trigger Event** | **UI Update** |
| **Admin** | donations (all events) | New / edited / deleted donation | Master dashboard total updates; event card totals refresh |
| **Admin** | events | Status change | Event card status badge updates; event list re-orders |
| **Admin** | sync_conflicts | New conflict added | Conflict badge appears in sidebar |
| **Operator** | donations (assigned events only) | New donation by another operator on same event | New row appears at top of donation list with green fade-in |
| **Operator** | events (assigned only) | Event status change by Admin | Status banner shown --- entry blocked if closed |
| **Family Member** | donations (own event only) | Any new donation on their event | Live total updates; new donor row appears in donor list |

**10.3 Key System Invariants**

These conditions must always hold true regardless of which flow is executing:

1.  Every donation record is associated with exactly one event ID. Cross-event data contamination is architecturally impossible.

2.  Every mutation (create, edit, delete, restore) produces exactly one immutable audit log entry. There are no mutations without a trail.

3.  Operator access to event data is enforced at the Appwrite collection permission level, not only at the UI level. URL manipulation does not bypass access control.

4.  Phone numbers are never returned in Family Member API responses. This is enforced via Appwrite field-level permissions, not client-side filtering.

5.  The sync engine processes records in chronological order. No record is skipped. Failed records are retried --- not silently dropped.

6.  Soft-deleted records are never shown in active donation lists but are always recoverable within 30 days and always present in the audit log.

7.  Appwrite Realtime subscriptions ensure that all active dashboards reflect the same state within seconds of any data mutation.

8.  All PDF receipts --- whether generated online or offline --- contain identical fields, formatting, and the same receipt number. There is no \'offline quality\' receipt.

*--- End of Document --- DMS System Flow Documentation v1.0 ---*
