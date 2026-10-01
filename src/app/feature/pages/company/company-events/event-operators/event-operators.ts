import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TeamDataService } from '../../../../../data/services/team-data.service';
import { OrganizerEventDataService } from '../../../../../data/services/organizer-event-data.service';
import { ServiceError } from '../../../../../core/services/service-error';
import type { Event } from '../../../../../data/models/event';
import type { TeamMember } from '../../../../../data/models/team-member';

/**
 * Picks which of the company's own active Operators work an Event. Only this tenant's team is
 * ever listed (listTeamMembers is tenant-scoped by the Function), and the Function re-checks
 * every id on save — another company's Operator can't be assigned even by a direct call.
 */
@Component({
  selector: 'app-event-operators',
  templateUrl: './event-operators.html',
  styleUrl: './event-operators.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventOperators implements OnInit {
  private readonly teamData = inject(TeamDataService);
  private readonly eventData = inject(OrganizerEventDataService);

  public readonly event = input.required<Event>();
  public readonly assigned = output<string[]>();

  public readonly operators = signal<readonly TeamMember[]>([]);
  public readonly selected = signal<ReadonlySet<string>>(new Set());
  public readonly loading = signal(true);
  public readonly busy = signal(false);
  public readonly error = signal<string | null>(null);
  public readonly saved = signal(false);
  public readonly hasOperators = computed(() => this.operators().length > 0);

  ngOnInit(): void {
    this.selected.set(new Set(this.event().assignedUserIds));
    void this.loadOperators();
  }

  public isSelected(userId: string): boolean {
    return this.selected().has(userId);
  }

  public toggle(userId: string): void {
    this.saved.set(false);
    this.selected.update((current) => toggledSet(current, userId));
  }

  public async save(): Promise<void> {
    const ids = [...this.selected()];
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.eventData.assignOperators(this.event().id, ids);
      this.saved.set(true);
      this.assigned.emit(ids);
    } catch (err) {
      this.error.set(errorMessage(err, "We couldn't save the operator assignment"));
    } finally {
      this.busy.set(false);
    }
  }

  private async loadOperators(): Promise<void> {
    try {
      const members = await this.teamData.listTeamMembers();
      this.operators.set(members.filter((m) => m.role === 'operator' && m.status === 'active'));
    } catch (err) {
      this.error.set(errorMessage(err, "We couldn't load your Operators"));
    } finally {
      this.loading.set(false);
    }
  }
}

function toggledSet(current: ReadonlySet<string>, userId: string): ReadonlySet<string> {
  const next = new Set(current);
  if (!next.delete(userId)) {
    next.add(userId);
  }
  return next;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ServiceError ? err.message : fallback;
}
