# Admin Settings
Comprehensive system configuration interface for administrators to manage users, system preferences, security, and application settings.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar
- Main Content Area (Positioned below the header):
  - Settings Navigation Sidebar
  - Settings Content Area

## Top Navigation Bar
- Application logo and name
- Admin role badge
- Main navigation links (Settings active)
- Sync status indicator
- Notifications icon
- User profile menu

## Settings Navigation Sidebar
- Settings sections list:
  - User Management (selected by default)
  - System Preferences
  - Security & Privacy
  - Event Settings
  - Notification Settings
  - Backup & Sync
  - Integrations
  - About & Support
- Each section with icon and label
- Active section highlighted

## Settings Content Area

### User Management Section
- Page header "User Management"
- Add New User button (primary)

- Users table:
  - Column headers:
    - Name (with avatar)
    - Email
    - Role (Admin / Organizer / Member)
    - Status (Active / Inactive)
    - Events Assigned (count for organizers)
    - Last Login
    - Actions
  - User rows displaying:
    - User avatar and full name
    - Email address
    - Role badge (color-coded by role)
    - Status indicator (green dot for active)
    - Events count (link to view events)
    - Last login timestamp
    - Actions dropdown:
      - Edit User
      - Change Role
      - Reset Password
      - View Activity Log
      - Deactivate/Activate
      - Delete User (with confirmation)
  - Search and filter users
  - Role filter dropdown
  - Status filter (Active/Inactive/All)

- User permissions matrix:
  - Table showing permissions by role
  - Features vs Roles grid
  - Checkboxes showing what each role can do

### System Preferences Section
- Page header "System Preferences"

- General Settings:
  - Application name input
  - Default language selector
  - Default currency selector
  - Date format preference (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD)
  - Time format (12-hour / 24-hour)
  - Timezone selector

- Display Settings:
  - Items per page default (dropdown: 10/25/50/100)
  - Default view mode (Table / Card / List)
  - Enable animations toggle
  - Compact mode toggle

- Event Defaults:
  - Default event type (Wedding / Funeral)
  - Default privacy settings (Allow verification / Show amounts)
  - Default donation amount suggestions (comma-separated values)

### Security & Privacy Section
- Page header "Security & Privacy"

- Authentication Settings:
  - Password requirements:
    - Minimum length slider (8-16 characters)
    - Require uppercase toggle
    - Require numbers toggle
    - Require special characters toggle
  - Session timeout (dropdown: 15min/30min/1hr/4hr/8hr/Never)
  - Two-factor authentication (Enable/Disable system-wide)
  - Login attempt limits (number input)

- Privacy Settings:
  - Data retention period (dropdown: 1yr/2yr/5yr/Indefinite)
  - Allow anonymous donations toggle
  - Donor data visibility (Who can see donor names)
  - Export controls (Who can export data)

- Audit Log:
  - Recent security events table:
    - Timestamp
    - Event type (Login/Logout/Settings Change/Data Export)
    - User
    - IP Address
    - Status (Success/Failed)
  - View Full Audit Log link

### Event Settings Section
- Page header "Event Settings"

- Event Type Configuration:
  - Wedding settings card:
    - Primary color picker (default: #C9A84C gold)
    - Accent color picker
    - Default terminology customization
    - Icon selection
  - Funeral settings card:
    - Primary color picker (default: #607D8B slate)
    - Accent color picker
    - Default terminology customization
    - Icon selection

- Event Workflow Settings:
  - Auto-archive completed events toggle
  - Archive after X days (number input)
  - Require event approval toggle (events need admin approval)
  - Allow multiple organizers per event toggle

### Notification Settings Section
- Page header "Notification Settings"

- Email Notifications:
  - Notification triggers checkboxes:
    - New event created
    - Donation recorded
    - Report generated
    - Sync failures
    - Low storage warnings
    - User added/removed
  - Email recipients management
  - Email template customization

- System Notifications:
  - In-app notification preferences
  - Notification sound toggle
  - Desktop notifications toggle
  - Notification frequency (Immediate / Batched hourly / Daily digest)

### Backup & Sync Section
- Page header "Backup & Sync"

- Backup Settings:
  - Automatic backup toggle
  - Backup frequency (Daily / Weekly / Monthly)
  - Backup time selector
  - Backup location (Cloud / Local / Both)
  - Last backup timestamp
  - Backup size display
  - Backup Now button (manual trigger)
  - Restore from Backup button

- Sync Settings:
  - Sync frequency (Real-time / Every 5min / Every 15min / Manual)
  - Sync on WiFi only toggle (for mobile)
  - Sync conflict resolution strategy:
    - Server wins
    - Client wins
    - Manual resolution
  - Force Sync All Devices button
  - View Sync Status link (opens sync status screen)

- Storage Management:
  - Storage usage chart (visual representation)
  - Database size
  - Media files size
  - Backup files size
  - Available space
  - Clean up old data button

### Integrations Section
- Page header "Integrations"

- Available Integrations:
  - Integration cards:
    - WhatsApp (for sharing links)
      - Status badge (Connected / Not Connected)
      - Configure button
    - Email Service (SendGrid/SMTP)
      - Status badge
      - API key input
      - Test Connection button
    - Cloud Storage (Google Drive/Dropbox)
      - Status badge
      - Authorize button
    - Accounting Software (QuickBooks/Xero)
      - Status badge
      - API credentials inputs
      - Sync Now button
  - Each card with:
    - Integration logo
    - Description
    - Connection status
    - Configuration button

### About & Support Section
- Page header "About & Support"

- System Information:
  - Application version
  - Build number
  - Last updated date
  - License type
  - System status (All systems operational)

- Support Resources:
  - Documentation link
  - Video tutorials link
  - FAQ link
  - Contact support button
  - Report bug button
  - Feature request button

- Legal:
  - Terms of Service link
  - Privacy Policy link
  - Data Processing Agreement link
  - Open Source Licenses link

- Save Changes button (floating, appears on any modification)
- Discard Changes button
- Success/Error messages area
