import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ServiceError } from '../../../../../core/services/service-error';
import {
  SUPPORT_EMAIL_MAX,
  SUPPORT_EMAIL_PATTERN,
  SUPPORT_MESSAGE_MAX,
  SUPPORT_TENANT_NAME_MAX,
  SupportRequestDataService,
} from '../../../../../data/services/support-request-data.service';

type DisputeField = 'email' | 'tenantName' | 'message';

const FIELD_IDS: Record<DisputeField, string> = {
  email: 'dispute-email',
  tenantName: 'dispute-tenant',
  message: 'dispute-message',
};

/**
 * FR-20's public dispute form — the one form reachable with no session and no tenant, since a
 * suspension blocks login and so also blocks the authenticated Contact Admin form. The success
 * message is the same whether or not the email/company exists (the Function never checks).
 */
@Component({
  selector: 'app-company-dispute',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule, NgOptimizedImage],
  templateUrl: './company-dispute.html',
  styleUrls: ['../support-form.scss', './company-dispute.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyDispute {
  private readonly supportRequests = inject(SupportRequestDataService);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');
  private readonly confirmation = viewChild<ElementRef<HTMLElement>>('confirmation');

  public readonly maxLength = {
    email: SUPPORT_EMAIL_MAX,
    tenantName: SUPPORT_TENANT_NAME_MAX,
    message: SUPPORT_MESSAGE_MAX,
  };
  public readonly sending = signal(false);
  public readonly sent = signal(false);
  public readonly error = signal<string | null>(null);

  public readonly form = inject(FormBuilder).nonNullable.group({
    email: [
      '',
      [
        Validators.required,
        Validators.maxLength(SUPPORT_EMAIL_MAX),
        Validators.pattern(SUPPORT_EMAIL_PATTERN),
      ],
    ],
    tenantName: ['', [Validators.required, Validators.maxLength(SUPPORT_TENANT_NAME_MAX)]],
    message: ['', [Validators.required, Validators.maxLength(SUPPORT_MESSAGE_MAX)]],
  });

  constructor() {
    afterNextRender(() => this.heading().nativeElement.focus());
  }

  public invalid(field: DisputeField): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  public async submit(): Promise<void> {
    if (this.sending()) return;
    const value = this.form.getRawValue();
    const dispute = {
      email: value.email.trim(),
      tenantName: value.tenantName.trim(),
      message: value.message.trim(),
    };
    for (const field of ['tenantName', 'message'] as const) {
      if (dispute[field].length === 0) this.form.controls[field].setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.focusFirstInvalid();
      return;
    }

    this.sending.set(true);
    this.error.set(null);
    try {
      await this.supportRequests.submitDispute(dispute);
      this.form.reset();
      this.sent.set(true);
      afterNextRender(() => this.confirmation()?.nativeElement.focus(), {
        injector: this.injector,
      });
    } catch (err) {
      this.error.set(err instanceof ServiceError ? err.message : "Couldn't send your message.");
    } finally {
      this.sending.set(false);
    }
  }

  private focusFirstInvalid(): void {
    const field = (Object.keys(FIELD_IDS) as DisputeField[]).find(
      (name) => this.form.controls[name].invalid,
    );
    if (!field) return;
    this.host.nativeElement.querySelector<HTMLElement>(`#${FIELD_IDS[field]}`)?.focus();
  }
}
