import { routes } from './app.routes';
import { sessionExpiryGuard } from './auth/guards/role.guard';

describe('app.routes', () => {
  // Angular's default runGuardsAndResolvers does not re-run a parent route's canActivate
  // guards on a child-only navigation (e.g. /dashboard -> /dashboard/settings) — only
  // canActivateChild re-checks on every child activation. Without this, idle expiry would
  // only ever be enforced once per visit to the dashboard/organizer subtree.
  for (const path of ['dashboard', 'organizer']) {
    it(`registers sessionExpiryGuard on both canActivate and canActivateChild for '${path}'`, () => {
      const route = routes.find((r) => r.path === path);

      expect(route?.canActivate).toContain(sessionExpiryGuard);
      expect(route?.canActivateChild).toContain(sessionExpiryGuard);
    });
  }
});
