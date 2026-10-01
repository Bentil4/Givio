import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { EventDataService } from './event-data.service';
import { AuthService } from './auth.service';
import { TenantDataService } from './tenant-data.service';
import { DATABASES, FUNCTIONS } from '../../core/appwrite/client';
import { appDb } from '../dexie/app-db';

/** Shared setup for the EventDataService spec files, which are split by responsibility. */
export interface EventDataTestBed {
  service: EventDataService;
  databases: {
    createRow: ReturnType<typeof vi.fn>;
    updateRow: ReturnType<typeof vi.fn>;
    listRows: ReturnType<typeof vi.fn>;
  };
  functions: { createExecution: ReturnType<typeof vi.fn> };
  tenantDataService: { getMyActiveMembership: ReturnType<typeof vi.fn> };
}

export interface TestUser {
  $id: string;
  labels?: string[];
}

/** `currentUser` is read lazily so a test can swap the signed-in user after setup. */
export async function setUpEventDataService(
  currentUser: () => TestUser,
): Promise<EventDataTestBed> {
  const backend = createEventBackendMocks();
  TestBed.configureTestingModule({
    providers: [
      { provide: DATABASES, useValue: backend.databases },
      { provide: FUNCTIONS, useValue: backend.functions },
      { provide: AuthService, useValue: { currentUser } },
      { provide: TenantDataService, useValue: backend.tenantDataService },
    ],
  });
  const service = TestBed.inject(EventDataService);
  await clearEventTables();
  return { service, ...backend };
}

function createEventBackendMocks(): Omit<EventDataTestBed, 'service'> {
  return {
    databases: { createRow: vi.fn(), updateRow: vi.fn(), listRows: vi.fn() },
    functions: { createExecution: vi.fn() },
    // Story 6.2: no Membership by default — matches today's Admin caller, preserving every
    // pre-existing test's assumptions unchanged (tenantId stays undefined).
    tenantDataService: { getMyActiveMembership: vi.fn().mockResolvedValue(null) },
  };
}

export async function clearEventTables(): Promise<void> {
  await appDb.events.clear();
  await appDb.outbox.clear();
}
