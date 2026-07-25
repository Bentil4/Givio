# Donation List
Display comprehensive list of all donations for a specific event with search, filter, and sorting capabilities.

Layout Hierarchy:
- Header (Full-width):
  - Page Navigation Bar
- Main Content Area (Positioned below the header):
  - List Controls Section
  - Donations Table/List Section

## Page Navigation Bar
- Back to Event Detail link
- Event name display
- Sync status indicator
- Add Donation button (quick access)

## List Controls Section
- Search bar (search by donor name)
- Filter options:
  - Date range selector
  - Amount range filter
  - Sync status filter (All, Synced, Pending Sync)
- Sort options dropdown:
  - Most Recent
  - Oldest First
  - Highest Amount
  - Lowest Amount
  - Donor Name (A-Z)
- Total count display ("Showing X of Y donations")
- Bulk actions (when items selected):
  - Export selected
  - Delete selected (with confirmation)

## Donations Table/List Section
- Table/card list displaying donation entries:
  - Donor name (prominent)
  - Donation amount (prominent, with currency)
  - Date and time (formatted)
  - Sync status badge (Synced/Pending with visual indicator)
  - Notes preview (if any, truncated)
  - Action menu for each entry (Edit, Delete, Share Receipt)
- Row selection checkboxes (for bulk actions)
- Empty state message (when no donations match filters) with clear call-to-action
- Summary footer:
  - Total donations count
  - Total amount sum (for filtered/all results)
  - Average donation amount

## Pagination/Loading Section
- Display all donations without pagination (complete list view)
- Scroll to top button (appears when scrolled down)
