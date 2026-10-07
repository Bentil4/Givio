import { TestBed } from '@angular/core/testing';
import { EventDataService } from './event-data.service';
import { DATABASES } from '../../core/appwrite/client';
import { appDb } from '../dexie/app-db';
import { makeEvent } from './donation-data-test-fixtures';

/** The Operator's server pull of the Events they're assigned to, with an offline fallback. */
describe('EventDataService', () => {
  let service: EventDataService;
  let databases: { listRows: ReturnType<typeof vi.fn>; createRow: ReturnType<typeof vi.fn> };

  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    $id: 'remote-1',
    name: 'Remote Event',
    type: 'wedding',
    date: '2026-03-01',
    hostName: 'Host',
    status: 'active',
    assignedUserIds: ['op-1'],
    createdBy: 'org-1',
    nextReceiptSeq: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(async () => {
    databases = { listRows: vi.fn(), createRow: vi.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: DATABASES, useValue: databases }] });
    service = TestBed.inject(EventDataService);
    await appDb.events.clear();
  });

  afterEach(() => appDb.events.clear());

  it('hydrates Dexie from Appwrite and returns the merged local list', async () => {
    databases.listRows.mockResolvedValueOnce({ total: 1, rows: [makeRow()] });

    const events = await service.listEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: 'remote-1', name: 'Remote Event' });
    expect(await appDb.events.get('remote-1')).toMatchObject({ name: 'Remote Event' });
  });

  it('follows the cursor past a full first page', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeRow({ $id: `e${i}` }));
    databases.listRows
      .mockResolvedValueOnce({ total: 101, rows: page1 })
      .mockResolvedValueOnce({ total: 101, rows: [makeRow({ $id: 'e100' })] });

    const events = await service.listEvents();

    expect(events).toHaveLength(101);
    expect(databases.listRows).toHaveBeenCalledTimes(2);
  });

  it('falls back to the local list when the remote fetch fails', async () => {
    await appDb.events.put(makeEvent({ id: 'local-only' }));
    databases.listRows.mockRejectedValueOnce(new Error('offline'));

    const events = await service.listEvents();

    expect(events.map((e) => e.id)).toEqual(['local-only']);
  });

  it('AD-12 amended: never writes an audit entry — reads of Events are not access-logged any more', async () => {
    databases.listRows.mockResolvedValueOnce({ total: 1, rows: [makeRow()] });

    await service.listEvents();

    expect(databases.createRow).not.toHaveBeenCalled();
  });
});
