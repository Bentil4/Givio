/**
 * Story 5.1's off-canvas sidebar drawer only exists below this width (see sidebar.scss,
 * admin-layout.scss, organizer-layout.scss) — kept as one exported constant so the
 * BreakpointObserver query driving the layouts' JS state can't silently drift from the
 * CSS media query that actually renders the drawer.
 */
export const MOBILE_NAV_QUERY = '(max-width: 720px)';
