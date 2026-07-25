# Organizer Donations
Donations management interface for organizers to view, add, and edit donations for their assigned events.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar
- Main Content Area (Positioned below the header):
  - Page Header Section
  - Summary Section
  - Filters and Search Section
  - Donations Table Section

## Top Navigation Bar
- Application logo and name
- Organizer role badge
- Main navigation links (Donations active)
- Sync status indicator
- Notifications icon
- User profile menu

## Page Header Section
- Page title "My Donations" with count badge
- Add Donation button (primary, prominent)
- Event selector dropdown (filter to specific event or "All My Events")
- Export Donations button

## Summary Section
- Quick statistics cards:
  - Total Donations (count for all my events)
  - Total Amount (aggregate across my events)
  - Today's Donations (count and amount)
  - This Week (count and amount)
- Mini trend chart (last 7 days)

## Filters and Search Section
- Search bar (donor name, amount, event name)
- Filter controls:
  - Event filter (dropdown of my events)
  - Event Type (All / Weddings / Funerals)
  - Date range (Today / This Week / This Month / Custom)
  - Amount range (Min-Max)
  - Sync Status (All / Synced / Pending)
- Sort options:
  - Most Recent
  - Oldest First
  - Highest Amount
  - Lowest Amount
  - Donor Name (A-Z)
- Clear Filters button
- Active filters chips

## Donations Table Section
- Table with alternating row colors (light bg, white alternating)
- Columns:
  - Donor Name (bold, navy #1B3A57)
  - Event Name (clickable link, blue #2C5F8D)
  - Event Type (icon badge)
  - Amount (prominent, formatted, 16px bold)
  - Date & Time (12px, formatted)
  - Sync Status (icon: checkmark/clock)
  - Notes (truncated, expandable)
  - Actions (dropdown)
- Row data:
  - Donor name prominent
  - Event name as link
  - Event type badge (gold/slate colored)
  - Amount large and bold
  - Timestamp with relative time
  - Sync badge (green check or orange clock)
  - Notes preview with "..." if truncated
- Actions per row:
  - View Details
  - Edit Donation (if permissions allow)
  - Generate Receipt
  - View Event
  - Delete (if allowed, with confirmation)
- Row hover highlight
- Pagination:
  - Items per page (25/50/100)
  - Page navigation
  - Total count display ("Showing 1-25 of 156")
- Empty state:
  - Illustration
  - "No donations yet"
  - Add your first donation CTA
- Loading skeleton (while fetching data)
