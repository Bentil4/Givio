import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceError } from '../../../../core/services/service-error';
import { TenantDataService } from '../../../../data/services/tenant-data.service';
import { UserService } from '../../../../data/services/user.service';
import type { AdminUser } from '../../../../data/models/admin-user';
import type { Tenant } from '../../../../data/models/tenant';
import { AdminApprovals } from './admin-approvals';

const PENDING: Tenant = {
  id: 't1',
  name: 'Asante Events',
  location: 'Kumasi',
  size: '11-50',
  type: 'funeral',
  estimatedUserCount: 12,
  status: 'pending',
  superOrganizerId: 'owner-1',
  verificationDocumentId: 'file-1',
  createdAt: '2026-09-28T09:00:00.000Z',
};
const VERIFIED: Tenant = {
  ...PENDING,
  id: 't2',
  name: 'Mensah Weddings',
  superOrganizerId: 'owner-2',
  verifiedBy: 'admin-1',
  verifiedAt: '2026-09-30T10:00:00.000Z',
};
const OWNER: AdminUser = {
  id: 'owner-1',
  name: 'Kwame Asante',
  email: 'kwame@asante.example',
  role: null,
  active: true,
  registeredAt: '2026-09-28',
};

describe('AdminApprovals', () => {
  let fixture: ComponentFixture<AdminApprovals>;
  let component: AdminApprovals;
  let tenantData: {
    listPendingTenants: ReturnType<typeof vi.fn>;
    decideTenantApplication: ReturnType<typeof vi.fn>;
    recordTenantVerification: ReturnType<typeof vi.fn>;
    getVerificationDocument: ReturnType<typeof vi.fn>;
    inviteOrganizer: ReturnType<typeof vi.fn>;
  };

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(AdminApprovals);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await vi.waitFor(() => expect(component.loading()).toBe(false));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    tenantData = {
      listPendingTenants: vi.fn().mockResolvedValue([PENDING, VERIFIED]),
      decideTenantApplication: vi.fn().mockResolvedValue(undefined),
      recordTenantVerification: vi.fn(),
      getVerificationDocument: vi.fn().mockResolvedValue(null),
      inviteOrganizer: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [AdminApprovals],
      providers: [
        { provide: TenantDataService, useValue: tenantData },
        {
          provide: UserService,
          useValue: { getUsersById: vi.fn().mockResolvedValue(new Map([[OWNER.id, OWNER]])) },
        },
      ],
    }).compileComponents();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent ?? '';
  const queueText = () => el().querySelector('.queue')?.textContent ?? '';

  it('lists pending applications under an Organizer applications tab with a count', async () => {
    await render();

    const tab = el().querySelector('[role="tab"]')!;
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(tab.textContent).toContain('Organizer applications (2)');
    expect(el().querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(tab.id);
    expect(el().querySelectorAll('app-application-row')).toHaveLength(2);
    expect(text()).toContain('Kwame Asante — Asante Events');
    expect(text()).toContain('Mensah Weddings');
  });

  it('shows "No applications waiting" when the queue is empty', async () => {
    tenantData.listPendingTenants.mockResolvedValueOnce([]);
    await render();

    expect(text()).toContain('No applications waiting');
    expect(el().querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('shows an error with a retry — never loads forever — when the queue fails to load', async () => {
    tenantData.listPendingTenants.mockRejectedValueOnce(
      new ServiceError('Failed to load pending applications'),
    );
    await render();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'Failed to load pending applications',
    );
    expect(text()).not.toContain('No applications waiting');

    tenantData.listPendingTenants.mockResolvedValueOnce([]);
    await component.load();
    fixture.detectChanges();
    expect(text()).toContain('No applications waiting');
  });

  it('rejecting confirms first, then drops the row from the queue', async () => {
    await render();

    component.ask('rejected', component.applications()[0]);
    fixture.detectChanges();
    expect(el().querySelector('[role="alertdialog"]')?.textContent).toContain(
      'Reject Asante Events?',
    );

    tenantData.listPendingTenants.mockResolvedValueOnce([VERIFIED]);
    await component.confirmPending();
    fixture.detectChanges();

    expect(tenantData.decideTenantApplication).toHaveBeenCalledWith('t1', 'rejected');
    expect(el().querySelector('[role="alertdialog"]')).toBeNull();
    expect(el().querySelectorAll('app-application-row')).toHaveLength(1);
    expect(queueText()).not.toContain('Asante Events');
    expect(component.announcement()).toBe('Asante Events rejected.');
  });

  it('approving a verified application calls the Function and removes it from the queue', async () => {
    await render();

    component.ask('approved', component.applications()[1]);
    tenantData.listPendingTenants.mockResolvedValueOnce([PENDING]);
    await component.confirmPending();
    fixture.detectChanges();

    expect(tenantData.decideTenantApplication).toHaveBeenCalledWith('t2', 'approved');
    expect(queueText()).not.toContain('Mensah Weddings');
    expect(queueText()).toContain('Asante Events');
  });

  it('keeps the row and shows the Function refusal when an approval is refused', async () => {
    tenantData.decideTenantApplication.mockRejectedValueOnce(
      new ServiceError('Record the document review and phone verification before approving'),
    );
    await render();

    component.ask('approved', component.applications()[0]);
    await component.confirmPending();
    fixture.detectChanges();

    expect(text()).toContain('Asante Events');
    expect(text()).toContain('Record the document review and phone verification before approving');
  });

  it('marks a row verified in place once verification is recorded', async () => {
    await render();

    component.onVerified(component.applications()[0], {
      verifiedBy: 'admin-1',
      verifiedAt: '2026-09-30T11:00:00.000Z',
    });

    expect(component.applications()[0].tenant.verifiedBy).toBe('admin-1');
    expect(tenantData.listPendingTenants).toHaveBeenCalledTimes(1);
  });

  it('shows the generated password after an Organizer is invited', async () => {
    await render();

    component.openInvite();
    fixture.detectChanges();
    expect(el().querySelector('app-invite-organizer-dialog')).not.toBeNull();

    component.onInvited({
      name: 'Kofi Boateng',
      companyName: 'Boateng Funerals',
      result: {
        userId: 'u9',
        tenantId: 't9',
        membershipId: 'm9',
        generatedPassword: 'pw-123',
        inviteStatus: { email: 'failed' },
      },
    });
    fixture.detectChanges();

    expect(el().querySelector('app-invite-organizer-dialog')).toBeNull();
    const note = el().querySelector('.code-note')?.textContent ?? '';
    expect(note).toContain('pw-123');
    expect(note).toContain("The invite email didn't send");
  });
});
