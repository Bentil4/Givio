import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceError } from '../../../../../core/services/service-error';
import { TenantDataService } from '../../../../../data/services/tenant-data.service';
import { InviteOrganizerDialog } from './invite-organizer-dialog';

describe('InviteOrganizerDialog', () => {
  let fixture: ComponentFixture<InviteOrganizerDialog>;
  let component: InviteOrganizerDialog;
  let inviteOrganizer: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    inviteOrganizer = vi.fn().mockResolvedValue({
      userId: 'u9',
      tenantId: 't9',
      membershipId: 'm9',
      generatedPassword: 'pw-123',
      inviteStatus: { email: 'sent' },
    });
    await TestBed.configureTestingModule({
      imports: [InviteOrganizerDialog],
      providers: [{ provide: TenantDataService, useValue: { inviteOrganizer } }],
    }).compileComponents();
    fixture = TestBed.createComponent(InviteOrganizerDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const fill = (overrides: { contactPhone?: string } = {}) =>
    component.form.setValue({
      name: ' Kofi Boateng ',
      email: 'kofi@boateng.example',
      contactPhone: '',
      ...overrides,
      companyName: 'Boateng Funerals ',
      location: 'Accra',
      size: '1-10',
      type: 'funeral',
      estimatedUserCount: '5',
    });

  it('is a labelled modal dialog', () => {
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('invite-organizer-title');
  });

  it('does not call the Function while the intake is incomplete', async () => {
    await component.submit();
    fixture.detectChanges();

    expect(inviteOrganizer).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Enter their full name.');
  });

  it('sends the trimmed intake and emits the result', async () => {
    const invited = vi.fn();
    component.invited.subscribe(invited);
    fill();

    await component.submit();

    expect(inviteOrganizer).toHaveBeenCalledWith({
      name: 'Kofi Boateng',
      email: 'kofi@boateng.example',
      company: {
        name: 'Boateng Funerals',
        location: 'Accra',
        size: '1-10',
        type: 'funeral',
        estimatedUserCount: 5,
      },
    });
    expect(invited).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Kofi Boateng', companyName: 'Boateng Funerals' }),
    );
  });

  it('keeps the dialog open and shows the Function error on failure', async () => {
    inviteOrganizer.mockRejectedValueOnce(
      new ServiceError('A user with this email already exists'),
    );
    const invited = vi.fn();
    component.invited.subscribe(invited);
    fill();

    await component.submit();
    fixture.detectChanges();

    expect(invited).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
    ).toContain('A user with this email already exists');
  });

  it('sends the optional contact phone normalized when one is given', async () => {
    fill({ contactPhone: '+233 (24) 123-4567' });

    await component.submit();

    expect(inviteOrganizer.mock.calls[0][0].company.contactPhone).toBe('+233241234567');
  });

  it('refuses an invalid contact phone and links the error to the field', async () => {
    fill({ contactPhone: '024 123 4567' });

    await component.submit();
    fixture.detectChanges();

    expect(inviteOrganizer).not.toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('#ioPhone')!;
    expect(input.type).toBe('tel');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('ioPhone-error');
    expect(el.querySelector('#ioPhone-error')).not.toBeNull();
  });
});
