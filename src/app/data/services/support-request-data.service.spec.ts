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
});
