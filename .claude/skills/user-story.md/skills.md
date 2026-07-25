Donation Management System  |  User Stories 

# **Donation Management System** 

Comprehensive User Stories 

_For Weddings & Funerals  |  Angular + Appwrite_ Version 1.0  |  March 2026 

## **1. Project Overview** 

This document outlines the comprehensive user stories for the Donation Management System — a web application built with Angular and Appwrite, designed to digitise and streamline the recording, tracking, and reporting of donations at weddings and funerals. 

The system supports three user roles (Admin, User/Operator, Family Member), online and offline operation with automatic data synchronisation, multi-event concurrency, donor receipt generation, and Excel export for reporting. 

## **2. User Roles Summary** 

|**Role**|**Responsibilities**|**Access Level**|
|---|---|---|
|Admin|Manages users, events, and all<br>system settings. Full visibility over all<br>data.|Full Access — all events, all reports,<br>all users|
|User (Operator)|Records donor details and donations<br>at the event venue on behalf of the<br>organiser.|Restricted to assigned events only|
|Family Member|Monitors donation progress for their<br>specific event. View only.|Read-only access to their own event<br>summary|



## **3. User Stories** 

### **3.1 Authentication & Login** 

|**Story ID**|**US-001**|
|---|---|
|**Role**|Admin|
|**User Story**|_As an Admin, I want to log into the system with secure credentials so that I can_|



Confidential  |  Page _1_ of _8_ 

Donation Management System  |  User Stories 

|**Acceptance**<br>**Criteria**|_manage events, users, and view all donation records across the platform._<br>•<br>Admin can log in with email and password.<br>•<br>Failed login shows an appropriate error message.<br>•<br>Session persists until manually logged out or token expires.<br>•<br>Admin is redirected to the main dashboard upon successful login.<br>•<br>Password is encrypted and never stored in plain text.|
|---|---|
|**Story ID**|**US-002**|
|**Role**|User (Operator)|
|**User Story**|_As a User (Operator), I want to log into the system so that I can be assigned to a_<br>_specific event and begin recording donations on behalf of the event organiser._|
|**Acceptance**<br>**Criteria**|•<br>User can log in with email and password.<br>•<br>Upon login, the user sees only the events they are assigned to.<br>•<br>Unauthorized access to unassigned events is blocked.<br>•<br>Session token is refreshed automatically while the user is active.|
|**Story ID**|**US-003**|
|**Role**|Family Member|
|**User Story**|_As a Family Member, I want to log in with a unique event code or credentials so that I_<br>_can monitor donations made to my specific event in real-time._|
|**Acceptance**<br>**Criteria**|•<br>Family member can log in using an event-specific code or credentials provided<br>by the Admin.<br>•<br>Family member can only view their own event's donation summary.<br>•<br>Family member cannot add, edit, or delete any donation records.<br>•<br>Family member sees a live-updating donation total for their event.|



### **3.2 User Management** 

|**Story ID**|**US-004**|
|---|---|
|**Role**|Admin|
|**User Story**|_As an Admin, I want to create and manage user accounts so that I can control who_<br>_has access to the system and what roles they hold._|
|**Acceptance**<br>**Criteria**|•<br>Admin can create new accounts with roles: Admin, User, or Family Member.<br>•<br>Admin can edit user details (name, email, role).<br>•<br>Admin can deactivate or delete a user account.|
||•<br>Users receive an email notification when their account is created.<br>•<br>Role changes take effect immediately on the user's next action.|



Confidential  |  Page _2_ of _8_ 

Donation Management System  |  User Stories 

|**Story ID**|**US-005**|
|---|---|
|**Role**|Admin|
|**User Story**|_As an Admin, I want to assign Users (Operators) to specific events so that only_<br>_authorised personnel can record donations for a given wedding or funeral._|
|**Acceptance**<br>**Criteria**|•<br>Admin can assign one or more users to a single event.<br>•<br>A user can be assigned to multiple concurrent events.|
||•<br>Assigned users can see their assigned events in their dashboard.|
||•<br>Unassigned users cannot access or record donations for an event.|



### **3.3 Event Management** 

|**Story ID**|**US-006**|
|---|---|
|**Role**|Admin|
|**User Story**|_As an Admin, I want to create a new event (wedding or funeral) so that donations can_<br>_be organised and tracked separately for each occasion._|
|**Acceptance**<br>**Criteria**|•<br>Admin can create an event with: event name, event type (Wedding/Funeral),<br>date, host/family name, and location.<br>•<br>Each event is assigned a unique system ID.<br>•<br>Admin can create multiple events of the same or different types simultaneously.<br>•<br>Event type is clearly labelled (Wedding or Funeral) throughout the system.<br>•<br>Admin can set an event to active or inactive status.|
|**Story ID**|**US-007**|
|**Role**|Admin|
|**User Story**|_As an Admin, I want to manage multiple concurrent events without conflicts so that_<br>_donations recorded for one event do not appear in another._|
|**Acceptance**<br>**Criteria**|•<br>Each donation is strictly linked to a single event via event ID.<br>•<br>Multiple events can run simultaneously with different operators.<br>•<br>Event dashboards are fully isolated — data does not overlap.<br>•<br>Admin can switch between events from a master dashboard without confusion.<br>•<br>The system handles simultaneous data entry from different users across<br>different events without data corruption.|



