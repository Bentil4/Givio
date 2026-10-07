import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type Route } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ADMIN_ROUTES } from './admin.routes';

const adminChildren = () => ADMIN_ROUTES[0].children ?? [];

/** The real paths and redirects, with every page and guard stubbed out. */
function routingOnly(route: Route): Route {
  const { path, redirectTo } = route;
  return redirectTo === undefined ? { path, children: [] } : { path, redirectTo };
}

describe('ADMIN_ROUTES (AD-12, amended 2026-10-07)', () => {
  it('holds only platform governance pages — no Events, Donations or Reports', () => {
    const paths = adminChildren().map((route) => route.path);

    expect(paths).toEqual([
      '',
      'users',
      'admins',
      'approvals',
      'support',
      'companies',
      'audit',
      '**',
    ]);
  });

  for (const removed of ['events', 'events/e1', 'events/e1/edit', 'donations', 'reports']) {
    it(`sends an old /dashboard/${removed} link to the Admin overview`, async () => {
      TestBed.configureTestingModule({
        providers: [
          provideRouter([{ path: 'dashboard', children: adminChildren().map(routingOnly) }]),
        ],
      });
      const harness = await RouterTestingHarness.create();

      await harness.navigateByUrl(`/dashboard/${removed}`);

      expect(TestBed.inject(Router).url).toBe('/dashboard');
    });
  }
});
