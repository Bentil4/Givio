import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { MatIconModule } from '@angular/material/icon';
import { OrganizerEventDataService } from '../../../../../data/services/organizer-event-data.service';
import { ServiceError } from '../../../../../core/services/service-error';
import { EVENT_STATUS_CHIP, type Event } from '../../../../../data/models/event';
import { STATUS_ACTIONS, statusLabel, type StatusAction } from '../event-status-actions';
import { EventOperators } from '../event-operators/event-operators';

/**
 * Manage one company Event: its status lifecycle (Story 2.2's transitions), its Operators and
 * its family access code (Story 2.4 — regenerating is FR-16's leak recovery). Never optimistic:
 * the Event is only updated with what the Function returned.
 */
@Component({
  selector: 'app-event-manage-dialog',
  imports: [CdkTrapFocus, MatIconModule, EventOperators],
  templateUrl: './event-manage-dialog.html',
  styleUrl: './event-manage-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventManageDialog {
  private readonly eventData = inject(OrganizerEventDataService);

  public readonly event = input.required<Event>();
  public readonly changed = output<Event>();
  public readonly dismissed = output<void>();

  public readonly busy = signal(false);
  public readonly actionError = signal<string | null>(null);
  public readonly codeNotice = signal<string | null>(null);
  public readonly chipClass = EVENT_STATUS_CHIP;
  public readonly statusLabel = statusLabel;
  public readonly statusActions = computed(() => STATUS_ACTIONS[this.event().status]);
  public readonly codeActionLabel = computed(() =>
    this.event().accessCode ? 'Regenerate code' : 'Generate code',
  );

  public changeStatus(action: StatusAction): Promise<void> {
    return this.runAction(async () => {
      this.changed.emit(await this.eventData.setEventStatus(this.event().id, action.to));
    }, "We couldn't change the event's status");
  }

  public regenerateCode(): Promise<void> {
    const hadCode = Boolean(this.event().accessCode);
    return this.runAction(async () => {
      const accessCode = await this.eventData.regenerateAccessCode(this.event().id);
      this.changed.emit({ ...this.event(), accessCode });
      this.codeNotice.set(
        hadCode ? 'New code ready — the old one no longer works.' : 'Code ready.',
      );
    }, "We couldn't generate a family code");
  }

  public onOperatorsAssigned(assignedUserIds: string[]): void {
    this.changed.emit({ ...this.event(), assignedUserIds });
  }

  private async runAction(action: () => Promise<void>, fallback: string): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    this.codeNotice.set(null);
    try {
      await action();
    } catch (err) {
      this.actionError.set(err instanceof ServiceError ? err.message : fallback);
    } finally {
      this.busy.set(false);
    }
  }
}
