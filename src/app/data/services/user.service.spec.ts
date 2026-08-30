import { TestBed } from '@angular/core/testing';
import { UserService } from './user.service';
import { ServiceError } from './service-error';
import { FUNCTIONS } from '../appwrite/client';

describe('UserService', () => {
  let service: UserService;
  let functions: { createExecution: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    functions = { createExecution: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: functions }],
    });
    service = TestBed.inject(UserService);
  });

  describe('listUsers', () => {
    it('resolves with the mapped user list on success', async () => {
      const users = [{ id: 'u1', name: 'Ama', email: 'ama@givio.test', role: 'admin', active: true, registeredAt: '2026-01-01' }];
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify(users),
      });

      await expect(service.listUsers()).resolves.toEqual(users);
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ body: JSON.stringify({ action: 'listUsers' }) }),
      );
    });

    it('throws a ServiceError on failure', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 403,
        responseBody: JSON.stringify({ error: 'Forbidden' }),
      });

      await expect(service.listUsers()).rejects.toBeInstanceOf(ServiceError);
    });
  });

  describe('createUser', () => {
    it('resolves with the created userId and no generatedPassword when a password was provided', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, userId: 'new-1' }),
      });

      const result = await service.createUser({
        name: 'New User',
        email: 'new@givio.test',
        role: 'operator',
        password: 'Sup3rSecret!',
      });

      expect(result).toEqual({ success: true, userId: 'new-1' });
    });

    it('resolves with a generatedPassword when the caller omitted one', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, userId: 'new-2', generatedPassword: 'abc123' }),
      });

      const result = await service.createUser({ name: 'New User', email: 'new@givio.test', role: 'admin' });

      expect(result).toEqual({ success: true, userId: 'new-2', generatedPassword: 'abc123' });
    });

    it('throws a ServiceError carrying the Function\'s message on a duplicate email (409)', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 409,
        responseBody: JSON.stringify({ error: 'A user with this email already exists' }),
      });

      await expect(service.createUser({ name: 'Dup', email: 'dup@givio.test', role: 'admin' })).rejects.toMatchObject(
        { message: 'A user with this email already exists' },
      );
    });
  });

  describe('updateUser', () => {
    it('resolves when the function execution succeeds', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, userId: 'u1' }),
      });

      await expect(service.updateUser('u1', { name: 'Renamed' })).resolves.toBeUndefined();
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ body: JSON.stringify({ action: 'updateUser', userId: 'u1', name: 'Renamed' }) }),
      );
    });

    it('throws a ServiceError on failure', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 502,
        responseBody: JSON.stringify({ error: 'Failed to update name' }),
      });

      await expect(service.updateUser('u1', { name: 'X' })).rejects.toBeInstanceOf(ServiceError);
    });
  });

  describe('setUserActive', () => {
    it('resolves when the function execution succeeds', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, userId: 'u1', active: false }),
      });

      await expect(service.setUserActive('u1', false)).resolves.toBeUndefined();
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ body: JSON.stringify({ action: 'setStatus', userId: 'u1', active: false }) }),
      );
    });

    it('throws a ServiceError on failure', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 502,
        responseBody: JSON.stringify({ error: 'Failed to update user status' }),
      });

      await expect(service.setUserActive('u1', true)).rejects.toBeInstanceOf(ServiceError);
    });
  });

  describe('forceExpireSessions', () => {
    it('resolves when the function execution succeeds', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, userId: 'u1' }),
      });

      await expect(service.forceExpireSessions('u1')).resolves.toBeUndefined();
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ body: JSON.stringify({ action: 'forceExpireSessions', userId: 'u1' }) }),
      );
    });

    it('throws a ServiceError on failure', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 502,
        responseBody: JSON.stringify({ error: 'Failed to force sign-out' }),
      });

      await expect(service.forceExpireSessions('u1')).rejects.toBeInstanceOf(ServiceError);
    });
  });
});
