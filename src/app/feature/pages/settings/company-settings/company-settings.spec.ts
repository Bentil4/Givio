import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceError } from '../../../../core/services/service-error';
import { TenantDataService } from '../../../../data/services/tenant-data.service';
import { CompanyContext, TenantService } from '../../../../data/services/tenant.service';
import type { MembershipRole } from '../../../../data/models/membership';
import type { Tenant } from '../../../../data/models/tenant';
import { CompanySettings } from './company-settings';

const LOGO = 'data:image/png;base64,iVBORw0KGgo=';

const TENANT = {
  id: 't1',
  name: 'Asante Events',
  location: 'Kumasi',
  contactPhone: '+233241234567',
  logo: LOGO,
} as Tenant;

describe('CompanySettings', () => {
  let fixture: ComponentFixture<CompanySettings>;
  let el: HTMLElement;
  let updateCompanyProfile: ReturnType<typeof vi.fn>;
  let load: ReturnType<typeof vi.fn>;

  async function renderAs(role: MembershipRole): Promise<void> {
    updateCompanyProfile = vi.fn().mockResolvedValue({});
    load = vi.fn().mockResolvedValue(null);
    const context = signal({ membership: { role } } as CompanyContext);
    TestBed.configureTestingModule({
      imports: [CompanySettings],
      providers: [
        { provide: TenantService, useValue: { context, tenant: signal(TENANT), load } },
        { provide: TenantDataService, useValue: { updateCompanyProfile } },
      ],
    });
    fixture = TestBed.createComponent(CompanySettings);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const input = (id: string) => el.querySelector<HTMLInputElement>(`#${id}`)!;

  function type(id: string, value: string): void {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function submit(): Promise<void> {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  describe('for a co-Organizer', () => {
    beforeEach(() => renderAs('organizer'));

    it('shows the company details read-only — no form, no inputs', () => {
      expect(el.querySelector('form')).toBeNull();
      expect(el.querySelector('input')).toBeNull();
      const details = el.querySelector('dl')?.textContent;
      expect(details).toContain('Asante Events');
      expect(details).toContain('Kumasi');
      expect(details).toContain('+233241234567');
      expect(el.querySelector('dl img')?.getAttribute('alt')).toBe('Asante Events logo');
    });
  });

  describe('for the Super Organizer', () => {
    beforeEach(() => renderAs('super_organizer'));

    it('prefills an editable form', () => {
      expect(el.querySelector('dl')).toBeNull();
      expect(input('company-name').value).toBe('Asante Events');
      expect(input('company-location').value).toBe('Kumasi');
      expect(input('company-phone').value).toBe('+233241234567');
    });

    it('saves the trimmed, normalized profile — an untouched logo left out — then refreshes', async () => {
      type('company-name', '  Asante Events Ltd  ');
      type('company-phone', '+233 20 765 4321');

      await submit();

      expect(updateCompanyProfile).toHaveBeenCalledWith({
        name: 'Asante Events Ltd',
        location: 'Kumasi',
        contactPhone: '+233207654321',
      });
      expect(load).toHaveBeenCalledWith(true);
      expect(el.querySelector('[role="status"]')?.textContent?.trim()).toBe(
        'Company details saved.',
      );
    });

    it('sends a removed logo and a cleared phone as null', async () => {
      el.querySelector<HTMLButtonElement>('app-image-upload .btn-remove')!.click();
      type('company-phone', '');

      await submit();

      expect(updateCompanyProfile).toHaveBeenCalledWith(
        expect.objectContaining({ logo: null, contactPhone: null }),
      );
    });

    it('refuses an empty name and focuses it', async () => {
      type('company-name', '');

      await submit();

      expect(updateCompanyProfile).not.toHaveBeenCalled();
      expect(el.querySelector('#company-name-error')).not.toBeNull();
      expect(document.activeElement).toBe(input('company-name'));
    });

    it('shows a refused save as an inline alert', async () => {
      updateCompanyProfile.mockRejectedValueOnce(new ServiceError('Forbidden'));

      await submit();

      expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe('Forbidden');
      expect(load).not.toHaveBeenCalled();
    });
  });
});
