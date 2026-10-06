import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TenantDataService } from '../../../../data/services/tenant-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import type { CompanyProfile } from '../../../../data/models/tenant';
import { ImageUpload } from '../../../../shared/components/image-upload/image-upload';
import { normalizePhone, phoneValidator } from '../../../../utils/phone.util';
import { SaveState, readyToSave, showsError } from '../settings-form';

// Same limit the Function enforces on a Tenant's name and location (TENANT_TEXT_MAX).
const COMPANY_TEXT_MAX = 128;
// Sidebar-sized: well under the Function's 200,000-character logo limit even as a PNG.
const LOGO_MAX_DIMENSION = 256;
const COMPANY_TEXT = [
  Validators.required,
  Validators.pattern(/\S/),
  Validators.maxLength(COMPANY_TEXT_MAX),
];

/**
 * Settings → Company: the company's name, location, contact phone and logo. Every
 * Organizer-tier member sees them; only the Super Organizer may change them, and the Function
 * refuses anyone else whatever this screen renders.
 */
@Component({
  selector: 'app-company-settings',
  imports: [ReactiveFormsModule, ImageUpload],
  templateUrl: './company-settings.html',
  styleUrl: '../settings-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanySettings {
  private readonly tenantService = inject(TenantService);
  private readonly tenantData = inject(TenantDataService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly showsError = showsError;
  protected readonly logoMaxDimension = LOGO_MAX_DIMENSION;
  public readonly tenant = this.tenantService.tenant;
  public readonly canEdit = computed(
    () => this.tenantService.context()?.membership.role === 'super_organizer',
  );
  public readonly save = new SaveState();

  public readonly form = this.formBuilder.nonNullable.group({
    name: [this.tenant()?.name ?? '', COMPANY_TEXT],
    location: [this.tenant()?.location ?? '', COMPANY_TEXT],
    contactPhone: [this.tenant()?.contactPhone ?? '', phoneValidator],
    logo: this.formBuilder.control<string | null>(this.tenant()?.logo ?? null),
  });

  public async saveProfile(formElement: HTMLFormElement): Promise<void> {
    if (!readyToSave(this.form, this.save, formElement)) return;
    await this.save.run(() => this.persist(this.profileFromForm()), 'Company details saved.');
  }

  private async persist(profile: CompanyProfile): Promise<void> {
    await this.tenantData.updateCompanyProfile(profile);
    // Refreshes the sidebar brand; already saved, so a failed re-read isn't reported as one.
    await this.tenantService.load(true).catch(() => null);
  }

  private profileFromForm(): CompanyProfile {
    const { name, location, contactPhone, logo } = this.form.getRawValue();
    const phone = normalizePhone(contactPhone);
    return {
      name: name.trim(),
      location: location.trim(),
      contactPhone: phone === '' ? null : phone,
      // An untouched logo isn't re-sent: no need to upload the same image again.
      ...(this.form.controls.logo.dirty ? { logo } : {}),
    };
  }
}
