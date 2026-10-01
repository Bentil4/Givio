import { TestBed } from '@angular/core/testing';
import { OrganizerEventDataService } from './organizer-event-data.service';
import { DATABASES, FUNCTIONS } from '../../core/appwrite/client';

const ROW = {
  $id: 'e1',
  name: 'Odoi Funeral',
  type: 'funeral',
  date: '2026-11-02T00:00:00.000+00:00',
  hostName: 'The Odoi Family',
  venue: null,
  status: 'active',
  tenantId: 'tenant-a',
  assignedUserIds: [],
  createdBy: 'so-a',
  nextReceiptSeq: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const DETAILS = {
  name: 'Odoi Funeral',
  date: '2026-11-02',
  hostName: 'The Odoi Family',
  venue: null,
  image: null,
};

describe('OrganizerEventDataService', () => {
  let service: OrganizerEventDataService;
  let createExecution: ReturnType<typeof vi.fn>;
  let listRows: ReturnType<typeof vi.fn>;

  const respond = (status: number, body: object) =>
    createExecution.mockResolvedValueOnce({
      responseStatusCode: status,
      responseBody: JSON.stringify(body),
    });
  const sentBody = () => JSON.parse(createExecution.mock.calls[0][0].body);

  beforeEach(() => {
    createExecution = vi.fn();
    listRows = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: FUNCTIONS, useValue: { createExecution } },
        { provide: DATABASES, useValue: { listRows } },
      ],
    });
    service = TestBed.inject(OrganizerEventDataService);
  });

  it('lists only the given tenant’s Events, filtered server-side by tenantId', async () => {
    listRows.mockResolvedValue({ rows: [ROW] });

    const events = await service.listTenantEvents('tenant-a');

    expect(events.map((e) => e.id)).toEqual(['e1']);
    expect(events[0].venue).toBeUndefined();
    const queries: string[] = listRows.mock.calls[0][0].queries;
    expect(queries.map((q) => JSON.parse(q))).toContainEqual({
      method: 'equal',
      attribute: 'tenantId',
      values: ['tenant-a'],
    });
  });

  it('pages through every Event the tenant owns', async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ ...ROW, $id: `e${i}` }));
    listRows.mockResolvedValueOnce({ rows: page }).mockResolvedValueOnce({ rows: [ROW] });

    const events = await service.listTenantEvents('tenant-a');

    expect(events).toHaveLength(101);
    expect(listRows).toHaveBeenCalledTimes(2);
  });

  it('reports a failed listing as a ServiceError', async () => {
    listRows.mockRejectedValue(new Error('offline'));

    await expect(service.listTenantEvents('tenant-a')).rejects.toThrow(
      "We couldn't load your events",
    );
  });

  it('creates through the Function and never sends a tenantId', async () => {
    respond(200, { success: true, event: ROW });

    const event = await service.createEvent({ ...DETAILS, type: 'funeral' });

    expect(event.tenantId).toBe('tenant-a');
    expect(sentBody()).toEqual({ action: 'createTenantEvent', ...DETAILS, type: 'funeral' });
  });

  it('updates details and status through the Function', async () => {
    respond(200, { success: true, event: ROW });
    respond(200, { success: true, event: { ...ROW, status: 'paused' } });

    await service.updateEvent('e1', DETAILS);
    const paused = await service.setEventStatus('e1', 'paused');

    expect(sentBody()).toEqual({ action: 'updateTenantEvent', eventId: 'e1', ...DETAILS });
    expect(JSON.parse(createExecution.mock.calls[1][0].body)).toEqual({
      action: 'setTenantEventStatus',
      eventId: 'e1',
      status: 'paused',
    });
    expect(paused.status).toBe('paused');
  });

  it('assigns Operators and regenerates the family code through the shared actions', async () => {
    respond(200, { success: true });
    respond(200, { success: true, accessCode: 'ABCDEFGH' });

    await service.assignOperators('e1', ['op-a']);
    const code = await service.regenerateAccessCode('e1');

    expect(sentBody()).toEqual({
      action: 'assignOperators',
      eventId: 'e1',
      assignedUserIds: ['op-a'],
    });
    expect(code).toBe('ABCDEFGH');
  });

  it('surfaces the Function’s refusal message', async () => {
    respond(404, { error: 'Event not found' });

    await expect(service.setEventStatus('other', 'paused')).rejects.toThrow('Event not found');
  });
});
