import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { EVENT_STATUS_CHIP } from '../../../../data/models/event';
import { SkeletonRows } from '../../../../shared/components/skeleton-rows/skeleton-rows';
import { formatCedis } from '../../../../utils/donation.util';
import { statusLabel } from '../company-events/event-status-actions';
import { countLabel, type EventTotalRow } from './company-totals.util';

interface EventTotalRowView {
  readonly id: string;
  readonly name: string;
  readonly statusLabel: string;
  readonly chipClass: string;
  readonly state: EventTotalRow['figures']['status'];
  readonly totalLabel: string;
  readonly donorLabel: string;
}

/** The per-Event breakdown under the consolidated total, one row per running Event. */
@Component({
  selector: 'app-event-totals-list',
  imports: [RouterLink, MatIconModule, SkeletonRows],
  templateUrl: './event-totals-list.html',
  styleUrl: './event-totals-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventTotalsList {
  public readonly rows = input.required<readonly EventTotalRow[]>();
  public readonly loading = input(false);
  public readonly retry = output<string>();

  protected readonly rowViews = computed(() => this.rows().map(toRowView));
}

function toRowView({ event, figures }: EventTotalRow): EventTotalRowView {
  const loaded = figures.status === 'loaded' ? figures.figures : null;
  return {
    id: event.id,
    name: event.name,
    statusLabel: statusLabel(event.status),
    chipClass: EVENT_STATUS_CHIP[event.status],
    state: figures.status,
    totalLabel: loaded ? formatCedis(loaded.totalMinor) : '',
    donorLabel: loaded ? countLabel(loaded.donorCount, 'donor') : '',
  };
}
