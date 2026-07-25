# Event Reports
Allow organizers to generate, customize, and preview various donation reports for accounting and thank-you communications.

Layout Hierarchy:
- Header (Full-width):
  - Page Navigation Bar
- Main Content Area (Positioned below the header):
  - Report Configuration Section
  - Report Preview Section

## Page Navigation Bar
- Back to Event Detail link
- Page title "Reports"
- Current event name display

## Report Configuration Section
- Report type selector:
  - Full Donor Report (all donors with amounts and dates)
  - Summary Report (totals and statistics only)
  - Thank You List (donor names formatted for cards/letters)
  - Accounting Export (detailed with timestamps and transaction IDs)
- Date range selector:
  - All Time (default)
  - Custom Date Range (with date pickers)
  - Specific dates (Event Day, Last Week, Last Month)
- Content options (checkboxes):
  - Include donor names
  - Include donation amounts
  - Include timestamps
  - Include notes/remarks
  - Include event details header
- Sorting preference:
  - By Date (Recent First/Oldest First)
  - By Amount (Highest First/Lowest First)
  - By Donor Name (A-Z/Z-A)
- Format selection:
  - PDF (for printing and sharing)
  - CSV (for spreadsheets and accounting software)
  - Excel (formatted spreadsheet)
- Generate Report button (prominent, primary action)

## Report Preview Section
- Live preview panel showing formatted report based on selected options
- Preview displays:
  - Report header (Event name, type, date range)
  - Sample data rows (first 10 entries preview)
  - Summary statistics (total donations, total amount, average)
  - Footer (generated date, organizer information)
- Preview format matches selected export type styling
- Refresh preview button (if configuration changes)

## Generated Reports Actions
- Download/Export button (prominent, becomes available after generation)
- Share report options:
  - Copy shareable link
  - Email report
  - Print report
- Save report configuration as template (for recurring reports)
- Clear/Reset configuration button
