# Admin Events Management
Comprehensive event management interface for administrators to view, create, edit, and manage all events across the system.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar
- Main Content Area (Positioned below the header):
  - Page Header Section
  - Filters and Search Section
  - Events Table Section

## Top Navigation Bar
- Application logo and name
- Admin role badge
- Main navigation links (Events active)
- Sync status indicator
- Notifications icon
- User profile menu

## Page Header Section
- Page title "All Events" with count badge
- Create New Event button (primary, prominent)
- Bulk actions dropdown (when events selected):
  - Export Selected
  - Archive Selected
  - Delete Selected (with confirmation)
- View toggle (Table / Card / Calendar)

## Filters and Search Section
- Search bar (search by event name, location, organizer)
- Filter controls:
  - Event Type filter (All / Weddings / Funerals)
  - Status filter (All / Active / Completed / Archived)
  - Date range selector (This Week / This Month / Custom Range)
  - Organizer filter (dropdown of all organizers)
- Sort options:
  - Recent First
  - Oldest First
  - Event Date (Upcoming First)
  - Event Date (Past First)
  - Event Name (A-Z)
  - Total Donations (Highest First)
- Clear All Filters button
- Active filters display (removable chips)

## Events Table Section
- Table with alternating row colors (as per spec)
- Column headers:
  - Checkbox (select all)
  - Event Name (sortable, clickable link)
  - Event Type (badge: Wedding/Funeral with color)
  - Event Date (sortable, formatted date)
  - Location (truncated with tooltip)
  - Organizer Name (clickable link to organizer profile)
  - Donations Count (sortable)
  - Total Amount (sortable, formatted currency)
  - Status (badge: Active/Completed/Archived)
  - Sync Status (icon: Synced/Pending)
  - Actions (dropdown menu)
- Table rows showing event data:
  - Event name with type icon
  - Date formatted (e.g., "March 16, 2026")
  - Organizer with avatar
  - Donation stats with visual indicators
  - Status badges with color coding
- Actions dropdown per row:
  - View Details
  - Edit Event
  - Add Donation
  - Generate Report
  - Share Access
  - Archive Event
  - Delete Event (destructive, with confirmation)
- Pagination controls:
  - Items per page selector (10/25/50/100)
  - Page numbers
  - Previous/Next buttons
  - Total count display
- Empty state (when no events match filters):
  - Illustration
  - "No events found" message
  - Clear filters suggestion or Create Event CTA
