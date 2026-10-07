import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi, type Mock } from 'vitest';
import { createFakeCharts, type FakeCharts } from '../../../../../testing/fake-chart';
import { makeEvent } from '../../../../data/services/donation-data-test-fixtures';
import { AuthService } from '../../../../data/services/auth.service';
import { OrganizerEventDataService } from '../../../../data/services/organizer-event-data.service';
import { SettlementDataService } from '../../../../data/services/settlement-data.service';
import { TeamDataService } from '../../../../data/services/team-data.service';
import { TenantService } from '../../../../data/services/tenant.service';
import {
  TenantTotalsDataService,
  type TenantChangeListeners,
} from '../../../../data/services/tenant-totals-data.service';

/** Stubbed backends for the company dashboard specs, which are split by responsibility. */
export interface DashboardBackend {
  listTenantEvents: Mock;
  loadEventFigures: Mock;
  stopListening: Mock;
  loadTenantSettlementData: Mock;
  listTeamMembersIncludingRevoked: Mock;
  charts: FakeCharts;
  /** Set once the live store subscribes to Realtime. */
  listeners: TenantChangeListeners | null;
}

export const DASHBOARD_USER_ID = 'so-1';

export function setUpCompanyDashboard(): DashboardBackend {
  const backend = createBackend();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      backend.charts.provider,
      { provide: OrganizerEventDataService, useValue: backend },
      { provide: SettlementDataService, useValue: backend },
      { provide: TeamDataService, useValue: backend },
      { provide: TenantTotalsDataService, useValue: totalsService(backend) },
      { provide: AuthService, useValue: { currentUser: signal({ $id: DASHBOARD_USER_ID }) } },
      { provide: TenantService, useValue: tenantService() },
    ],
  });
  return backend;
}

export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

function createBackend(): DashboardBackend {
  return {
    listTenantEvents: vi.fn(),
    loadEventFigures: vi.fn(),
    stopListening: vi.fn(),
    // Not a first run by default, so the insights sections render.
    loadTenantSettlementData: vi.fn().mockResolvedValue({ events: [makeEvent()], donations: [] }),
    listTeamMembersIncludingRevoked: vi.fn().mockResolvedValue([]),
    charts: createFakeCharts(),
    listeners: null,
  };
}

function totalsService(backend: DashboardBackend) {
  return {
    loadEventFigures: backend.loadEventFigures,
    subscribeToTenantChanges: vi.fn(async (given: TenantChangeListeners) => {
      backend.listeners = given;
      return backend.stopListening;
    }),
  };
}

function tenantService() {
  return {
    tenant: signal({ name: 'Odoi Services' }),
    context: signal({ membership: { tenantId: 'tenant-a' } }),
  };
}
