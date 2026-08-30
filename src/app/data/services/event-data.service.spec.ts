import { TestBed } from '@angular/core/testing';
import { EventDataService } from './event-data.service';
import { ServiceError } from './service-error';
import { AuthService } from './auth.service';
import { DATABASES, FUNCTIONS } from '../appwrite/client';
import { appDb } from '../dexie/app-db';

describe('EventDataService', () => {
  let service: EventDataService;
  let databases: { createRow: ReturnType<typeof vi.fn>; updateRow: ReturnType<typeof vi.fn> };
  let functions: { createExecution: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    databases = { createRow: vi.fn(), updateRow: vi.fn() };
    functions = { createExecution: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: DATABASES, useValue: databases },
        { provide: FUNCTIONS, useValue: functions },
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ $id: 'admin-1' }) },
        },
      ],
    });
    service = TestBed.inject(EventDataService);
    await appDb.events.clear();
    await appDb.outbox.clear();
  });

  afterEach(async () => {
    await appDb.events.clear();
    await appDb.outbox.clear();
  });

  describe('createEvent', () => {
    it('writes to Dexie and calls createRow with the right shape', async () => {
      databases.createRow.mockResolvedValueOnce({});

      const event = await service.createEvent({
        name: 'Ama & Kojo',
        type: 'wedding',
        date: '2026-06-01',
        hostName: 'The Mensah Family',
      });

      expect(event.status).toBe('active');
      expect(event.assignedUserIds).toEqual([]);
      expect(event.nextReceiptSeq).toBe(0);
      expect(await appDb.events.get(event.id)).toMatchObject({ name: 'Ama & Kojo' });
      expect(databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({
          rowId: event.id,
          data: expect.objectContaining({ status: 'active', assignedUserIds: [], nextReceiptSeq: 0 }),
        }),
      );
    });

    it('still resolves with the created Event when createRow rejects', async () => {
      databases.createRow.mockRejectedValueOnce(new Error('offline'));

      const event = await service.createEvent({
        name: 'Offline Event',
        type: 'funeral',
        date: '2026-07-01',
        hostName: 'The Osei Family',
      });

      expect(event.id).toBeTruthy();
      const pending = (await appDb.outbox.toArray()).filter((e) => e.entityId === event.id);
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('pending');
    });
  });

  describe('updateEvent', () => {
    it('rejects with ServiceError for an unknown id', async () => {
      await expect(service.updateEvent('missing', { name: 'X' })).rejects.toBeInstanceOf(
        ServiceError,
      );
    });

    it('rejects with ServiceError when the target is closed', async () => {
      await appDb.events.put({
        id: 'closed-1',
        name: 'Closed Event',
        type: 'wedding',
        date: '2026-01-01',
        hostName: 'Host',
        status: 'closed',
        assignedUserIds: [],
        createdBy: 'admin-1',
        nextReceiptSeq: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      await expect(service.updateEvent('closed-1', { name: 'X' })).rejects.toBeInstanceOf(
        ServiceError,
      );
    });

    it('writes the merged patch to Dexie and calls updateRow', async () => {
      await appDb.events.put({
        id: 'active-1',
        name: 'Original Name',
        type: 'wedding',
        date: '2026-01-01',
        hostName: 'Host',
        status: 'active',
        assignedUserIds: [],
        createdBy: 'admin-1',
        nextReceiptSeq: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      databases.updateRow.mockResolvedValueOnce({});
      databases.createRow.mockResolvedValueOnce({});

      const updated = await service.updateEvent('active-1', { name: 'New Name' });

      expect(updated.name).toBe('New Name');
      expect((await appDb.events.get('active-1'))?.name).toBe('New Name');
      expect(databases.updateRow).toHaveBeenCalledWith(
        expect.objectContaining({ rowId: 'active-1', data: expect.objectContaining({ name: 'New Name' }) }),
      );
    });

    it('writes an audit log entry only when the sync succeeds, not when it is left pending', async () => {
      await appDb.events.put({
        id: 'active-2',
        name: 'Original Name',
        type: 'wedding',
        date: '2026-01-01',
        hostName: 'Host',
        status: 'active',
        assignedUserIds: [],
        createdBy: 'admin-1',
        nextReceiptSeq: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      // Sync succeeds → audit log written (2nd createRow call, after the update itself).
      databases.updateRow.mockResolvedValueOnce({});
      databases.createRow.mockResolvedValueOnce({});
      await service.updateEvent('active-2', { name: 'Synced Update' });
      expect(databases.createRow).toHaveBeenCalledTimes(1);

      // Sync fails (offline) → audit log is skipped entirely.
      databases.createRow.mockClear();
      databases.updateRow.mockRejectedValueOnce(new Error('offline'));
      await service.updateEvent('active-2', { name: 'Pending Update' });
      expect(databases.createRow).not.toHaveBeenCalled();
    });
  });

  describe('assignOperators', () => {
    it('rejects with ServiceError for an unknown id, without calling the Function', async () => {
      await expect(service.assignOperators('missing', ['op-1'])).rejects.toBeInstanceOf(ServiceError);
      expect(functions.createExecution).not.toHaveBeenCalled();
    });

    it('calls the assignOperators Function action and writes assignedUserIds to Dexie on success', async () => {
      await appDb.events.put({
        id: 'active-1',
        name: 'Original Name',
        type: 'wedding',
        date: '2026-01-01',
        hostName: 'Host',
        status: 'active',
        assignedUserIds: [],
        createdBy: 'admin-1',
        nextReceiptSeq: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, eventId: 'active-1', assignedUserIds: ['op-1'] }),
      });

      const updated = await service.assignOperators('active-1', ['op-1']);

      expect(updated.assignedUserIds).toEqual(['op-1']);
      expect((await appDb.events.get('active-1'))?.assignedUserIds).toEqual(['op-1']);
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          body: JSON.stringify({ action: 'assignOperators', eventId: 'active-1', assignedUserIds: ['op-1'] }),
        }),
      );
    });

    it('throws ServiceError and leaves Dexie untouched when the Function rejects the request', async () => {
      await appDb.events.put({
        id: 'active-3',
        name: 'Original Name',
        type: 'wedding',
        date: '2026-01-01',
        hostName: 'Host',
        status: 'active',
        assignedUserIds: [],
        createdBy: 'admin-1',
        nextReceiptSeq: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 400,
        responseBody: JSON.stringify({ error: 'User ghost does not exist' }),
      });

      await expect(service.assignOperators('active-3', ['ghost'])).rejects.toBeInstanceOf(ServiceError);
      expect((await appDb.events.get('active-3'))?.assignedUserIds).toEqual([]);
    });
  });
});
