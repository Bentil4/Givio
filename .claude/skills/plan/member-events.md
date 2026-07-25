# Member Events View
View-only events interface for members to browse events they have access to.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar
- Main Content Area (Positioned below the header):
  - Page Header Section
  - View-Only Notice
  - Filters and Search Section
  - Events Display Section

## Top Navigation Bar
- Application logo and name
- Member role badge
- Main navigation links (Events active)
- Sync status indicator (read-only)
- User profile menu

## Page Header Section
- Page title "Events" with count badge
- Eye icon indicating view-only access
- No action buttons (no Create, Edit, or Delete options)

## View-Only Notice
- Info banner (light blue background):
  - "You have view-only access to these events"
  - "Contact your administrator for edit permissions"
  - Dismissible close button

## Filters and Search Section
- Search bar (search by event name, location)
- Filter controls:
  - Event Type (All / Weddings / Funerals)
  - Status (All / Active / Completed)
  - Date range (Upcoming / Past / This Month / Custom)
- Sort options:
  - Event Date (Upcoming First / Past First)
  - Event Name (A-Z)
  - Total Donations (Highest First)
- Clear Filters button

## Events Display Section

**Table View (read-only):**
- Table with alternating row colors
- Columns:
  - Event Name (clickable link to view details only)
  - Event Type (badge with icon)
  - Event Date (formatted)
  - Location
  - Donations Count
  - Total Amount (formatted currency)
  - Status (badge)
- No checkbox column (no bulk actions)
- No Actions column (no edit/delete options)
- Click row to view details (opens read-only detail page)
- Pagination controls

**Card View (read-only):**
- Event cards in responsive grid
- Each card:
  - Event type color header (gold/slate)
  - Event name
  - Event date and location
  - Statistics:
    - Donations count
    - Total amount
  - Status badge
  - View Details link only (no edit buttons)
  - Disabled appearance for action areas

- Empty state:
  - Illustration
  - "No events available to view"
  - "Contact your administrator if you need access to events"
