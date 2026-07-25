# Share Access
Enable organizers to delegate donation entry access to trusted family members or helpers.

Layout Hierarchy:
- Header (Full-width):
  - Page Navigation Bar
- Main Content Area (Positioned below the header):
  - Access Management Section
  - Active Collaborators Section

## Page Navigation Bar
- Back to Event Detail link
- Page title "Share Access"
- Current event name display
- Sync status indicator

## Access Management Section
- Section header "Grant Access to Helpers"
- Access link generation:
  - Access level selector:
    - View Only (can see donations, cannot add/edit)
    - Add Donations (can add new donations, cannot edit existing)
    - Full Access (can add, edit, delete donations)
  - Access duration options:
    - 24 Hours
    - 3 Days
    - 1 Week
    - Until Event Ends
    - Unlimited (manual revocation required)
  - Generate Access Link button (primary)
- Generated link display area:
  - Shareable URL (with copy button)
  - QR code (for easy mobile sharing)
  - Access level and expiration display
  - Share via options:
    - Copy link button
    - Share via WhatsApp button
    - Share via Email button
    - Share via SMS button
- Security notice:
  - Warning message about sharing links responsibly
  - Reminder that links allow donation access without login

## Active Collaborators Section
- Section header "Active Access Links"
- Access links list showing:
  - Link identifier (shortened link or alias)
  - Access level badge
  - Creation date
  - Expiration date/time
  - Usage count (number of times accessed)
  - Last accessed timestamp
  - Action buttons:
    - Revoke Access button (immediate termination)
    - Extend Duration button
    - View Activity button (shows who accessed when)
- Empty state message (when no active links) with encouragement to share access
- Revoked links history (collapsed section):
  - Previously active links
  - Revocation date
  - Usage statistics before revocation
