import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CompanyTeam } from './company-team';
import { TenantService } from '../../../../data/services/tenant.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import { FunctionRejectedError } from '../../../../data/appwrite/invoke-admin-function';
import type { TeamMember } from '../../../../data/models/team-member';

// Story 7.3: a revoke whose follow-up steps failed has already left the list, so the page keeps
// a "Finish revoking" retry that re-sends the same choice.

const SELF_SO: TeamMember = {
  membershipId: 'm-so',
  userId: 'so',
  name: 'Yaw Asante',
  email: 'yaw@a.co',
  role: 'super_organizer',
  status: 'active',
  grantedAt: '2026-09-01T00:00:00.000Z',
  isSelf: true,
};
const OPERATOR: TeamMember = {
  ...SELF_SO,
  membershipId: 'm-op',
  userId: 'op',
  name: 'Kwesi Boateng',
  role: 'operator',
  isSelf: false,
};
const FOR_CAUSE = { reason: 'for_cause', explanation: 'Took cash' } as const;

describe('CompanyTeam unfinished revokes', () => {
  let revokeMembership: ReturnType<typeof vi.fn>;

  async function render() {
    revokeMembership = vi.fn();
    TestBed.configureTestingModule({
      imports: [CompanyTeam],
      providers: [
        {
          provide: TeamDataService,
          useValue: { listTeamMembers: vi.fn().mockResolvedValue([SELF_SO]), revokeMembership },
        },
        {
          provide: TenantService,
          useValue: {
            context: signal({ membership: { role: 'super_organizer' } }),
            tenant: signal({ name: 'Asante Events' }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CompanyTeam);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.askRevoke(OPERATOR);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const retryButton = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Finish revoking'),
    );

  it('offers "Finish revoking" after a 502 and re-sends the same choice until it succeeds', async () => {
    const { fixture, el } = await render();
    revokeMembership.mockRejectedValueOnce(
      new FunctionRejectedError('Access was revoked, but finishing it failed', '', 502),
    );

    await fixture.componentInstance.confirmRevoke(FOR_CAUSE);
    fixture.detectChanges();
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Kwesi Boateng's access wasn't fully revoked");
    expect(document.activeElement?.id).toBe('team-title');

    revokeMembership.mockResolvedValueOnce(undefined);
    expect(retryButton(el)).toBeDefined();
    await fixture.componentInstance.retryRevoke();
    fixture.detectChanges();

    expect(revokeMembership.mock.calls).toEqual([
      ['m-op', FOR_CAUSE],
      ['m-op', FOR_CAUSE],
    ]);
    expect(retryButton(el)).toBeUndefined();
  });

  it('shows a refusal (4xx) as a plain error with no retry', async () => {
    const { fixture, el } = await render();
    revokeMembership.mockRejectedValueOnce(new FunctionRejectedError('Forbidden', '', 403));

    await fixture.componentInstance.confirmRevoke({ reason: 'routine' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Forbidden');
    expect(retryButton(el)).toBeUndefined();
  });
});
