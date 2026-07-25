# Admin Dashboard
Central hub for system administrators with full access to all events, users, donations, and system settings.

Layout Hierarchy:
- Header (Full-width):
  - Top Navigation Bar with Admin badge
- Main Content Area (Positioned below the header):
  - Overview Statistics Section
  - Recent Activity Section
  - Quick Actions Section
  - System Health Section

## Top Navigation Bar
- Application logo and name "Donation Management System"
- Admin role badge (prominent)
- Main navigation links:
  - Dashboard (active)
  - Events
  - Donations
  - Reports
  - Settings
- Sync status indicator (online/offline with last sync time)
- Notifications icon with badge count
- User profile menu with logout

## Overview Statistics Section
- Summary cards grid displaying:
  - Total Events count (all events in system)
  - Total Donations amount (system-wide aggregate)
  - Total Users count (all admin/organizer/member users)
  - Active Events count (currently ongoing)
  - Recent Donations count (last 24 hours)
  - Pending Sync Items (offline data waiting)
- Each card with:
  - Large number display
  - Descriptive label
  - Change indicator (trend up/down)
  - Color coding using navy/blue palette

## Recent Activity Section
- Activity feed showing:
  - New events created (with creator name)
  - New donations recorded (with event and organizer)
  - User access changes (new users, role changes)
  - Report generations (who, what, when)
  - System sync activities
  - Error or alert notifications
- Each activity entry with:
  - Icon representing activity type
  - Timestamp (relative time)
  - Actor (user who performed action)
  - Action description
  - Related entity link (event/donation/user)
- Filter by activity type
- Show last 20 activities with "View All" link

## Quick Actions Section
- Primary action buttons:
  - Create New Event
  - Add Donation
  - Generate Report
  - Manage Users
  - System Settings
- Each button with icon and label
- Arranged in grid layout for quick access

## System Health Section
- System status indicators:
  - Database connection status
  - Cloud sync status
  - Storage capacity (used/available)
  - Active user sessions count
  - Last backup timestamp
- Alerts section for:
  - Failed sync attempts
  - Low storage warnings
  - Security alerts
  - System errors
- Color-coded status badges (success: green, warning: gold, error: red)
