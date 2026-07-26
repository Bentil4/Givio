# Deferred Work

## Deferred from: code review of story 1-1-secure-login-role-guarded-dashboard-landing (2026-07-26)

- **No `returnUrl` preserved on guard redirect** — a denied/unauthenticated user is always sent to `/login` with no memory of the URL they were trying to reach, so after logging in they land on their default dashboard rather than back where they started. Not required by any Story 1.1 AC. `src/app/auth/guards/role.guard.ts`.
- **Guards attached per top-level route, not via `canActivateChild`** — currently harmless (Angular's `canActivate` on a parent route already protects its children, and each of `admin`/`organizer` has exactly one child today), but nothing structurally forces a future route added directly under `admin`/`organizer` to inherit protection. Worth a checklist reminder as Epic 2+ adds more routes. `src/app/app.routes.ts`.
