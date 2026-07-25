# Event Detail
Provide organizers with comprehensive overview of a specific event, including donation summary, recent activity, and quick access to key actions.

Layout Hierarchy:
- Header (Full-width):
  - Page Navigation Bar
- Main Content Area (Positioned below the header):
  - Event Header Section
  - Statistics Overview Section
  - Recent Donations Section
  - Quick Actions Section

## Page Navigation Bar
- Back to Dashboard link
- Event name display
- Sync status indicator
- Event actions dropdown menu (Edit Event, Archive Event, Delete Event)

## Event Header Section
- Event name (large, prominent)
- Event type badge (Wedding/Funeral with context-appropriate styling and color)
- Event date and location
- Event status indicator (Active/Completed)

## Statistics Overview Section
- Summary cards displaying:
  - Total donations amount (large, prominent number with currency)
  - Total number of donors
  - Average donation amount
  - Last donation timestamp
- Visual chart showing donation timeline (simple bar or line chart)
- Time period filter (Today, Last 7 Days, All Time)

## Recent Donations Section
- Section title "Recent Donations"
- Donation entries list displaying:
  - Donor name
  - Donation amount
  - Timestamp (relative time, e.g., "2 hours ago")
  - Offline sync badge (if applicable, showing "Synced" or "Pending")
- "View All Donations" link to full donation list
- Empty state message (when no donations exist) with encouragement to add first donation

## Quick Actions Section
- Primary action buttons:
  - Add Donation button (prominent, primary style)
  - View All Donations button
  - Generate Report button
- Secondary actions:
  - Share Donor Verification Link button
  - Export Data button
