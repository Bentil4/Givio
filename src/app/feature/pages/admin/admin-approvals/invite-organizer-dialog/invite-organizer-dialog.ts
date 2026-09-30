import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ServiceError } from '../../../../../core/services/service-error';
import {
  TenantDataService,
  type InviteOrganizerResult,
} from '../../../../../data/services/tenant-data.service';
import {
  TENANT_SIZES,
  TENANT_SIZE_LABELS,
  TENANT_TYPES,
  TENANT_TYPE_LABELS,
  type TenantSize,
  type TenantType,
} from '../../../../../data/models/tenant';
import { normalizePhone, phoneValidator } from '../../../../../utils/phone.util';

export interface OrganizerInvited {
  readonly name: string;
  readonly companyName: string;
  readonly result: InviteOrganizerResult;
}

type InviteControl =
  | 'name'
  | 'email'
  | 'contactPhone'
  | 'companyName'
  | 'location'
  | 'size'
  | 'type'
  | 'estimatedUserCount';

/**
 * FR-6 path (a): Admin vouches for the company, so the invite skips the approval queue and
 * lands as an already-approved Tenant. Same intake fields and limits as the signup wizard.
 */
@Component({
  selector: 'app-invite-organizer-dialog',
  imports: [ReactiveFormsModule, CdkTrapFocus],
  templateUrl: './invite-organizer-dialog.html',
  styleUrl: './invite-organizer-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InviteOrganizerDialog {
  private readonly fb = inject(FormBuilder);
  private readonly tenantData = inject(TenantDataService);

  public readonly invited = output<OrganizerInvited>();
  public readonly closed = output<void>();

  public readonly busy = signal(false);
  public readonly formError = signal<string | null>(null);

  public readonly sizeOptions = TENANT_SIZES.map((value) => ({
    value,
    label: TENANT_SIZE_LABELS[value],
  }));
  public readonly typeOptions = TENANT_TYPES.map((value) => ({
    value,
    label: TENANT_TYPE_LABELS[value],
  }));

  public readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    contactPhone: ['', phoneValidator],
    companyName: ['', [Validators.required, Validators.maxLength(128)]],
    location: ['', [Validators.required, Validators.maxLength(128)]],
    size: ['' as TenantSize | '', Validators.required],
    type: ['' as TenantType | '', Validators.required],
    estimatedUserCount: [
      '',
      [Validators.required, Validators.min(1), Validators.max(100000), Validators.pattern(/^\d+$/)],
    ],
  });

  public invalid(control: InviteControl): boolean {
    const c = this.form.controls[control];
    return c.invalid && (c.touched || c.dirty);
  }

  public close(): void {
    if (!this.busy()) {
      this.closed.emit();
    }
  }

  public async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, contactPhone, companyName, location, size, type, estimatedUserCount } =
      this.form.getRawValue();
    const phone = normalizePhone(contactPhone);
    if (!size || !type) {
      return;
    }
    this.busy.set(true);
    this.formError.set(null);
    try {
      const result = await this.tenantData.inviteOrganizer({
        name: name.trim(),
        email: email.trim(),
        company: {
          name: companyName.trim(),
          location: location.trim(),
          size,
          type,
          estimatedUserCount: Number(estimatedUserCount),
          ...(phone ? { contactPhone: phone } : {}),
        },
      });
      this.invited.emit({ name: name.trim(), companyName: companyName.trim(), result });
    } catch (err) {
      this.formError.set(err instanceof ServiceError ? err.message : 'Something went wrong');
    } finally {
      this.busy.set(false);
    }
  }
}