|**Story ID**|**US-008**|
|---|---|
|**Role**|Admin|
|**User Story**|_As an Admin, I want to edit or close an event so that completed occasions are_|



Confidential  |  Page _3_ of _8_ 

Donation Management System  |  User Stories 

||_archived and no longer accepting new entries._|
|---|---|
|**Acceptance**<br>**Criteria**|•<br>Admin can update event details at any time before it is closed.<br>•<br>Admin can mark an event as 'Closed', which prevents new donations from<br>being added.|
||•<br>Closed events remain visible for reporting purposes.<br>•<br>Admin can reopen a closed event if needed.|



### **3.4 Donation Recording** 

|**Story ID**|**US-009**|
|---|---|
|**Role**|User (Operator)|
|**User Story**|_As a User (Operator), I want to record a donor's details and donation so that a_<br>_complete and accurate log of contributions is maintained for the event._|
|**Acceptance**<br>**Criteria**|•<br>User can enter: Donor Name, Phone Number (optional), Donation Amount,<br>Type of Donation (Cash, Mobile Money, In-Kind), and 'Donated On Behalf Of'<br>field.<br>•<br>User can add a note or remark for special donations.<br>•<br>Each entry is timestamped automatically.<br>•<br>User can select which active event the donation belongs to.<br>•<br>A confirmation prompt appears before the record is saved.|
|**Story ID**|**US-010**|
|**Role**|User (Operator)|
|**User Story**|_As a User (Operator), I want to edit or correct a donation entry so that errors made_<br>_during data entry can be fixed promptly._|
|**Acceptance**<br>**Criteria**|•<br>User can edit any field of a donation record they created.<br>•<br>All edits are logged with a timestamp and the editor's name for accountability.<br>•<br>Edited records display a visual indicator showing they were modified.<br>•<br>Admin can view the full edit history of any record.|
|**Story ID**|**US-011**|
|**Role**|Admin|
|**User Story**|_As an Admin, I want to delete a donation record so that duplicate or erroneous entries_<br>_can be removed from the system._|
|**Acceptance**<br>**Criteria**|•<br>Only Admin can permanently delete a donation record.<br>•<br>A confirmation dialog is shown before deletion.<br>•<br>Deleted records are soft-deleted (archived) and recoverable within 30 days.<br>•<br>A deletion log is maintained for auditing purposes.|



Confidential  |  Page _4_ of _8_ 

Donation Management System  |  User Stories 

|**Story ID**|**US-012**|
|---|---|
|**Role**|User (Operator)|
|**User Story**|_As a User (Operator), I want to search and filter donors within an event so that I can_<br>_quickly find a specific donor's record._|
|**Acceptance**|•<br>User can search by donor name or phone number.|
|**Criteria**|•<br>User can filter by donation type (Cash, Mobile Money, In-Kind).|
||•<br>Search results update in real time as the user types.|
||•<br>An empty search state displays a helpful 'No results found' message.|



### **3.5 Offline Mode & Data Sync** 

|**Story ID**|**US-013**|
|---|---|
|**Role**|User (Operator)|
|**User Story**|_As a User (Operator), I want to continue recording donations even when there is no_<br>_internet connection so that event operations are not disrupted by connectivity issues._|
|**Acceptance**<br>**Criteria**|•<br>The app detects when the device is offline and displays a clear offline status<br>indicator.<br>•<br>All donation entries made offline are saved to local storage (IndexedDB/local<br>cache).<br>•<br>The UI remains fully functional in offline mode for creating and viewing records.<br>•<br>Data is automatically synced to Appwrite when internet connectivity is restored.<br>•<br>A sync status indicator shows how many records are pending sync.|
|**Story ID**|**US-014**|
|**Role**|User (Operator)|
|**User Story**|_As a User (Operator), I want the system to automatically sync my offline records_<br>_when I reconnect to the internet so that no donations are lost._|
|**Acceptance**<br>**Criteria**|•<br>Sync happens automatically in the background upon reconnection — no<br>manual action needed.<br>•<br>Conflicts (same record edited by two users) are flagged for Admin review.<br>•<br>User receives a notification confirming successful sync.<br>•<br>Sync failures are logged and surfaced to the user for manual retry.<br>•<br>Only unsynced records are uploaded during sync (no duplicates).|



### **3.6 Receipt Generation** 

Confidential  |  Page _5_ of _8_ 

Donation Management System  |  User Stories 

