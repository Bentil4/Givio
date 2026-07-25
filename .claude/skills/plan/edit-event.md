# Edit Event
Allow organizers to modify existing event details, change settings, or update event information.

Layout Hierarchy:
- Header (Full-width):
  - Page Navigation Bar
- Main Content Area (Positioned below the header):
  - Form Container (centered, card-style layout)

## Page Navigation Bar
- Back to Event Detail link
- Page title "Edit Event"
- Current event name display
- Sync status indicator

## Event Information Form
- Event name input field (pre-filled, required)
- Event type display (Wedding/Funeral - shown as badge, non-editable to prevent data confusion)
- Event date picker (pre-filled, required)
- Event location input field (pre-filled, optional)
- Event description text area (pre-filled, optional)
- Event status selector:
  - Active
  - Completed
  - Archived
- Privacy settings section:
  - Allow donor verification toggle (pre-filled)
  - Show donation amounts publicly toggle (pre-filled)
- Form actions:
  - Save Changes button (primary, prominent)
  - Cancel button (secondary)
  - Delete Event button (destructive, with confirmation modal trigger)
- Validation messages area
- Last modified timestamp display
- Offline indicator with message "Changes will be saved locally and synced when online"
