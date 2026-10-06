import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { TenantService } from '../../../../data/services/tenant.service';
import { tabIndexForKey } from '../../../../utils/tabs.util';
import { ProfileSettings } from '../profile-settings/profile-settings';
import { CompanySettings } from '../company-settings/company-settings';
import { AppearanceSettings } from '../appearance-settings/appearance-settings';

export type SettingsTab = 'profile' | 'company' | 'appearance';

interface TabDef {
  readonly id: SettingsTab;
  readonly label: string;
}

const PROFILE_TAB: TabDef = { id: 'profile', label: 'My profile' };
const COMPANY_TAB: TabDef = { id: 'company', label: 'Company' };
const APPEARANCE_TAB: TabDef = { id: 'appearance', label: 'Appearance' };

/**
 * One Settings page for every company user, served at /company/settings and
 * /organizer/settings. Sections are tabs in component state, not child routes. The Company
 * tab exists only for the Organizer tier — Operators can't read their Tenant row.
 */
@Component({
  selector: 'app-settings-page',
  imports: [ProfileSettings, CompanySettings, AppearanceSettings],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  private readonly tenantService = inject(TenantService);
  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  public readonly activeTab = signal<SettingsTab>('profile');
  public readonly tabs = computed<readonly TabDef[]>(() =>
    this.isOrganizerTier()
      ? [PROFILE_TAB, COMPANY_TAB, APPEARANCE_TAB]
      : [PROFILE_TAB, APPEARANCE_TAB],
  );

  private readonly isOrganizerTier = computed(() => {
    const role = this.tenantService.context()?.membership.role;
    return role === 'super_organizer' || role === 'organizer';
  });

  public selectTab(tab: SettingsTab): void {
    this.activeTab.set(tab);
  }

  public onTabKeydown(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    const next = tabIndexForKey(event.key, index, tabs.length);
    if (next === undefined) return;
    event.preventDefault();
    this.selectTab(tabs[next].id);
    this.tabButtons()[next]?.nativeElement.focus();
  }
}
