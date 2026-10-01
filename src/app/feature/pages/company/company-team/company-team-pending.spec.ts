import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CompanyTeam } from './company-team';
import { TenantService } from '../../../../data/services/tenant.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import type { TeamMember } from '../../../../data/models/team-member';

// Story 7.2: an addition held for Admin's review shows as pending, with no reason given.

const HELD: TeamMember = {
  membershipId: 'm-held',
  userId: 'held',
  name: 'Kojo Mensah',
  email: 'kojo@a.co',
  role: 'operator',
  status: 'pending_review',
  grantedAt: '2026-09-30T00:00:00.000Z',
  isSelf: false,
};
const ACTIVE: TeamMember = { ...HELD, membershipId: 'm-op', name: 'Ama Owusu', status: 'active' };

describe('CompanyTeam pending additions', () => {
  async function render(members: TeamMember[]) {
    TestBed.configureTestingModule({
      imports: [CompanyTeam],
      providers: [
        {
          provide: TeamDataService,
          useValue: { listTeamMembers: vi.fn().mockResolvedValue(members) },
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
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const rowFor = (el: HTMLElement, name: string) =>
    Array.from(el.querySelectorAll('tbody tr')).find((r) => r.textContent?.includes(name));

  it('marks a held addition Pending, says nothing about why, and leaves active rows unmarked', async () => {
    const el = await render([HELD, ACTIVE]);

    const held = rowFor(el, 'Kojo Mensah')!;
    expect(held.querySelector('.status-pill')?.textContent?.trim()).toBe('Pending');
    expect(held.textContent).not.toMatch(/flag|review|check|match/i);
    expect(rowFor(el, 'Ama Owusu')!.querySelector('.status-pill')).toBeNull();
  });
});
