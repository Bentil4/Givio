import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ServiceError } from '../../../../core/services/service-error';
import { TenantLifecycleDataService } from '../../../../data/services/tenant-lifecycle-data.service';
import type { Tenant } from '../../../../data/models/tenant';
import {
  TENANT_STATUS_FILTERS,
  TENANT_STATUS_LABELS,
  TENANT_STATUS_TAGS,
  filterLabel,
  type TenantAction,
  type TenantActionFailure,
  type TenantStatusFilter,
} from './tenant-status';
import { TenantDrawer } from './tenant-drawer/tenant-drawer';
import { TenantActionConfirm } from './tenant-action-confirm/tenant-action-confirm';

const FAILURE_LEADS: Record<TenantAction, string> = {
  suspend: "The suspension wasn't confirmed, so some members may still have access.",
  reinstate: "The reinstatement wasn't confirmed, so some members may still be locked out.",
};

function failureMessage(action: TenantAction, err: unknown): string {
  const detail = err instanceof ServiceError ? ` ${err.message}.` : '';
  return `${FAILURE_LEADS[action]}${detail} Retry to finish it.`;
}

function successMessage(action: TenantAction, tenant: Tenant): string {
  return action === 'suspend'
    ? `${tenant.name} suspended. Every member has been signed out and has lost access.`
    : `${tenant.name} reinstated. Its team has the same access as before.`;
}

/**
 * Story 8.1 (FR-19): every tenant account, with suspend/reinstate and Super Organizer
 * designation in a detail drawer. Never optimistic — a suspension is only reported once the
 * Function confirms the grant sweep and every member's sign-out; anything else shows FAILED.
 */
@Component({
  selector: 'app-admin-tenants',
  imports: [DatePipe, MatIconModule, TenantDrawer, TenantActionConfirm],
  templateUrl: './admin-tenants.html',
  styleUrl: './admin-tenants.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTenants implements OnInit {
  private readonly lifecycleData = inject(TenantLifecycleDataService);
  private readonly injector = inject(Injector);
  private readonly drawer = viewChild(TenantDrawer);

  public readonly tenants = signal<readonly Tenant[]>([]);
  public readonly loading = signal(true);
  public readonly loadError = signal<string | null>(null);
  public readonly statusFilter = signal<TenantStatusFilter>('all');
  public readonly selectedId = signal<string | null>(null);
  public readonly confirming = signal<TenantAction | null>(null);
  public readonly working = signal(false);
  public readonly failure = signal<TenantActionFailure | null>(null);
  public readonly notice = signal('');

  public readonly filters = TENANT_STATUS_FILTERS;
  public readonly filterLabel = filterLabel;
  public readonly statusLabels = TENANT_STATUS_LABELS;
  public readonly statusTags = TENANT_STATUS_TAGS;
  public readonly skeletons = [0, 1, 2];

  public readonly visibleTenants = computed(() => {
    const filter = this.statusFilter();
    const tenants = this.tenants();
    return filter === 'all' ? tenants : tenants.filter((t) => t.status === filter);
  });

  public readonly emptyCopy = computed(() => {
    const filter = this.statusFilter();
    return filter === 'all'
      ? 'Organizer companies appear here once they apply or are invited.'
      : `No company is ${TENANT_STATUS_LABELS[filter].toLowerCase()} right now.`;
  });

  public readonly selectedTenant = computed(
    () => this.tenants().find((t) => t.id === this.selectedId()) ?? null,
  );

  public readonly selectedFailure = computed(() => {
    const failure = this.failure();
    return failure?.tenantId === this.selectedId() ? failure : null;
  });

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      await this.refresh();
    } finally {
      this.loading.set(false);
    }
  }

  /** Re-reads in place, so an open drawer keeps its state. */
  async refresh(): Promise<void> {
    try {
      this.tenants.set(await this.lifecycleData.listTenants());
      this.loadError.set(null);
    } catch (err) {
      this.loadError.set(err instanceof ServiceError ? err.message : 'Failed to load companies');
    }
  }

  public setFilter(filter: TenantStatusFilter): void {
    this.statusFilter.set(filter);
  }

  public open(tenant: Tenant): void {
    this.notice.set('');
    this.selectedId.set(tenant.id);
  }

  public closeDrawer(): void {
    if (!this.working()) {
      this.selectedId.set(null);
      this.confirming.set(null);
    }
  }

  public ask(action: TenantAction): void {
    this.confirming.set(action);
  }

  public dismissConfirm(): void {
    this.confirming.set(null);
  }

  public async confirmAction(): Promise<void> {
    const action = this.confirming();
    this.confirming.set(null);
    if (action) {
      await this.run(action);
    }
  }

  /** Also the retry: the same call re-runs the sweep and sign-out on an already-moved tenant. */
  public async run(action: TenantAction): Promise<void> {
    const tenant = this.selectedTenant();
    if (!tenant) {
      return;
    }
    this.working.set(true);
    this.failure.set(null);
    await this.perform(action, tenant);
    this.working.set(false);
    await this.refresh();
    afterNextRender(() => this.drawer()?.focusResult(), { injector: this.injector });
  }

  private async perform(action: TenantAction, tenant: Tenant): Promise<void> {
    try {
      await (action === 'suspend'
        ? this.lifecycleData.suspendTenant(tenant.id)
        : this.lifecycleData.reinstateTenant(tenant.id));
      this.notice.set(successMessage(action, tenant));
    } catch (err) {
      this.notice.set('');
      this.failure.set({ tenantId: tenant.id, action, message: failureMessage(action, err) });
    }
  }
}
