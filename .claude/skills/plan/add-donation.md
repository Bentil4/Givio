# Add Donation
Enable organizers to quickly record a new donation with donor information and amount, optimized for rapid entry during active events.

Layout Hierarchy:
- Header (Full-width):
  - Page Navigation Bar
- Main Content Area (Positioned below the header):
  - Form Container (centered, simplified layout for quick entry)

## Page Navigation Bar
- Back to Event Detail link
- Page title "Add Donation"
- Current event name display
- Offline status indicator (prominent when offline)

## Donation Entry Form
- Donor name input field (required, large, autofocus)
- Donation amount input field (required, large, numeric keyboard on mobile)
- Currency display (auto-detected from event settings)
- Donation date/time selector (defaults to current time, editable)
- Notes text area (optional, for special acknowledgments or context)
- Form actions:
  - Save Donation button (prominent, primary style with clear "Saved" confirmation state)
  - Save & Add Another button (secondary, for rapid consecutive entries)
  - Cancel button (tertiary)
- Real-time validation feedback
- Offline save confirmation message "Donation saved locally. Will sync when connection returns."

## Recent Entries Preview
- Mini list showing last 3 donations just added (for quick verification)
- Each entry displays:
  - Donor name
  - Amount
  - Sync status badge
- Visual confirmation animation when new donation saves successfully

## Quick Stats Display
- Running total for current event (updates in real-time as donations are added)
- Donation count for today
- Visual progress indicator (if event has donation goals)
