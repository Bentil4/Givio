import type { TablesDB } from 'appwrite';
import { appDb } from '../dexie/app-db';
import type { Event } from '../models/event';
import { tenantIdOfLocalEvent, writeAuditLog, type WriteAuditLogInput } from './audit-log-writer';

/** Story 7.5: the tenantId column a Super Organizer's tenant-scoped view filters on. */
describe('audit-log-writer tenant stamping', () => {
  const entry: WriteAuditLogInput = {
    entityType: 'donation',
    entityId: 'd1',
    action: 'create',
    performedBy: 'op-1',
    previousValues: null,
    newValues: { receiptNumber: 'AK-001' },
  };

  function fakeDatabases() {
    const createRow = vi.fn().mockResolvedValue({});
    return { databases: { createRow } as unknown as TablesDB, createRow };
  }

  const writtenData = (createRow: ReturnType<typeof vi.fn>) => createRow.mock.calls[0][0].data;

  afterEach(async () => {
    await appDb.events.clear();
  });

  it('writes the tenantId column when the entry concerns a tenant', async () => {
    const { databases, createRow } = fakeDatabases();

    await writeAuditLog(databases, { ...entry, tenantId: 'tenant-a' });

    expect(writtenData(createRow).tenantId).toBe('tenant-a');
  });

  it('leaves the column out when no tenant is concerned', async () => {
    const { databases, createRow } = fakeDatabases();

    await writeAuditLog(databases, entry);

    expect(writtenData(createRow)).not.toHaveProperty('tenantId');
  });

  it('AD-12 amended: gives a company entry no read permission at all — not even the Admin Label', async () => {
    const { databases, createRow } = fakeDatabases();

    await writeAuditLog(databases, { ...entry, tenantId: 'tenant-a' });

    expect(createRow.mock.calls[0][0].permissions).toEqual([]);
  });

  it('keeps the Admin read on a platform entry with no tenant', async () => {
    const { databases, createRow } = fakeDatabases();

    await writeAuditLog(databases, entry);

    expect(createRow.mock.calls[0][0].permissions).toEqual(['read("label:admin")']);
  });

  it("resolves a donation's tenant from its locally cached Event", async () => {
    await appDb.events.put({ id: 'e1', tenantId: 'tenant-a' } as Event);

    expect(await tenantIdOfLocalEvent('e1')).toBe('tenant-a');
    expect(await tenantIdOfLocalEvent('missing')).toBeUndefined();
  });
});
