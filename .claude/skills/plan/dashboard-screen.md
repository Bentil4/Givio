# Event Dashboard
Allow organizers to view all their events, access quick stats, and manage multiple weddings or funerals from a central location.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar
- Main Content Area (Positioned below the header):
  - Dashboard Overview Section
  - Event List Section

## Top Navigation Bar
- Application logo and name
- Create New Event button (prominent)
- Sync status indicator (online/offline with last sync time)
- User profile menu

## Dashboard Overview Section
- Welcome message with user's name
- Quick statistics cards:
  - Total active events count
  - Total donations across all events (aggregate)
  - Recent activity count (last 24 hours)
- Offline status notification (if applicable)

## Event List Section
- Event cards grid/list displaying:
  - Event name
  - Event type badge (Wedding/Funeral with context-appropriate styling)
  - Event date
  - Total donations count
  - Total donation amount
  - Quick action buttons (View Details, Add Donation)
  - Visual status indicator (Active/Completed)
- Empty state message (when no events exist) with call-to-action to create first event
- Filter options (All Events, Weddings, Funerals, Active, Completed)
- Sort options (Recent, Date, Name, Total Amount)
