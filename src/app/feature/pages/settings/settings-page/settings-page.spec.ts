import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../../data/services/auth.service';
import { AccountSettingsService } from '../../../../data/services/account-settings.service';
import { TenantDataService } from '../../../../data/services/tenant-data.service';
import { CompanyContext, TenantService } from '../../../../data/services/tenant.service';
import type { MembershipRole } from '../../../../data/models/membership';
import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  async function renderAs(role: MembershipRole | null) {
    const context = signal(role ? ({ membership: { role } } as CompanyContext) : null);
    TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        { provide: TenantService, useValue: { context, tenant: signal(null) } },
        { provide: AuthService, useValue: { currentUser: () => ({ name: 'Ama', phone: '' }) } },
        { provide: AccountSettingsService, useValue: {} },
        { provide: TenantDataService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const tabs = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const tabLabels = (el: HTMLElement) => tabs(el).map((tab) => tab.textContent?.trim());

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('gives an Operator no Company tab', async () => {
    const { el } = await renderAs('operator');

    expect(tabLabels(el)).toEqual(['My profile', 'Appearance']);
  });

  it('gives a person with no company context no Company tab', async () => {
    const { el } = await renderAs(null);

    expect(tabLabels(el)).toEqual(['My profile', 'Appearance']);
  });

  for (const role of ['super_organizer', 'organizer'] as const) {
    it(`gives a ${role} the Company tab`, async () => {
      const { el } = await renderAs(role);

      expect(tabLabels(el)).toEqual(['My profile', 'Company', 'Appearance']);
    });
  }

  it('opens on My profile, selected and labelling its panel', async () => {
    const { el } = await renderAs('organizer');

    const [profileTab, companyTab] = tabs(el);
    expect(profileTab.getAttribute('aria-selected')).toBe('true');
    expect(profileTab.tabIndex).toBe(0);
    expect(companyTab.getAttribute('aria-selected')).toBe('false');
    expect(companyTab.tabIndex).toBe(-1);
    const panel = el.querySelector('[role="tabpanel"]');
    expect(panel?.getAttribute('aria-labelledby')).toBe(profileTab.id);
    expect(panel?.querySelector('app-profile-settings')).not.toBeNull();
  });

  it('switches the panel when a tab is clicked', async () => {
    const { fixture, el } = await renderAs('super_organizer');

    tabs(el)[1].click();
    fixture.detectChanges();

    expect(tabs(el)[1].getAttribute('aria-selected')).toBe('true');
    expect(el.querySelector('[role="tabpanel"] app-company-settings')).not.toBeNull();
    expect(el.querySelector('app-profile-settings')).toBeNull();
  });

  it('moves between tabs with the arrow keys and focuses the new tab', async () => {
    const { fixture, el } = await renderAs('operator');

    tabs(el)[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();

    expect(tabs(el)[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs(el)[1]);
    expect(el.querySelector('app-appearance-settings')).not.toBeNull();
  });
});
