import { TestBed } from '@angular/core/testing';
import { EventOperators } from './event-operators';
import { OrganizerEventDataService } from '../../../../../data/services/organizer-event-data.service';
import { TeamDataService } from '../../../../../data/services/team-data.service';
import { ServiceError } from '../../../../../core/services/service-error';
import type { Event } from '../../../../../data/models/event';
import type { TeamMember } from '../../../../../data/models/team-member';

const member = (overrides: Partial<TeamMember>): TeamMember => ({
  membershipId: 'm',
  userId: 'u',
  name: 'Someone',
  email: 'someone@a.co',
  role: 'operator',
  status: 'active',
  grantedAt: '2026-09-01T00:00:00.000Z',
  isSelf: false,
  ...overrides,
});

const EVENT = { id: 'e1', assignedUserIds: ['op-1'] } as Event;

describe('EventOperators', () => {
  let assignOperators: ReturnType<typeof vi.fn>;

  async function render(members: TeamMember[]) {
    TestBed.configureTestingModule({
      imports: [EventOperators],
      providers: [
        {
          provide: TeamDataService,
          useValue: { listTeamMembers: vi.fn().mockResolvedValue(members) },
        },
        { provide: OrganizerEventDataService, useValue: { assignOperators } },
      ],
    });
    const fixture = TestBed.createComponent(EventOperators);
    fixture.componentRef.setInput('event', EVENT);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    assignOperators = vi.fn().mockResolvedValue(undefined);
  });

  it("offers only the company's active Operators, pre-checking the assigned ones", async () => {
    const { el } = await render([
      member({ userId: 'op-1', name: 'Kwesi' }),
      member({ userId: 'op-2', name: 'Esi' }),
      member({ userId: 'op-3', name: 'Revoked', status: 'revoked' }),
      member({ userId: 'org', name: 'Co-Organizer', role: 'organizer' }),
    ]);

    const boxes = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(boxes).toHaveLength(2);
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    expect(el.textContent).not.toContain('Revoked');
  });

  it('saves the new selection and reports it upward', async () => {
    const { fixture, el } = await render([
      member({ userId: 'op-1', name: 'Kwesi' }),
      member({ userId: 'op-2', name: 'Esi' }),
    ]);
    const emitted: string[][] = [];
    fixture.componentInstance.assigned.subscribe((ids) => emitted.push(ids));

    el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1].click();
    el.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(assignOperators).toHaveBeenCalledWith('e1', ['op-1', 'op-2']);
    expect(emitted).toEqual([['op-1', 'op-2']]);
    expect(el.textContent).toContain('Operators saved.');
  });

  it('shows the Function’s refusal and does not report success', async () => {
    assignOperators.mockRejectedValue(
      new ServiceError('User op-9 is not an Operator in your company'),
    );
    const { fixture, el } = await render([member({ userId: 'op-1', name: 'Kwesi' })]);

    el.querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('not an Operator');
    expect(el.textContent).not.toContain('Operators saved.');
  });

  it('points to Team when the company has no Operators', async () => {
    const { el } = await render([]);

    expect(el.textContent).toContain('Add them under Team first');
  });
});
