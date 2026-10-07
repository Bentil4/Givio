import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import type { SupportRequest } from '../../../../data/models/support-request';
import { relativeTimeSince } from './support-time.util';

const LONG_MESSAGE_LENGTH = 280;
const REPLY_SUBJECT = 'Your message to Givio support';

/** One question or dispute in the Admin inbox, with its reply link and close/reopen action. */
@Component({
  selector: 'app-support-request-card',
  imports: [DatePipe, MatIconModule],
  templateUrl: './support-request-card.html',
  styleUrl: './support-request-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportRequestCard {
  public readonly request = input.required<SupportRequest>();
  public readonly statusToggled = output<SupportRequest>();

  protected readonly expanded = signal(false);
  protected readonly isDispute = computed(() => this.request().type === 'dispute');
  protected readonly typeLabel = computed(() => (this.isDispute() ? 'Dispute' : 'Question'));
  protected readonly isLong = computed(() => this.request().message.length > LONG_MESSAGE_LENGTH);
  protected readonly isClosed = computed(() => this.request().status === 'closed');
  protected readonly company = computed(() => this.request().tenantName ?? 'Unknown company');
  protected readonly relativeTime = computed(() =>
    relativeTimeSince(this.request().createdAt, Date.now()),
  );
  protected readonly sender = computed(() => {
    const { senderName, senderEmail, contactEmail } = this.request();
    return [senderName, senderEmail].filter(Boolean).join(' · ') || contactEmail;
  });
  protected readonly closedBy = computed(() => {
    const { status, closedAt, closedByName } = this.request();
    return status === 'closed' && closedAt ? { at: closedAt, name: closedByName } : null;
  });
  protected readonly replyHref = computed(() => {
    const { contactEmail, senderEmail } = this.request();
    const address = contactEmail ?? senderEmail;
    return address ? `mailto:${address}?subject=${encodeURIComponent(REPLY_SUBJECT)}` : null;
  });

  protected toggleExpanded(): void {
    this.expanded.update((open) => !open);
  }
}
