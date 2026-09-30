import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceError } from '../../../../../core/services/service-error';
import { TenantDataService } from '../../../../../data/services/tenant-data.service';
import type { Tenant } from '../../../../../data/models/tenant';
import type { ApplicationView } from '../application-view';
import { ApplicationRow } from './application-row';

const TENANT: Tenant = {
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

const view = (tenant: Partial<Tenant> = {}): ApplicationView => ({
  tenant: { ...TENANT, ...tenant },
  applicantName: 'Kwame Asante',
  applicantEmail: 'kwame@asante.example',
  verifierName: tenant.verifiedBy ? 'Ama Admin' : null,
});

describe('ApplicationRow', () => {
  let fixture: ComponentFixture<ApplicationRow>;
  let component: ApplicationRow;
  let tenantData: {
    getVerificationDocument: ReturnType<typeof vi.fn>;
    recordTenantVerification: ReturnType<typeof vi.fn>;
  };

  async function render(application: ApplicationView): Promise<void> {
    fixture = TestBed.createComponent(ApplicationRow);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('application', application);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    tenantData = {
      getVerificationDocument: vi.fn().mockResolvedValue({
        name: 'registration.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        viewUrl: 'https://files.example/view/file-1',
      }),
      recordTenantVerification: vi
        .fn()
        .mockResolvedValue({ verifiedBy: 'admin-1', verifiedAt: '2026-09-30T10:00:00.000Z' }),
    };
    await TestBed.configureTestingModule({
      imports: [ApplicationRow],
      providers: [{ provide: TenantDataService, useValue: tenantData }],
    }).compileComponents();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const trigger = () => el().querySelector<HTMLButtonElement>('.row-trigger')!;
  const button = (label: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      b.textContent?.trim().startsWith(label),
    )!;

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('renders collapsed by default with name, tier, submitted date, pending pill and actions', async () => {
    await render(view());

    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(el().querySelector('.row-details')).toBeNull();
    const text = el().textContent ?? '';
    expect(text).toContain('Kwame Asante — Asante Events');
    expect(text).toContain('Super Organizer (pending)');
    expect(text).toContain('Submitted Sep 28, 2026');
    expect(el().querySelector('.status-pill')?.textContent?.trim()).toBe('Pending');
    expect(button('Approve')).toBeTruthy();
    expect(button('Reject')).toBeTruthy();
  });

  it('expands inline, moves focus into the details and shows the intake and document link', async () => {
    await render(view());

    trigger().click();
    await settle();

    const details = el().querySelector<HTMLElement>('.row-details')!;
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(trigger().getAttribute('aria-controls')).toBe(details.id);
    expect(document.activeElement).toBe(details);
    const text = details.textContent ?? '';
    expect(text).toContain('Kumasi');
    expect(text).toContain('11–50 people');
    expect(text).toContain('Funeral services');
    expect(text).toContain('12');
    expect(text).toContain('kwame@asante.example');
    const link = details.querySelector<HTMLAnchorElement>('a.doc-link')!;
    expect(link.href).toBe('https://files.example/view/file-1');
    expect(link.textContent).toContain('registration.pdf');
    expect(tenantData.getVerificationDocument).toHaveBeenCalledWith('file-1');
  });

  it('returns focus to the row trigger when collapsed', async () => {
    await render(view());
    trigger().click();
    await settle();

    button('Hide details').click();
    await settle();

    expect(el().querySelector('.row-details')).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
  });

  it('says so when the verification document is missing from storage', async () => {
    tenantData.getVerificationDocument.mockResolvedValueOnce(null);
    await render(view());

    trigger().click();
    await settle();

    expect(el().textContent).toContain("The document can't be found");
    expect(el().querySelector('a.doc-link')).toBeNull();
  });

  it('an unverified Approve does not emit — it opens the verification checks and explains why', async () => {
    await render(view());
    const approved = vi.fn();
    component.approve.subscribe(approved);

    expect(button('Approve').getAttribute('aria-disabled')).toBe('true');
    button('Approve').click();
    await settle();

    expect(approved).not.toHaveBeenCalled();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(el().textContent).toContain(
      'Record the document review and phone call before approving',
    );
    expect(document.activeElement).toBe(el().querySelector('.verify'));
  });

  it('refuses to record verification until both checks are ticked', async () => {
    await render(view());
    trigger().click();
    await settle();

    const [documentBox] = el().querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    documentBox.click();
    button('Record verification').click();
    await settle();

    expect(tenantData.recordTenantVerification).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Confirm both checks');
  });

  it('records verification once both checks are ticked and emits who/when', async () => {
    await render(view());
    const verified = vi.fn();
    component.verified.subscribe(verified);
    trigger().click();
    await settle();

    el()
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((box) => box.click());
    button('Record verification').click();
    await settle();

    expect(tenantData.recordTenantVerification).toHaveBeenCalledWith('t1');
    expect(verified).toHaveBeenCalledWith({
      verifiedBy: 'admin-1',
      verifiedAt: '2026-09-30T10:00:00.000Z',
    });
  });

  it('shows the Function refusal when recording verification fails', async () => {
    tenantData.recordTenantVerification.mockRejectedValueOnce(
      new ServiceError('The verification document could not be found'),
    );
    await render(view());
    trigger().click();
    await settle();

    el()
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((box) => box.click());
    button('Record verification').click();
    await settle();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'The verification document could not be found',
    );
  });

  it('once verified, shows who verified and when, and Approve emits', async () => {
    await render(view({ verifiedBy: 'admin-1', verifiedAt: '2026-09-30T10:00:00.000Z' }));
    const approved = vi.fn();
    component.approve.subscribe(approved);

    expect(button('Approve').getAttribute('aria-disabled')).toBe('false');
    trigger().click();
    await settle();
    expect(el().textContent).toContain('Verified by Ama Admin');
    expect(el().querySelectorAll('input[type="checkbox"]')).toHaveLength(0);

    button('Approve').click();
    expect(approved).toHaveBeenCalledTimes(1);
  });

  it('Reject emits regardless of verification', async () => {
    await render(view());
    const rejected = vi.fn();
    component.reject.subscribe(rejected);

    button('Reject').click();

    expect(rejected).toHaveBeenCalledTimes(1);
  });
});
