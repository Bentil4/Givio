import type { EventDataService } from './event-data.service';
import { ServiceError } from '../../core/services/service-error';
import { appDb } from '../dexie/app-db';
import {
  clearEventTables,
  setUpEventDataService,
  type EventDataTestBed,
  type TestUser,
} from './event-data-test-fixtures';

/** Online-only writes routed through the set-role-and-permissions Function. */
describe('EventDataService', () => {
  let service: EventDataService;
  let databases: EventDataTestBed['databases'];
  let functions: EventDataTestBed['functions'];
  // No labels by default, so no pre-existing test sees an extra Story 8.2 access-log createRow.
  let currentUser: TestUser;

  beforeEach(async () => {
    currentUser = { $id: 'admin-1' };
    ({ service, databases, functions } = await setUpEventDataService(() => currentUser));
  });

  afterEach(clearEventTables);

  describe('assignOperators', () => {
    it('rejects with ServiceError for an unknown id, without calling the Function', async () => {
      await expect(service.assignOperators('missing', ['op-1'])).rejects.toBeInstanceOf(
        ServiceError,
      );
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
        responseBody: JSON.stringify({
          success: true,
          eventId: 'active-1',
          assignedUserIds: ['op-1'],
        }),
      });

      const updated = await service.assignOperators('active-1', ['op-1']);

      expect(updated.assignedUserIds).toEqual(['op-1']);
      expect((await appDb.events.get('active-1'))?.assignedUserIds).toEqual(['op-1']);
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          body: JSON.stringify({
            action: 'assignOperators',
            eventId: 'active-1',
            assignedUserIds: ['op-1'],
          }),
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

      await expect(service.assignOperators('active-3', ['ghost'])).rejects.toBeInstanceOf(
        ServiceError,
      );
      expect((await appDb.events.get('active-3'))?.assignedUserIds).toEqual([]);
    });
  });

  describe('regenerateAccessCode', () => {
    it('rejects with ServiceError for an unknown id, without calling the Function', async () => {
      await expect(service.regenerateAccessCode('missing')).rejects.toBeInstanceOf(ServiceError);
      expect(functions.createExecution).not.toHaveBeenCalled();
    });

    it('calls the generateAccessCode Function action and writes the new code to Dexie on success', async () => {
      await appDb.events.put({
        id: 'active-1',
        name: 'Original Name',
        type: 'wedding',
        date: '2026-01-01',
        hostName: 'Host',
        status: 'active',
        accessCode: 'OLDCODE1',
        assignedUserIds: [],
        createdBy: 'admin-1',
        nextReceiptSeq: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, accessCode: 'NEWCODE1' }),
      });

      const updated = await service.regenerateAccessCode('active-1');

      expect(updated.accessCode).toBe('NEWCODE1');
      expect((await appDb.events.get('active-1'))?.accessCode).toBe('NEWCODE1');
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          body: JSON.stringify({ action: 'generateAccessCode', eventId: 'active-1' }),
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
        accessCode: 'OLDCODE1',
        assignedUserIds: [],
        createdBy: 'admin-1',
        nextReceiptSeq: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 502,
        responseBody: JSON.stringify({ error: 'Failed to generate a unique code, try again' }),
      });

      await expect(service.regenerateAccessCode('active-3')).rejects.toBeInstanceOf(ServiceError);
      expect((await appDb.events.get('active-3'))?.accessCode).toBe('OLDCODE1');
    });
  });

  describe('setEventStatus', () => {
    it('rejects with ServiceError for an unknown id, without calling the Function', async () => {
      await expect(service.setEventStatus('missing', 'paused')).rejects.toBeInstanceOf(
        ServiceError,
      );
      expect(functions.createExecution).not.toHaveBeenCalled();
    });

    it('calls the setEventStatus Function action, writes status to Dexie, and writes an audit log', async () => {
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
        responseBody: JSON.stringify({ success: true, eventId: 'active-1', status: 'paused' }),
      });
      databases.createRow.mockResolvedValueOnce({});

      const updated = await service.setEventStatus('active-1', 'paused');

      expect(updated.status).toBe('paused');
      expect((await appDb.events.get('active-1'))?.status).toBe('paused');
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          body: JSON.stringify({ action: 'setEventStatus', eventId: 'active-1', status: 'paused' }),
        }),
      );
      expect(databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: 'event',
            entityId: 'active-1',
            action: 'edit',
          }),
        }),
      );
    });

    it('reopens a closed event back to active', async () => {
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
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, eventId: 'closed-1', status: 'active' }),
      });
      databases.createRow.mockResolvedValueOnce({});

      const updated = await service.setEventStatus('closed-1', 'active');

      expect(updated.status).toBe('active');
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
        responseBody: JSON.stringify({ error: 'Cannot change status from active to active' }),
      });

      await expect(service.setEventStatus('active-3', 'active')).rejects.toBeInstanceOf(
        ServiceError,
      );
      expect((await appDb.events.get('active-3'))?.status).toBe('active');
    });
  });
});
