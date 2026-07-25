# Member Donations View
View-only donations interface for members to browse donation records they have access to.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar
- Main Content Area (Positioned below the header):
  - Page Header Section
  - View-Only Notice
  - Summary Section (read-only)
  - Filters and Search Section
  - Donations Table Section (read-only)

## Top Navigation Bar
- Application logo and name
- Member role badge
- Main navigation links (Donations active)
- Sync status indicator (read-only)
- User profile menu

## Page Header Section
- Page title "Donations" with count badge
- Eye icon indicating view-only access
- No Add Donation button (read-only access)

## View-Only Notice
- Info banner (light blue background):
  - "You have view-only access to donation records"
  - "You cannot add, edit, or delete donations"
  - Dismissible close button

## Summary Section (read-only)
- Statistics cards:
  - Total Donations (count)
  - Total Amount (aggregate)
  - This Week (count and amount)
  - This Month (count and amount)
- Cards styled as read-only (lighter colors, eye icons)
- No interactive elements

## Filters and Search Section
- Search bar (donor name, event name, amount)
- Filter controls:
  - Event filter (dropdown of visible events)
  - Event Type (All / Weddings / Funerals)
  - Date range (Today / This Week / This Month / Custom)
  - Amount range (Min-Max sliders)
- Sort options:
  - Most Recent
  - Oldest First
  - Highest Amount
  - Lowest Amount
  - Donor Name (A-Z)
- Clear Filters button
- Export button (if allowed - may generate read-only exports)

## Donations Table Section (read-only)
- Table with alternating row colors
- No checkbox column (no bulk actions available)
- Columns:
  - Donor Name (bold, navy)
  - Event Name (as text, may link to view-only event detail)
  - Event Type (badge)
  - Amount (prominent, formatted)
  - Date & Time (formatted)
  - Notes (truncated, read-only)
- No Actions column (no edit/delete options)
- Row click may open read-only detail view
- Row hover shows different cursor (not pointer, indicating view-only)
- Pagination:
  - Items per page selector
  - Page navigation
  - Total count display
- Empty state:
  - Illustration
  - "No donations available to view"
  - Contact admin message
- Loading skeleton (while fetching)

## Read-Only Indicators
- Greyed-out appearance for normally interactive elements
- Eye icon in page title and cards
- Tooltip on hover: "View-only access - contact admin for permissions"
- No delete buttons or destructive actions visible
- No form inputs or edit controls
