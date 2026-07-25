# Organizer Dashboard
Dashboard for event organizers with moderate entry permissions to manage their assigned events and donations.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar with Organizer badge
- Main Content Area (Positioned below the header):
  - Overview Statistics Section
  - My Events Section
  - Recent Donations Section
  - Quick Actions Section

## Top Navigation Bar
- Application logo and name
- Organizer role badge
- Main navigation links:
  - Dashboard (active)
  - My Events
  - Donations
  - Reports
- Sync status indicator (online/offline)
- Notifications icon with badge count
- User profile menu

## Overview Statistics Section
- Summary cards displaying:
  - My Events count (events assigned to this organizer)
  - Active Events count (currently ongoing)
  - Total Donations (across all my events)
  - Today's Donations (count and amount)
  - Pending Sync Items (offline data waiting)
- Each card with:
  - Large number/amount
  - Descriptive label
  - Icon representing metric
  - Navy/Blue color scheme

## My Events Section
- Section header "My Events" with count badge
- Create New Event button (if permissions allow)
- Event cards grid (3 columns):
  - Each card showing:
    - Event name (prominent)
    - Event type badge (Wedding: gold / Funeral: slate)
    - Event date (formatted)
    - Location (truncated)
    - Quick stats:
      - Donations count
      - Total amount (formatted currency)
    - Status badge (Active/Completed)
    - Sync status indicator
    - Quick action buttons:
      - View Details
      - Add Donation
      - Generate Report
  - Card hover effect (slight elevation)
- View All Events link
- Empty state (if no events):
  - Illustration
  - "No events assigned yet"
  - Contact admin message

## Recent Donations Section
- Section header "Recent Donations" with filter (All My Events / Select Event)
- Donations list (table or cards):
  - Donor name
  - Amount (prominent, formatted)
  - Event name (with type icon)
  - Timestamp (relative time)
  - Sync status badge
- Last 10 donations shown
- View All Donations link

## Quick Actions Section
- Action buttons grid:
  - Add Donation (primary, prominent)
  - Create Event (if allowed)
  - Generate Report
  - View Sync Status
- Each button with icon and clear label
