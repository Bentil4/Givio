import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EVENT_STATUS_CHIP, type Event, type EventStatus } from '../../../../data/models/event';
import { SkeletonRows } from '../../../../shared/components/skeleton-rows/skeleton-rows';

/** A glance at the Operator's assigned Events; /organizer/events is the full picker. */
@Component({
  selector: 'app-operator-events-panel',
  imports: [RouterLink, SkeletonRows],
  templateUrl: './operator-events-panel.html',
  styleUrl: './operator-events-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperatorEventsPanel {
  public readonly events = input.required<readonly Event[]>();
  public readonly loading = input(false);
  public readonly loadError = input<string | null>(null);

  protected readonly chipClass = EVENT_STATUS_CHIP;

  protected eventMeta(event: Event): string {
    const type = capitalize(event.type);
    return event.venue ? `${type} · ${event.date} · ${event.venue}` : `${type} · ${event.date}`;
  }

  protected statusLabel(status: EventStatus): string {
    return capitalize(status);
  }
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
