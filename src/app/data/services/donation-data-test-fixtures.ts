import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DonationDataService } from './donation-data.service';
import { AuthService } from './auth.service';
import { DATABASES, FUNCTIONS, REALTIME } from '../../core/appwrite/client';
import { appDb } from '../dexie/app-db';
import type { Event } from '../models/event';

/** Shared setup for the DonationDataService spec files, which are split by responsibility. */
export interface DonationDataTestBed {
  service: DonationDataService;
  functions: { createExecution: ReturnType<typeof vi.fn> };
  databases: {
    listRows: ReturnType<typeof vi.fn>;
    createRow: ReturnType<typeof vi.fn>;
  };
  realtime: { subscribe: ReturnType<typeof vi.fn> };
}

export interface TestUser {
  $id: string;
  labels?: string[];
}

export const makeEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Ama & Kojo',
  type: 'wedding',
  date: '2026-06-01',
  hostName: 'The Mensah Family',
  status: 'active',
  assignedUserIds: ['op-1', 'op-2'],
  createdBy: 'admin-1',
  nextReceiptSeq: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** `currentUser` is read lazily so a test can swap the signed-in user after setup. */
export async function setUpDonationDataService(
  currentUser: () => TestUser,
): Promise<DonationDataTestBed> {
  const backend = createDonationBackendMocks();
  TestBed.configureTestingModule({
    providers: [
      { provide: FUNCTIONS, useValue: backend.functions },
      { provide: DATABASES, useValue: backend.databases },
      { provide: REALTIME, useValue: backend.realtime },
      { provide: AuthService, useValue: { currentUser } },
    ],
  });
  const service = TestBed.inject(DonationDataService);
  await clearDonationTables();
  return { service, ...backend };
}

function createDonationBackendMocks(): Omit<DonationDataTestBed, 'service'> {
  return {
    functions: { createExecution: vi.fn() },
    databases: {
      listRows: vi.fn().mockResolvedValue({ total: 0, rows: [] }),
      createRow: vi.fn().mockResolvedValue({}),
    },
    realtime: {
      subscribe: vi.fn().mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) }),
    },
  };
}

export async function clearDonationTables(): Promise<void> {
  await appDb.events.clear();
  await appDb.donations.clear();
  await appDb.outbox.clear();
}
