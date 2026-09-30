import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ServiceError } from '../../../../../core/services/service-error';
import {
  TenantDataService,
  type TenantVerification,
  type VerificationDocument,
} from '../../../../../data/services/tenant-data.service';
import {
  TENANT_SIZE_LABELS,
  TENANT_TYPE_LABELS,
  type TenantSize,
  type TenantType,
} from '../../../../../data/models/tenant';
import type { ApplicationView } from '../application-view';

type DocumentState =
  | { readonly kind: 'idle' | 'loading' | 'missing' | 'error' }
  | { readonly kind: 'ready'; readonly document: VerificationDocument };

/**
 * One pending application (UX-DR5): collapsed by default, expanding inline rather than to a
 * detail page because the review is a single sitting. Owns the verification step itself;
 * the Approve/Reject decisions go up to the page, which confirms and re-reads the queue.
 */
@Component({
  selector: 'app-application-row',
  imports: [DatePipe, MatIconModule, ReactiveFormsModule],
  templateUrl: './application-row.html',
  styleUrl: './application-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplicationRow {
  private readonly fb = inject(FormBuilder);
  private readonly injector = inject(Injector);
  private readonly tenantData = inject(TenantDataService);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly details = viewChild<ElementRef<HTMLElement>>('details');
  private readonly verifySection = viewChild<ElementRef<HTMLElement>>('verifySection');

  public readonly application = input.required<ApplicationView>();
  public readonly busy = input(false);
  public readonly error = input<string | null>(null);

  public readonly approve = output<void>();
  public readonly reject = output<void>();
  public readonly verified = output<TenantVerification>();

  public readonly expanded = signal(false);
  public readonly documentState = signal<DocumentState>({ kind: 'idle' });
  public readonly verifying = signal(false);
  public readonly verifyError = signal<string | null>(null);
  public readonly approveBlocked = signal(false);

  public readonly verifyForm = this.fb.nonNullable.group({
    documentReviewed: [false, Validators.requiredTrue],
    phoneVerified: [false, Validators.requiredTrue],
  });

  public readonly tenant = computed(() => this.application().tenant);
  public readonly readyDocument = computed(() => {
    const state = this.documentState();
    return state.kind === 'ready' ? state.document : null;
  });
  public readonly ids = computed(() => {
    const id = this.tenant().id;
    return {
      trigger: `application-${id}-trigger`,
      details: `application-${id}-details`,
      verify: `application-${id}-verify`,
    };
  });
  public readonly title = computed(() => {
    const { applicantName } = this.application();
    return applicantName ? `${applicantName} — ${this.tenant().name}` : this.tenant().name;
  });
  public readonly isVerified = computed(() => {
    const { verifiedBy, verifiedAt } = this.tenant();
    return !!verifiedBy && !!verifiedAt;
  });
  public readonly sizeLabel = computed(
    () => TENANT_SIZE_LABELS[this.tenant().size as TenantSize] ?? this.tenant().size,
  );
  public readonly typeLabel = computed(
    () => TENANT_TYPE_LABELS[this.tenant().type as TenantType] ?? this.tenant().type,
  );

  public toggle(): void {
    if (this.expanded()) {
      this.collapse();
    } else {
      this.expand(() => this.details()?.nativeElement.focus());
    }
  }

  public collapse(): void {
    this.expanded.set(false);
    this.approveBlocked.set(false);
    this.trigger().nativeElement.focus();
  }

  /** Explain, don't silently block: an unverified Approve opens the checks it's waiting on. */
  public onApprove(): void {
    if (this.isVerified()) {
      this.approve.emit();
      return;
    }
    this.approveBlocked.set(true);
    this.expand(() => this.verifySection()?.nativeElement.focus());
  }

  public async recordVerification(): Promise<void> {
    if (this.verifyForm.invalid) {
      this.verifyForm.markAllAsTouched();
      this.verifyError.set('Confirm both checks before recording the verification.');
      return;
    }
    this.verifying.set(true);
    this.verifyError.set(null);
    try {
      const verification = await this.tenantData.recordTenantVerification(this.tenant().id);
      this.approveBlocked.set(false);
      this.verified.emit(verification);
    } catch (err) {
      this.verifyError.set(
        err instanceof ServiceError ? err.message : 'Failed to record the verification',
      );
    } finally {
      this.verifying.set(false);
    }
  }

  public async loadDocument(): Promise<void> {
    const fileId = this.tenant().verificationDocumentId;
    if (!fileId) {
      this.documentState.set({ kind: 'missing' });
      return;
    }
    this.documentState.set({ kind: 'loading' });
    try {
      const document = await this.tenantData.getVerificationDocument(fileId);
      this.documentState.set(document ? { kind: 'ready', document } : { kind: 'missing' });
    } catch {
      this.documentState.set({ kind: 'error' });
    }
  }

  private expand(focusTarget: () => void): void {
    if (!this.expanded()) {
      this.expanded.set(true);
      if (this.documentState().kind === 'idle') {
        void this.loadDocument();
      }
    }
    afterNextRender(focusTarget, { injector: this.injector });
  }
}
