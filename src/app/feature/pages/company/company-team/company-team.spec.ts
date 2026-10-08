import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { CompanyTeam } from './company-team';
import { TenantService } from '../../../../data/services/tenant.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import { ServiceError } from '../../../../core/services/service-error';
import type { MembershipRole } from '../../../../data/models/membership';
import type { TeamMember } from '../../../../data/models/team-member';

function member(overrides: Partial<TeamMember>): TeamMember {
  return {
    membershipId: 'm-x',
    userId: 'u-x',
    name: 'Someone',
    email: 'someone@a.co',
    role: 'operator',
    status: 'active',
    grantedAt: '2026-09-01T00:00:00.000Z',
    isSelf: false,
    ...overrides,
  };
}

const SELF_SO = member({
  membershipId: 'm-so',
  userId: 'so',
  name: 'Yaw Asante',
  role: 'super_organizer',
  isSelf: true,
});
const CO_ORG = member({
  membershipId: 'm-org',
  userId: 'org',
  name: 'Ama Owusu',
  role: 'organizer',
});
const OPERATOR = member({ membershipId: 'm-op', userId: 'op', name: 'Kwesi Boateng' });

describe('CompanyTeam', () => {
  let teamData: {
    listTeamMembers: ReturnType<typeof vi.fn>;
    addTeamMember: ReturnType<typeof vi.fn>;
    revokeMembership: ReturnType<typeof vi.fn>;
  };
  let clipboard: { copy: ReturnType<typeof vi.fn> };

  async function render(role: MembershipRole, members: TeamMember[]) {
    teamData.listTeamMembers.mockResolvedValue(members);
    TestBed.configureTestingModule({
      imports: [CompanyTeam],
      providers: [
        { provide: TeamDataService, useValue: teamData },
        { provide: Clipboard, useValue: clipboard },
        {
          provide: TenantService,
          useValue: {
            context: signal({ membership: { role } }),
            tenant: signal({ name: 'Asante Events' }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CompanyTeam);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const buttons = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');

  beforeEach(() => {
    clipboard = { copy: vi.fn().mockReturnValue(true) };
    teamData = {
      listTeamMembers: vi.fn(),
      addTeamMember: vi.fn(),
      revokeMembership: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('shows the empty-team state with both add actions for a Super Organizer (AC4)', async () => {
    const { el } = await render('super_organizer', [SELF_SO]);

    expect(el.textContent).toContain("You haven't added anyone yet");
    expect(buttons(el)).toEqual(['Add co-Organizer', 'Add Operator']);
    expect(el.querySelector('table')).toBeNull();
  });

  it('never renders "Add co-Organizer" for a co-Organizer — not disabled, simply absent (AC3)', async () => {
    const { el } = await render('organizer', [
      member({ ...CO_ORG, isSelf: true }),
      { ...SELF_SO, isSelf: false },
    ]);

    expect(el.textContent).not.toContain('Add co-Organizer');
    expect(buttons(el).some((b) => b.endsWith('Add Operator'))).toBe(true);
    expect(el.querySelector('button[disabled]')).toBeNull();
  });

  it('lists the team by tier and offers Revoke only where the caller may revoke', async () => {
    const { el } = await render('organizer', [
      OPERATOR,
      member({ ...CO_ORG, isSelf: true }),
      { ...SELF_SO, isSelf: false },
    ]);

    const rows = Array.from(el.querySelectorAll('tbody tr'));
    expect(rows.map((r) => r.querySelector('td')?.textContent?.trim())).toEqual([
      'Yaw Asante',
      'Ama Owusu',
      'Kwesi Boateng',
    ]);
    expect(rows[0].querySelector('.is-actions')?.textContent?.trim()).toBe('');
    expect(rows[1].textContent).toContain("That's you");
    expect(rows[2].querySelector('button')?.textContent).toContain('Revoke');
  });

  async function addOperator(inviteStatus: { email: 'sent' | 'failed' } | undefined, phone = '') {
    const { fixture, el } = await render('super_organizer', [SELF_SO]);
    teamData.addTeamMember.mockResolvedValue({
      name: 'Kojo Mensah',
      role: 'operator',
      generatedPassword: 'pw-123',
      setupIncomplete: false,
      inviteStatus,
    });
    teamData.listTeamMembers.mockResolvedValue([SELF_SO, member({ name: 'Kojo Mensah' })]);
    fixture.componentInstance.openAdd('operator');
    fixture.detectChanges();
    fixture.componentInstance.form.setValue({ name: ' Kojo Mensah ', email: 'kojo@a.co', phone });
    await fixture.componentInstance.add();
    fixture.detectChanges();
    return { fixture, el };
  }

  it('adds an Operator, reloads the team and announces only that the account was created', async () => {
    const { el } = await addOperator({ email: 'failed' });

    expect(teamData.addTeamMember).toHaveBeenCalledWith({
      name: 'Kojo Mensah',
      email: 'kojo@a.co',
      role: 'operator',
    });
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(el.querySelector('[role="status"]')?.textContent).toBe(
      'Account created for Kojo Mensah.',
    );
    expect(el.textContent).toContain('Kojo Mensah');
  });

  it('passes a normalized optional phone through to the Function', async () => {
    await addOperator({ email: 'sent' }, '+233 20 123 4567');

    expect(teamData.addTeamMember.mock.calls[0][0].phone).toBe('+233201234567');
  });

  it('rejects a phone that is not in international format', async () => {
    const { fixture } = await render('super_organizer', [SELF_SO]);
    fixture.componentInstance.openAdd('operator');
    fixture.componentInstance.form.setValue({ name: 'Kojo', email: 'k@a.co', phone: '0201234567' });

    await fixture.componentInstance.add();

    expect(teamData.addTeamMember).not.toHaveBeenCalled();
    expect(fixture.componentInstance.invalid('phone')).toBe(true);
  });

  it('keeps the password off screen when the credentials were emailed', async () => {
    const { el } = await addOperator({ email: 'sent' });

    expect(el.textContent).toContain('We emailed Kojo Mensah their sign-in details.');
    expect(el.textContent).not.toContain('pw-123');
    expect(el.textContent).not.toContain('Copy password');
  });

  it('falls back to a focusable, labelled password region with a copy button', async () => {
    const { fixture, el } = await addOperator({ email: 'failed' });
    const region = el.querySelector('section[aria-labelledby="new-member-title"]');

    expect(region?.getAttribute('tabindex')).toBe('0');
    expect(region?.textContent).toContain('pw-123');
    expect(region?.closest('[role="status"]')).toBeNull();

    (
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Copy password'),
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();

    expect(clipboard.copy).toHaveBeenCalledWith('pw-123');
    expect(el.querySelector('[role="status"]')?.textContent).toBe('Password copied.');
  });

  it('keeps the dialog open and shows the server message when the add is refused', async () => {
    const { fixture, el } = await render('super_organizer', [SELF_SO]);
    teamData.addTeamMember.mockRejectedValue(
      new ServiceError('A user with this email already exists'),
    );

    fixture.componentInstance.openAdd('organizer');
    fixture.componentInstance.form.setValue({ name: 'Kojo', email: 'kojo@a.co', phone: '' });
    await fixture.componentInstance.add();
    fixture.detectChanges();

    expect(el.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      'A user with this email already exists',
    );
  });

  it('revokes after confirmation and moves focus to the page heading once the row is gone', async () => {
    const { fixture, el } = await render('super_organizer', [SELF_SO, CO_ORG]);
    teamData.listTeamMembers.mockResolvedValue([SELF_SO]);

    fixture.componentInstance.askRevoke(CO_ORG);
    fixture.detectChanges();
    expect(el.querySelector('[role="alertdialog"]')?.textContent).toContain(
      "Revoke Ama Owusu's access?",
    );

    await fixture.componentInstance.confirmRevoke({ reason: 'routine' });
    fixture.detectChanges();

    expect(teamData.revokeMembership).toHaveBeenCalledWith('m-org', { reason: 'routine' });
    expect(el.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement?.id).toBe('team-title');
  });

  it('shows a retryable error when the team cannot be loaded', async () => {
    teamData.listTeamMembers.mockRejectedValueOnce(new ServiceError('Failed to load your team'));
    const { fixture, el } = await render('super_organizer', []);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Failed to load your team');
    expect(el.textContent).not.toContain("You haven't added anyone yet");

    teamData.listTeamMembers.mockResolvedValue([SELF_SO]);
    await fixture.componentInstance.load();
    fixture.detectChanges();
    expect(el.textContent).toContain("You haven't added anyone yet");
  });
});
