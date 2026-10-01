import type { EventDataService } from './event-data.service';
import { ServiceError } from '../../core/services/service-error';
import { appDb } from '../dexie/app-db';
import {
  clearEventTables,
  setUpEventDataService,
  type EventDataTestBed,
  type TestUser,
} from './event-data-test-fixtures';

/** Local-first writes, the server pull and outbox retries. */
describe('EventDataService', () => {
  let service: EventDataService;
  let databases: EventDataTestBed['databases'];
  let tenantDataService: EventDataTestBed['tenantDataService'];
  // No labels by default, so no pre-existing test sees an extra Story 8.2 access-log createRow.
  let currentUser: TestUser;

  beforeEach(async () => {
    currentUser = { $id: 'admin-1' };
    ({ service, databases, tenantDataService } = await setUpEventDataService(() => currentUser));
  });

  afterEach(clearEventTables);

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
          data: expect.objectContaining({
            status: 'active',
            assignedUserIds: [],
            nextReceiptSeq: 0,
          }),
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

    it("stamps tenantId from the caller's own active Membership when one exists", async () => {
      tenantDataService.getMyActiveMembership.mockResolvedValueOnce({
        id: 'membership-1',
        userId: 'admin-1',
        tenantId: 'tenant-1',
        role: 'super_organizer',
        status: 'active',
        grantedBy: 'admin-1',
        grantedAt: '2026-09-25T00:00:00.000Z',
      });
      databases.createRow.mockResolvedValueOnce({});

      const event = await service.createEvent({
        name: 'Kwame Funeral',
        type: 'funeral',
        date: '2026-09-25',
        hostName: 'The Mensah Family',
      });

      expect(event.tenantId).toBe('tenant-1');
      expect(databases.createRow).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-1' }) }),
      );
    });

    it("leaves tenantId undefined when the caller has no active Membership (today's Admin)", async () => {
      databases.createRow.mockResolvedValueOnce({});

      const event = await service.createEvent({
        name: 'Admin-Created Event',
        type: 'wedding',
        date: '2026-09-25',
        hostName: 'The Osei Family',
      });

      expect(event.tenantId).toBeUndefined();
    });

    it('still creates and saves the event locally when the Membership lookup itself rejects (offline)', async () => {
      tenantDataService.getMyActiveMembership.mockRejectedValueOnce(new Error('offline'));
      databases.createRow.mockResolvedValueOnce({});

      const event = await service.createEvent({
        name: 'Offline Membership Lookup',
        type: 'wedding',
        date: '2026-09-25',
        hostName: 'The Osei Family',
      });

      expect(event.id).toBeTruthy();
      expect(event.tenantId).toBeUndefined();
      expect(await appDb.events.get(event.id)).toMatchObject({ name: 'Offline Membership Lookup' });
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
        expect.objectContaining({
          rowId: 'active-1',
          data: expect.objectContaining({ name: 'New Name' }),
        }),
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

  describe('listEvents', () => {
    const makeRow = (overrides: Record<string, unknown> = {}) => ({
      $id: 'remote-1',
      name: 'Remote Event',
      type: 'wedding',
      date: '2026-03-01',
      hostName: 'Host',
      status: 'active',
      assignedUserIds: ['op-1'],
      createdBy: 'admin-1',
      nextReceiptSeq: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    });

    it('hydrates Dexie from Appwrite and returns the merged local list', async () => {
      databases.listRows.mockResolvedValueOnce({ total: 1, rows: [makeRow()] });

      const events = await service.listEvents();

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ id: 'remote-1', name: 'Remote Event' });
      expect(await appDb.events.get('remote-1')).toMatchObject({ name: 'Remote Event' });
    });

    it('does not overwrite an event with an unsynced outbox entry', async () => {
      await appDb.events.put({
        id: 'remote-1',
        name: 'Local Unsynced Edit',
        type: 'wedding',
        date: '2026-03-01',
        hostName: 'Host',
        status: 'active',
        assignedUserIds: ['op-1'],
        createdBy: 'admin-1',
        nextReceiptSeq: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      });
      await appDb.outbox.add({
        entityType: 'event',
        entityId: 'remote-1',
        op: 'update',
        payload: {},
        status: 'pending',
        retries: 0,
        createdAt: '2026-02-01T00:00:00.000Z',
      });
      databases.listRows.mockResolvedValueOnce({
        total: 1,
        rows: [makeRow({ name: 'Stale Server Name' })],
      });

      const events = await service.listEvents();

      expect(events.find((e) => e.id === 'remote-1')?.name).toBe('Local Unsynced Edit');
    });

    it('falls back to the local list when the remote fetch fails', async () => {
      await appDb.events.put({
        id: 'local-only',
        name: 'Offline Local Event',
        type: 'funeral',
        date: '2026-01-01',
        hostName: 'Host',
        status: 'active',
        assignedUserIds: [],
        createdBy: 'admin-1',
        nextReceiptSeq: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      databases.listRows.mockRejectedValueOnce(new Error('offline'));

      const events = await service.listEvents();

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('local-only');
    });

    describe('Admin access logging (Story 8.2)', () => {
      const accessLogWrites = () =>
        databases.createRow.mock.calls.filter(([arg]) => arg.data?.action === 'access');
      const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

      it('writes exactly one access entry per call, regardless of row count', async () => {
        currentUser = { $id: 'admin-1', labels: ['admin'] };
        databases.createRow.mockResolvedValue({});
        databases.listRows.mockResolvedValueOnce({
          total: 3,
          rows: [
            makeRow({ $id: 'r1', tenantId: 'tenant-b' }),
            makeRow({ $id: 'r2', tenantId: 'tenant-a' }),
            makeRow({ $id: 'r3' }),
          ],
        });

        await service.listEvents();
        await flush();

        expect(accessLogWrites()).toHaveLength(1);
        const { data } = accessLogWrites()[0][0];
        expect(data).toMatchObject({
          entityType: 'event',
          entityId: '*',
          action: 'access',
          performedBy: 'admin-1',
        });
        expect(typeof data.timestamp).toBe('string');
        expect(JSON.parse(data.newValues)).toEqual({
          query: 'listEvents',
          tenantId: null,
          tenantIds: ['tenant-a', 'tenant-b'],
          rowCount: 3,
        });
      });

      it('writes one entry per invocation — two calls, two entries', async () => {
        currentUser = { $id: 'admin-1', labels: ['admin'] };
        databases.createRow.mockResolvedValue({});
        databases.listRows.mockResolvedValue({ total: 1, rows: [makeRow()] });

        await service.listEvents();
        await service.listEvents();
        await flush();

        expect(accessLogWrites()).toHaveLength(2);
      });

      it('logs a Super Admin read too (holds the admin Label, AD-11)', async () => {
        currentUser = { $id: 'super-1', labels: ['admin', 'super_admin'] };
        databases.createRow.mockResolvedValue({});
        databases.listRows.mockResolvedValueOnce({ total: 1, rows: [makeRow()] });

        await service.listEvents();
        await flush();

        expect(accessLogWrites()).toHaveLength(1);
        expect(accessLogWrites()[0][0].data.performedBy).toBe('super-1');
      });

      it('writes nothing for an Operator read', async () => {
        currentUser = { $id: 'op-1', labels: ['operator'] };
        databases.listRows.mockResolvedValueOnce({ total: 1, rows: [makeRow()] });

        await service.listEvents();
        await flush();

        expect(databases.createRow).not.toHaveBeenCalled();
      });

      it('still returns the events when the audit write fails', async () => {
        currentUser = { $id: 'admin-1', labels: ['admin'] };
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        databases.createRow.mockRejectedValue(new Error('enum value not allowed'));
        databases.listRows.mockResolvedValueOnce({ total: 1, rows: [makeRow()] });

        const events = await service.listEvents();
        await flush();

        expect(events.map((e) => e.id)).toEqual(['remote-1']);
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
      });

      it('does not wait on the audit write before resolving the read', async () => {
        currentUser = { $id: 'admin-1', labels: ['admin'] };
        databases.createRow.mockReturnValue(new Promise(() => undefined));
        databases.listRows.mockResolvedValueOnce({ total: 1, rows: [makeRow()] });

        const events = await service.listEvents();

        expect(events).toHaveLength(1);
      });

      it('writes nothing when the read fell back to the offline local cache', async () => {
        currentUser = { $id: 'admin-1', labels: ['admin'] };
        databases.listRows.mockRejectedValueOnce(new Error('offline'));

        await service.listEvents();
        await flush();

        expect(databases.createRow).not.toHaveBeenCalled();
      });
    });
  });

  describe('retryOutboxEntry', () => {
    it('retries a create entry and reports success', async () => {
      databases.createRow.mockResolvedValueOnce({});
      const entry = {
        localId: 1,
        entityType: 'event' as const,
        entityId: 'e1',
        op: 'create' as const,
        payload: { id: 'e1', name: 'Ama & Kojo' },
        status: 'pending' as const,
        retries: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      const synced = await service.retryOutboxEntry(entry);

      expect(synced).toBe(true);
      expect(databases.createRow).toHaveBeenCalledWith(expect.objectContaining({ rowId: 'e1' }));
    });

    it('reports failure without throwing when the retry itself fails', async () => {
      databases.updateRow.mockRejectedValueOnce(new Error('offline'));
      const entry = {
        localId: 2,
        entityType: 'event' as const,
        entityId: 'e1',
        op: 'update' as const,
        payload: { id: 'e1', name: 'Renamed' },
        status: 'pending' as const,
        retries: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      };

      const synced = await service.retryOutboxEntry(entry);

      expect(synced).toBe(false);
    });
  });
});
