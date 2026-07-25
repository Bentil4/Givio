# Edit Donation
Enable organizers to correct or update existing donation records with edit history tracking.

Layout Hierarchy:
- Header (Full-width):
  - Page Navigation Bar
- Main Content Area (Positioned below the header):
  - Form Container (centered, focused layout)

## Page Navigation Bar
- Back to Donation List link
- Page title "Edit Donation"
- Current event name display
- Offline status indicator

## Donation Edit Form
- Donor name input field (pre-filled, required, large)
- Donation amount input field (pre-filled, required, large, numeric)
- Currency display (read-only, from event settings)
- Donation date/time selector (pre-filled, editable)
- Notes text area (pre-filled, optional)
- Edit reason text area (optional, for tracking why changes were made)
- Original values display (read-only section showing):
  - Original donor name
  - Original amount
  - Original timestamp
  - Last modified date and time
- Form actions:
  - Save Changes button (prominent, primary style)
  - Cancel button (secondary)
  - Delete Donation button (destructive, with confirmation)
- Validation feedback
- Offline save message "Changes saved locally. Will sync when connection returns."

## Change History Section
- List of previous edits (if any):
  - Modified field
  - Previous value
  - New value
  - Edit timestamp
  - Edit reason (if provided)
