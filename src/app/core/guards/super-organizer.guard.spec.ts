import { TestBed } from '@angular/core/testing';
import { TenantService } from '../../data/services/tenant.service';
import type { MembershipRole } from '../../data/models/membership';
import { superOrganizerMatch } from './super-organizer.guard';

describe('superOrganizerMatch', () => {
  let load: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    load = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: TenantService, useValue: { load } }],
    });
  });

  const run = () =>
    TestBed.runInInjectionContext(() => superOrganizerMatch({} as never, [] as never, {} as never));
  const withRole = (role: MembershipRole) => load.mockResolvedValue({ membership: { role } });

  it('matches the route for a Super Organizer', async () => {
    withRole('super_organizer');

    expect(await run()).toBe(true);
  });

  it('does not match for a co-Organizer', async () => {
    withRole('organizer');

    expect(await run()).toBe(false);
  });

  it('does not match when the context lookup fails', async () => {
    load.mockRejectedValue(new Error('offline'));

    expect(await run()).toBe(false);
  });
});