|**Story ID**|**US-015**|
|---|---|
|**Role**|User (Operator)|
|**User Story**|_As a User (Operator), I want to generate and print a receipt for a donor immediately_<br>_after recording their donation so that donors have a physical acknowledgement of_<br>_their contribution._|
|**Acceptance**<br>**Criteria**|•<br>A printable receipt is generated after each successful donation entry.<br>•<br>Receipt includes: Event Name, Event Type, Donor Name, Amount, Donation<br>Type, Donated On Behalf Of, Date & Time, and a unique Receipt Number.<br>•<br>Receipt can be printed directly from the browser/app.<br>•<br>Receipt can also be downloaded as a PDF.<br>•<br>Receipt layout is clean, professional, and branded with the event name.|



### **3.7 Reporting & Export** 

|**Story ID**|**US-016**|
|---|---|
|**Role**|Admin|
|**User Story**|_As an Admin, I want to view a real-time summary of all donations per event so that I_<br>_can monitor totals and contribution breakdowns at any time._|
|**Acceptance**<br>**Criteria**|•<br>Dashboard shows: total donation amount, number of donors, breakdown by<br>donation type, and a chronological list of donations.<br>•<br>Totals update in real time as new donations are added.<br>•<br>Admin can view summaries for any event from the master dashboard.<br>•<br>Summary can be filtered by date range and donation type.|
|**Story ID**|**US-017**|
|**Role**|Admin|
|**User Story**|_As an Admin, I want to export donation data for an event as an Excel file so that it can_<br>_be shared with family members, accountants, or stored for record-keeping._|
|**Acceptance**<br>**Criteria**|•<br>Admin can export the full donation list for any event as a .xlsx file.<br>•<br>Exported file includes all columns: Donor Name, Amount, Type, Donated On<br>Behalf Of, Date & Time, Recorded By.<br>•<br>Export includes a summary row showing totals at the bottom.<br>•<br>Export can be filtered by date range before downloading.<br>•<br>Family members can also download a read-only version of the export for their<br>event.|
|**Story ID**|**US-018**|
|**Role**|Family Member|



Confidential  |  Page _6_ of _8_ 

Donation Management System  |  User Stories 

|**User Story**|_As a Family Member, I want to view a live donation summary for my event so that I_<br>_can stay informed of contributions being made during the occasion._|
|---|---|
|**Acceptance**<br>**Criteria**|•<br>Family member sees a real-time total donation amount for their event.<br>•<br>Family member can see a list of donors and amounts without confidential<br>operator details.|
||•<br>Dashboard auto-refreshes without requiring a page reload.<br>•<br>Family member can access the summary on both mobile and desktop.|



### **3.8 Multi-Device Support** 

|**Story ID**|**US-019**|
|---|---|
|**Role**|User (Operator)|
|**User Story**|_As a User (Operator), I want to use the system on both a mobile phone and a_<br>_desktop/laptop so that I can enter donations flexibly from any device available at the_<br>_event venue._|
|**Acceptance**<br>**Criteria**|•<br>The Angular application is fully responsive and works on screens of all sizes.<br>•<br>All core features (add donation, view summary, print receipt) function correctly<br>on mobile browsers.|
||•<br>Forms are easy to use on a touchscreen without zooming.<br>•<br>Desktop layout offers a more expanded view with additional columns visible.|



### **3.9 Security** 

|**Story ID**|**US-020**|
|---|---|
|**Role**|Admin|
|**User Story**|_As an Admin, I want all sensitive donation data to be protected so that donor_<br>_information is not exposed to unauthorised parties._|
|**Acceptance**<br>**Criteria**|•<br>All data in transit is encrypted via HTTPS.<br>•<br>Appwrite role-based access control (RBAC) restricts data access by user role.<br>•<br>Session tokens expire after a configurable period of inactivity.<br>•<br>Admin receives an alert for suspicious login attempts.<br>•<br>Personal donor data (phone numbers) is only visible to Admin and assigned<br>operators.|



Confidential  |  Page _7_ of _8_ 

Donation Management System  |  User Stories 

## **4. User Story Summary** 

|**Story ID**|**Section**|**Role**|**Key Capability**|
|---|---|---|---|
|US-001|Authentication|Admin|Secure login|
|US-002|Authentication|User|Role-based login|
|US-003|Authentication|Family Member|Event-code login|
|US-004|User Management|Admin|Create & manage users|
|US-005|User Management|Admin|Assign users to events|
|US-006|Event Management|Admin|Create events|
|US-007|Event Management|Admin|Concurrent event isolation|
|US-008|Event Management|Admin|Edit & close events|
|US-009|Donation Recording|User|Record donations|
|US-010|Donation Recording|User|Edit donation entries|
|US-011|Donation Recording|Admin|Delete records|
|US-012|Donation Recording|User|Search & filter donors|
|US-013|Offline Mode|User|Record donations offline|
|US-014|Offline Mode|User|Auto sync on reconnect|
|US-015|Receipts|User|Print donor receipts|
|US-016|Reporting|Admin|Real-time donation summary|
|US-017|Reporting|Admin|Export to Excel|
|US-018|Reporting|Family Member|Live event summary|
|US-019|Multi-Device|User|Mobile & desktop support|
|US-020|Security|Admin|Data protection & RBAC|


