import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { ServiceError } from '../../../../core/services/service-error';
import type { Event } from '../../../../data/models/event';
import { AuthService } from '../../../../data/services/auth.service';
import { EventService } from '../../../../data/services/event.service';
import { SyncEngineService } from '../../../../data/services/sync-engine.service';
import { TenantService } from '../../../../data/services/tenant.service';
import { PeriodFilter, type ChartCardState } from '../../../../shared/components/dashboard';
import { OperatorEventContext } from '../operator-event-context';
import { minuteClock } from './current-time';
import { MyRecentDonations } from './my-recent-donations';
import { OperatorCharts } from './operator-charts';
import { OperatorDashboardData } from './operator-dashboard-data';
import { OperatorEventsPanel } from './operator-events-panel';
import {
  donationsForPeriod,
  myRecentDonations,
  operatorKpis,
  type OperatorDataState,
  type OperatorInsightSource,
} from './operator-insights.util';
import { OperatorKpiRow } from './operator-kpi-row';
import {
  EMPTY_PERIOD_TEXT,
  OPERATOR_PERIOD_OPTIONS,
  readOperatorPeriod,
  storeOperatorPeriod,
  type OperatorPeriod,
} from './operator-period';

const PREVIEW_EVENT_LIMIT = 3;

/**
 * The Operator's overview: what the desk has raised, what they recorded themselves and what is
 * still waiting to sync, for today, the picked Event or all their Events. Figures come from the
 * Dexie-backed donation reads, so the page still answers offline.
 */
@Component({
  selector: 'app-operator-dashboard',
  imports: [PeriodFilter, OperatorKpiRow, OperatorCharts, MyRecentDonations, OperatorEventsPanel],
  providers: [OperatorDashboardData],
  templateUrl: './operator-dashboard.html',
  styleUrl: './operator-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperatorDashboard implements OnInit {
  private readonly eventService = inject(EventService);
  private readonly router = inject(Router);
  private readonly eventContext = inject(OperatorEventContext);
  private readonly tenantService = inject(TenantService);
  private readonly authService = inject(AuthService);
  private readonly data = inject(OperatorDashboardData);
  private readonly now = minuteClock();

  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);

  public readonly assignedEvents = this.eventContext.assignedEvents;
  public readonly activeEvent = this.eventContext.activeEvent;
  public readonly showSwitcher = this.eventContext.showSwitcher;
  public readonly canRecord = computed(() => this.eventContext.activeEvents().length > 0);
  public readonly companyName = computed(() => this.tenantService.companyBrand()?.name ?? null);
  public readonly previewEvents = computed(() =>
    this.assignedEvents().slice(0, PREVIEW_EVENT_LIMIT),
  );
  public readonly pendingCount = inject(SyncEngineService).pendingCount;

  private readonly userId = computed(() => this.authService.currentUser()?.$id ?? '');
  protected readonly periodOptions = OPERATOR_PERIOD_OPTIONS;
  public readonly period = signal<OperatorPeriod>(readOperatorPeriod(this.userId()));

  /** All assigned Events, or only the picked one unless "All my events" is chosen. */
  private readonly scopeEvents = computed<readonly Event[]>(() => {
    const event = this.activeEvent();
    return this.period() === 'all' || !event ? this.assignedEvents() : [event];
  });
  private readonly scopeEventIds = computed(() => this.scopeEvents().map((e) => e.id), {
    equal: sameIds,
  });
  public readonly scopeText = computed(() => describeScope(this.scopeEvents()));

  public readonly dataState = computed<OperatorDataState>(() =>
    this.loading() ? 'loading' : this.data.state(),
  );
  public readonly insightSource = computed<OperatorInsightSource>(() => ({
    donations: this.data.donations(),
    period: this.period(),
    now: this.now(),
  }));
  public readonly kpis = computed(() => operatorKpis(this.insightSource(), this.userId()));
  public readonly chartState = computed<ChartCardState>(() => {
    const state = this.dataState();
    if (state !== 'ready') return state;
    return this.kpis().donors > 0 ? 'ready' : 'empty';
  });
  public readonly recentDonations = computed(() =>
    myRecentDonations(donationsForPeriod(this.insightSource()), this.userId()),
  );
  public readonly emptyText = computed(() => EMPTY_PERIOD_TEXT[this.period()]);

  constructor() {
    effect(() => {
      if (this.loading()) return;
      const eventIds = this.scopeEventIds();
      untracked(() => void this.data.load(eventIds));
    });
  }

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      await this.eventService.loadEvents();
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Failed to load events');
    } finally {
      this.loading.set(false);
    }
  }

  public choosePeriod(period: OperatorPeriod): void {
    this.period.set(period);
    storeOperatorPeriod(this.userId(), period);
  }

  public retryDonations(): void {
    void this.data.retry();
  }

  public recordDonation(): void {
    const event = this.activeEvent();
    if (event) {
      void this.router.navigate(['/organizer/entry'], { queryParams: { event: event.id } });
      return;
    }
    this.eventContext.requestPick();
  }
}

function describeScope(events: readonly Event[]): string {
  if (events.length === 0) return '';
  if (events.length === 1) return `Every desk at ${events[0].name}`;
  return `Every desk across your ${events.length} events`;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
