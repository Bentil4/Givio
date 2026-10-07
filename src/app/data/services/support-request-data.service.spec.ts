import { TestBed } from '@angular/core/testing';
import { FUNCTIONS } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { FunctionRejectedError } from '../appwrite/invoke-admin-function';
import { SupportRequestDataService } from './support-request-data.service';

describe('SupportRequestDataService', () => {
  let service: SupportRequestDataService;
  let functions: { createExecution: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    functions = { createExecution: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: functions }],
    });
    service = TestBed.inject(SupportRequestDataService);
  });

  it('sends only the message for a Contact Admin question — tenant and user are derived server-side', async () => {
    functions.createExecution.mockResolvedValueOnce({
      responseStatusCode: 200,
      responseBody: JSON.stringify({ success: true }),
    });

    await service.submitQuestion('Where are my reports?');

    expect(functions.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        body: JSON.stringify({ action: 'submitSupportRequest', message: 'Where are my reports?' }),
      }),
    );
  });

  it("counts open support and dispute requests through the Function's Admin-only action", async () => {
    functions.createExecution.mockResolvedValueOnce({
      responseStatusCode: 200,
      responseBody: JSON.stringify({ success: true, counts: { supportRequests: 4 } }),
    });

    expect(await service.countOpenRequests()).toBe(4);
    expect(functions.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({ body: JSON.stringify({ action: 'countOpenSupportRequests' }) }),
    );
  });

  it('sends email, tenant name and message for a dispute', async () => {
    functions.createExecution.mockResolvedValueOnce({
      responseStatusCode: 200,
      responseBody: JSON.stringify({ success: true }),
    });

    await service.submitDispute({ email: 'a@b.co', tenantName: 'Asante', message: 'Mistake' });

    expect(functions.createExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        body: JSON.stringify({
          action: 'submitDispute',
          email: 'a@b.co',
          tenantName: 'Asante',
          message: 'Mistake',
        }),
      }),
    );
  });

  it("passes a 4xx through with the Function's person-facing message", async () => {
    functions.createExecution.mockResolvedValueOnce({
      responseStatusCode: 429,
      responseBody: JSON.stringify({ error: 'Try again later.' }),
    });

    const failure = service.submitQuestion('Hi');
    await expect(failure).rejects.toBeInstanceOf(FunctionRejectedError);
    await expect(failure).rejects.toThrow('Try again later.');
  });

  it('replaces a 5xx server message with a generic retry message', async () => {
    functions.createExecution.mockResolvedValueOnce({
      responseStatusCode: 500,
      responseBody: JSON.stringify({ error: 'Server misconfiguration: missing database/table ID' }),
    });

    const failure = service.submitQuestion('Hi');
    await expect(failure).rejects.not.toBeInstanceOf(FunctionRejectedError);
    await expect(failure).rejects.toThrow(/Check your connection/);
  });

  it('surfaces a network failure as a ServiceError', async () => {
    functions.createExecution.mockRejectedValueOnce(new Error('offline'));

    await expect(
      service.submitDispute({ email: 'a@b.co', tenantName: 'A', message: 'M' }),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  describe('Admin inbox', () => {
    const respondWith = (body: object) =>
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify(body),
      });
    const sentBody = () => JSON.parse(functions.createExecution.mock.calls[0][0].body);

    it('lists a status tab through the Function and returns the page with its cursor', async () => {
      respondWith({ success: true, requests: [{ id: 'r1' }], nextCursor: 'r1' });

      const page = await service.listRequests({ status: 'open' });

      expect(sentBody()).toEqual({ action: 'listSupportRequests', status: 'open' });
      expect(page).toEqual({ requests: [{ id: 'r1' }], nextCursor: 'r1' });
    });

    it('sends the cursor only when continuing a list', async () => {
      respondWith({ success: true, requests: [], nextCursor: null });

      await service.listRequests({ status: 'closed', cursor: 'r9' });

      expect(sentBody()).toEqual({ action: 'listSupportRequests', status: 'closed', cursor: 'r9' });
    });

    it('sets a request status through the Function', async () => {
      respondWith({ success: true, request: { id: 'r1', status: 'closed' } });

      await service.setStatus('r1', 'closed');

      expect(sentBody()).toEqual({
        action: 'setSupportRequestStatus',
        requestId: 'r1',
        status: 'closed',
      });
    });

    it('rejects when the Function refuses the change', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 403,
        responseBody: JSON.stringify({ error: 'Forbidden' }),
      });

      await expect(service.setStatus('r1', 'open')).rejects.toBeInstanceOf(FunctionRejectedError);
    });
  });
});
