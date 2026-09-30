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
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ServiceError } from '../../../../core/services/service-error';
import {
  SUPPORT_MESSAGE_MAX,
  SupportRequestDataService,
} from '../../../../data/services/support-request-data.service';

/**
 * FR-20's Contact Admin form. Reachable from both the approved /company layout and the
 * not-approved PendingShell — a pending, rejected or suspended tenant still needs a way to
 * reach Admin. Deliberately write-only: no list of past messages or their status (FR-20
 * Non-Goal: not a ticketing system).
 */
@Component({
  selector: 'app-company-support',
  imports: [ReactiveFormsModule, MatIconModule],
  templateUrl: './company-support.html',
  styleUrl: './support-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanySupport {
  private readonly supportRequests = inject(SupportRequestDataService);
  private readonly injector = inject(Injector);
  private readonly messageField = viewChild<ElementRef<HTMLTextAreaElement>>('messageField');
  private readonly confirmation = viewChild<ElementRef<HTMLElement>>('confirmation');

  public readonly maxLength = SUPPORT_MESSAGE_MAX;
  public readonly sending = signal(false);
  public readonly sent = signal(false);
  public readonly error = signal<string | null>(null);

  public readonly form = inject(FormBuilder).nonNullable.group({
    message: ['', [Validators.required, Validators.maxLength(SUPPORT_MESSAGE_MAX)]],
  });

  public messageInvalid(): boolean {
    const control = this.form.controls.message;
    return control.invalid && control.touched;
  }

  public async submit(): Promise<void> {
    if (this.sending()) return;
    const message = this.form.controls.message.value.trim();
    if (this.form.invalid || message.length === 0) {
      this.form.controls.message.setErrors({ required: true });
      this.form.markAllAsTouched();
      this.messageField()?.nativeElement.focus();
      return;
    }

    this.sending.set(true);
    this.error.set(null);
    try {
      await this.supportRequests.submitQuestion(message);
      this.form.reset();
      this.sent.set(true);
      this.focusAfterRender(() => this.confirmation()?.nativeElement);
    } catch (err) {
      this.error.set(err instanceof ServiceError ? err.message : "Couldn't send your message.");
    } finally {
      this.sending.set(false);
    }
  }

  public startAnother(): void {
    this.sent.set(false);
    this.focusAfterRender(() => this.messageField()?.nativeElement);
  }

  private focusAfterRender(target: () => HTMLElement | undefined): void {
    afterNextRender(() => target()?.focus(), { injector: this.injector });
  }
}
