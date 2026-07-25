# Sync Status
Provide transparency about offline data synchronization status and manage local/cloud data.

Layout Hierarchy:
- Header (Full-width):
  - Page Navigation Bar
- Main Content Area (Positioned below the header):
  - Connection Status Section
  - Pending Changes Section
  - Sync History Section

## Page Navigation Bar
- Back to Dashboard link
- Page title "Sync Status"
- Real-time connection indicator (Online/Offline with icon)
- Last sync timestamp

## Connection Status Section
- Large status indicator card:
  - Connection status badge (Online/Offline with color coding)
  - Status message:
    - If online: "Connected • All data synced"
    - If offline: "Working offline • X items pending sync"
  - Last successful sync timestamp (relative time, e.g., "Synced 2 minutes ago")
  - Network quality indicator (if online: Good/Fair/Poor)
- Manual sync controls:
  - Sync Now button (primary, triggers immediate sync if online)
  - Disabled state message if offline: "Will sync automatically when connection returns"
- Data storage information:
  - Local storage usage display
  - Cloud storage status
  - Available offline capacity indicator

## Pending Changes Section
- Section header "Waiting to Sync" (with count badge)
- Pending items list grouped by type:
  - New Donations (count and details):
    - Event name
    - Donor name
    - Amount
    - Timestamp created
    - "Pending" badge
  - Edited Donations (count and details):
    - Event name
    - Donor name
    - Changes made
    - "Modified" badge
  - New Events (count and details):
    - Event name
    - Creation date
    - "Pending" badge
  - Edited Events (count and details):
    - Event name
    - Changes made
    - "Modified" badge
- Empty state message (when all synced): "All changes synced successfully"
- Conflict resolution section (if applicable):
  - Items with sync conflicts
  - Conflict type (server version differs)
  - Resolution options (Keep Local / Use Server / Manual Merge)

## Sync History Section
- Section header "Recent Sync Activity"
- Sync log entries showing:
  - Sync timestamp
  - Items synced count
  - Sync status (Success/Partial/Failed)
  - Duration
  - Error messages (if sync failed)
- Filter options:
  - All activity
  - Successful syncs only
  - Failed syncs only
  - Today / Last 7 Days / Last 30 Days
- Retry failed sync button (for failed entries)
