# Member Dashboard
Dashboard for members with view-only access to view events and donations they have permissions to see.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar with Member badge
- Main Content Area (Positioned below the header):
  - Overview Section
  - Events Overview Section
  - Recent Donations Section

## Top Navigation Bar
- Application logo and name
- Member role badge (view-only indicator)
- Main navigation links:
  - Dashboard (active)
  - Events (view-only)
  - Donations (view-only)
- Sync status indicator (read-only sync info)
- User profile menu

## Overview Section
- View-only notice:
  - Info banner explaining "You have view-only access"
  - Contact admin message for permission requests
- Summary cards (read-only):
  - Events I Can View (count)
  - Total Donations (visible events)
  - Recent Activity (last 7 days)
- Each card with:
  - Eye icon indicating view-only
  - Number/amount display
  - Descriptive label

## Events Overview Section
- Section header "Events" with count
- Event cards (read-only display):
  - Event name
  - Event type badge (Wedding/Funeral)
  - Event date and location
  - Quick stats:
    - Donations count
    - Total amount (formatted)
  - Status badge (Active/Completed)
  - View Details link (no edit options)
- Maximum 6 cards shown
- View All Events link
- Empty state:
  - "No events visible to you"
  - Contact admin message

## Recent Donations Section
- Section header "Recent Donations" with event filter
- Donations display (read-only list):
  - Donor name
  - Event name with type icon
  - Amount (formatted, prominent)
  - Timestamp (relative time)
- Last 10 donations shown
- View All Donations link
- Note: No edit, delete, or add actions available
- Empty state:
  - "No donations to display"
  - Message about view-only access
