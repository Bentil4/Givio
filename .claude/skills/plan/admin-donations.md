# Admin Donations Management
Comprehensive donations management interface for administrators to view, track, and manage all donations across all events system-wide.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar
- Main Content Area (Positioned below the header):
  - Page Header Section
  - Summary Statistics Section
  - Filters and Search Section
  - Donations Table Section

## Top Navigation Bar
- Application logo and name
- Admin role badge
- Main navigation links (Donations active)
- Sync status indicator
- Notifications icon
- User profile menu

## Page Header Section
- Page title "All Donations" with count badge
- Add Donation button (primary)
- Bulk actions dropdown (when donations selected):
  - Export Selected
  - Generate Receipt
  - Delete Selected (with confirmation)
- Quick stats display:
  - Total donations count (all time)
  - Total amount (all time, formatted currency)
  - Average donation amount

## Summary Statistics Section
- Statistics cards row:
  - Today's Donations (count and amount)
  - This Week's Donations (count and amount)
  - This Month's Donations (count and amount)
  - Pending Sync (count with warning if > 0)
- Mini chart showing donation trends (last 30 days)

## Filters and Search Section
- Search bar (search by donor name, event name, amount range)
- Filter controls:
  - Event filter (dropdown of all events)
  - Event Type filter (All / Weddings / Funerals)
  - Date range selector (Today / This Week / This Month / Custom Range)
  - Amount range filter (Min-Max sliders)
  - Sync Status filter (All / Synced / Pending Sync)
  - Organizer filter (dropdown of all organizers)
- Sort options:
  - Most Recent
  - Oldest First
  - Highest Amount
  - Lowest Amount
  - Donor Name (A-Z)
  - Event Date
- Clear All Filters button
- Active filters display (removable chips)
- Export All Results button (CSV/Excel)

## Donations Table Section
- Table with alternating row colors (as per spec: light bg, white alternating)
- Column headers with sort icons:
  - Checkbox (select all)
  - Donor Name (sortable, bold text)
  - Event Name (sortable, clickable link)
  - Event Type (badge icon)
  - Amount (sortable, prominent, formatted currency)
  - Date & Time (sortable, formatted)
  - Organizer (sortable, with avatar)
  - Sync Status (icon badge: Synced/Pending)
  - Notes (truncated with expand icon)
  - Actions (dropdown menu)
- Table rows displaying donation data:
  - Donor name (16px body text, navy color)
  - Event name as link (blue color on hover)
  - Event type badge (Wedding: gold accent #C9A84C / Funeral: slate accent #607D8B)
  - Amount (bold, large, formatted with currency symbol)
  - Timestamp (12px, relative time with full date tooltip)
  - Organizer name with small avatar
  - Sync status icon (checkmark for synced, clock for pending)
  - Notes preview (truncated, click to expand)
- Actions dropdown per row:
  - View Details
  - Edit Donation
  - Generate Receipt
  - View Event
  - View Donor History (all donations by this donor)
  - Delete Donation (destructive, with confirmation)
- Row hover effect (slight highlight)
- Pagination controls:
  - Items per page selector (25/50/100/200)
  - Page numbers with ellipsis
  - Jump to page input
  - Previous/Next buttons
  - Total count and current range display ("Showing 1-25 of 342")
- Empty state (when no donations match filters):
  - Illustration
  - "No donations found" message
  - Clear filters suggestion or Add Donation CTA
- Loading state (skeleton rows while fetching)
