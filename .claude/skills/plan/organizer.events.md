# Organizer Events
Event management interface for organizers to view and manage their assigned events.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar
- Main Content Area (Positioned below the header):
  - Page Header Section
  - Filters and Search Section
  - Events Display Section

## Top Navigation Bar
- Application logo and name
- Organizer role badge
- Main navigation links (My Events active)
- Sync status indicator
- Notifications icon
- User profile menu

## Page Header Section
- Page title "My Events" with count badge
- Create New Event button (primary, if permissions allow)
- View toggle (Table / Card / Timeline)
- Export My Events button

## Filters and Search Section
- Search bar (search by event name, location)
- Filter controls:
  - Event Type (All / Weddings / Funerals)
  - Status (All / Active / Completed / Archived)
  - Date range (Upcoming / Past / This Month / Custom)
- Sort options:
  - Event Date (Upcoming First / Past First)
  - Event Name (A-Z)
  - Total Donations (Highest First)
  - Recent Activity
- Clear Filters button

## Events Display Section

**Table View:**
- Table with alternating row colors
- Columns:
  - Event Name (clickable link)
  - Event Type (badge with icon)
  - Event Date (formatted)
  - Location (truncated)
  - Donations Count
  - Total Amount (formatted currency)
  - Status (badge)
  - Sync Status (icon)
  - Actions (dropdown)
- Actions per row:
  - View Details
  - Edit Event (if permissions allow)
  - Add Donation
  - View Donations
  - Generate Report
  - Share Access (if allowed)

**Card View:**
- Event cards in responsive grid (3-4 columns)
- Each card:
  - Event type color header (gold for wedding, slate for funeral)
  - Event name (prominent)
  - Event date and location
  - Statistics section:
    - Donations count
    - Total amount
  - Status badges (Active/Completed, Synced/Pending)
  - Action buttons at bottom:
    - View Details (link)
    - Add Donation (button)
  - Hover effect with shadow

**Timeline View:**
- Vertical timeline with events sorted by date
- Timeline markers for each event
- Event cards on timeline:
  - Date marker
  - Event details
  - Quick stats
  - Action links
- Visual separation between past and upcoming events

- Pagination controls (for table view)
- Load More button (for card/timeline view)
- Empty state (if no events):
  - Illustration
  - "You have no events yet"
  - Create Event CTA or Contact Admin message
