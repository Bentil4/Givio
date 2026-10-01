import { TestBed } from '@angular/core/testing';
import { DuplicateEventFlagDataService } from './duplicate-event-flag-data.service';
import { FUNCTIONS } from '../../core/appwrite/client';

describe('DuplicateEventFlagDataService', () => {
  let service: DuplicateEventFlagDataService;
  let createExecution: ReturnType<typeof vi.fn>;

  const respond = (status: number, body: object) =>
    createExecution.mockResolvedValueOnce({
      responseStatusCode: status,
      responseBody: JSON.stringify(body),
    });
  const sentBody = () => JSON.parse(createExecution.mock.calls[0][0].body);

  beforeEach(() => {
    createExecution = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: { createExecution } }],
    });
    service = TestBed.inject(DuplicateEventFlagDataService);
  });

  it('listDuplicateEventFlags returns the open queue', async () => {
    respond(200, { flags: [{ flagId: 'f1' }] });

    expect(await service.listDuplicateEventFlags()).toEqual([{ flagId: 'f1' }]);
    expect(sentBody()).toEqual({ action: 'listDuplicateEventFlags' });
  });

  it('resolveDuplicateEventFlag sends the flag and decision', async () => {
    respond(200, { success: true });

    await service.resolveDuplicateEventFlag('f1', 'clear');

    expect(sentBody()).toEqual({
      action: 'resolveDuplicateEventFlag',
      flagId: 'f1',
      decision: 'clear',
    });
  });

  it('surfaces the Function refusal', async () => {
    respond(409, { error: 'This flag is already cleared' });

    await expect(service.resolveDuplicateEventFlag('f1', 'confirm')).rejects.toThrow(
      'This flag is already cleared',
    );
  });
});
