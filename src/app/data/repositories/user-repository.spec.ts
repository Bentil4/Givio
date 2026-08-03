import { TestBed } from '@angular/core/testing';
import { UserRepository } from './user-repository';
import { RepositoryError } from './repository-error';
import { FUNCTIONS } from '../appwrite/client';

describe('UserRepository', () => {
  let repository: UserRepository;
  let functions: { createExecution: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    functions = { createExecution: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: FUNCTIONS, useValue: functions }],
    });
    repository = TestBed.inject(UserRepository);
  });

  describe('listUsers', () => {
    it('resolves with the mapped user list on success', async () => {
      const users = [{ id: 'u1', name: 'Ama', email: 'ama@givio.test', role: 'admin', active: true, registeredAt: '2026-01-01' }];
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify(users),
      });

      await expect(repository.listUsers()).resolves.toEqual(users);
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ body: JSON.stringify({ action: 'listUsers' }) }),
      );
    });

    it('throws a RepositoryError on failure', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 403,
        responseBody: JSON.stringify({ error: 'Forbidden' }),
      });

      await expect(repository.listUsers()).rejects.toBeInstanceOf(RepositoryError);
    });
  });

  describe('createUser', () => {
    it('resolves with the created userId and no generatedPassword when a password was provided', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, userId: 'new-1' }),
      });

      const result = await repository.createUser({
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

      const result = await repository.createUser({ name: 'New User', email: 'new@givio.test', role: 'admin' });

      expect(result).toEqual({ success: true, userId: 'new-2', generatedPassword: 'abc123' });
    });

    it('throws a RepositoryError carrying the Function\'s message on a duplicate email (409)', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 409,
        responseBody: JSON.stringify({ error: 'A user with this email already exists' }),
      });

      await expect(repository.createUser({ name: 'Dup', email: 'dup@givio.test', role: 'admin' })).rejects.toMatchObject(
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

      await expect(repository.updateUser('u1', { name: 'Renamed' })).resolves.toBeUndefined();
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ body: JSON.stringify({ action: 'updateUser', userId: 'u1', name: 'Renamed' }) }),
      );
    });

    it('throws a RepositoryError on failure', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 502,
        responseBody: JSON.stringify({ error: 'Failed to update name' }),
      });

      await expect(repository.updateUser('u1', { name: 'X' })).rejects.toBeInstanceOf(RepositoryError);
    });
  });

  describe('setUserActive', () => {
    it('resolves when the function execution succeeds', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, userId: 'u1', active: false }),
      });

      await expect(repository.setUserActive('u1', false)).resolves.toBeUndefined();
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ body: JSON.stringify({ action: 'setStatus', userId: 'u1', active: false }) }),
      );
    });

    it('throws a RepositoryError on failure', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 502,
        responseBody: JSON.stringify({ error: 'Failed to update user status' }),
      });

      await expect(repository.setUserActive('u1', true)).rejects.toBeInstanceOf(RepositoryError);
    });
  });

  describe('forceExpireSessions', () => {
    it('resolves when the function execution succeeds', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true, userId: 'u1' }),
      });

      await expect(repository.forceExpireSessions('u1')).resolves.toBeUndefined();
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({ body: JSON.stringify({ action: 'forceExpireSessions', userId: 'u1' }) }),
      );
    });

    it('throws a RepositoryError on failure', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 502,
        responseBody: JSON.stringify({ error: 'Failed to force sign-out' }),
      });

      await expect(repository.forceExpireSessions('u1')).rejects.toBeInstanceOf(RepositoryError);
    });
  });
});
