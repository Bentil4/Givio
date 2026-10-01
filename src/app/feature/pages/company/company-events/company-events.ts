import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { OrganizerEventDataService } from '../../../../data/services/organizer-event-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import { ServiceError } from '../../../../core/services/service-error';
import { EVENT_STATUS_CHIP, type Event } from '../../../../data/models/event';
import { EventFormDialog } from './event-form-dialog/event-form-dialog';
import { EventManageDialog } from './event-manage-dialog/event-manage-dialog';
import { statusLabel } from './event-status-actions';

/**
 * /company/events (Story 6.7): an approved tenant's Super Organizer or co-Organizer creates
 * and manages the company's own Events. Create/edit and manage are dialogs, not routes. Every
 * write goes through the Function, which scopes it to the caller's own Tenant — this page only
 * reflects what the server accepted.
 */
@Component({
  selector: 'app-company-events',
  imports: [MatIconModule, DatePipe, TitleCasePipe, EventFormDialog, EventManageDialog],
  templateUrl: './company-events.html',
  styleUrl: './company-events.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanyEvents implements OnInit {
  private readonly eventData = inject(OrganizerEventDataService);
  private readonly tenantService = inject(TenantService);

  private readonly events = signal<readonly Event[]>([]);
  private readonly managingId = signal<string | null>(null);
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly editing = signal<Event | 'new' | null>(null);
  public readonly chipClass = EVENT_STATUS_CHIP;
  public readonly statusLabel = statusLabel;
  public readonly skeletons = [0, 1, 2];

  public readonly sortedEvents = computed(() =>
    [...this.events()].sort((a, b) => b.date.localeCompare(a.date)),
  );
  public readonly isEmpty = computed(
    () => !this.loading() && this.loadError() === null && this.events().length === 0,
  );
  public readonly managing = computed(
    () => this.events().find((e) => e.id === this.managingId()) ?? null,
  );
  public readonly editingEvent = computed(() => {
    const editing = this.editing();
    return editing === 'new' ? null : editing;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.events.set(await this.eventData.listTenantEvents(this.tenantId()));
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(
        err instanceof ServiceError ? err.message : "We couldn't load your events",
      );
    } finally {
      this.loading.set(false);
    }
  }

  public openCreate(): void {
    this.editing.set('new');
  }

  public openEdit(event: Event): void {
    this.editing.set(event);
  }

  public closeForm(): void {
    this.editing.set(null);
  }

  public onSaved(event: Event): void {
    this.replaceOrAddEvent(event);
    this.closeForm();
  }

  public openManage(event: Event): void {
    this.managingId.set(event.id);
  }

  public closeManage(): void {
    this.managingId.set(null);
  }

  public replaceOrAddEvent(event: Event): void {
    this.events.update((list) => [...list.filter((e) => e.id !== event.id), event]);
  }

  private tenantId(): string {
    const tenantId = this.tenantService.context()?.membership.tenantId;
    if (!tenantId) {
      throw new ServiceError("We couldn't find your company");
    }
    return tenantId;
  }
}
