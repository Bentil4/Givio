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

  describe('changeRole', () => {
    it('resolves when the function execution succeeds', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 200,
        responseBody: JSON.stringify({ success: true }),
      });

      await expect(repository.changeRole('user-1', 'admin')).resolves.toBeUndefined();
      expect(functions.createExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          body: JSON.stringify({ userId: 'user-1', role: 'admin' }),
        }),
      );
    });

    it('throws a RepositoryError, not a raw AppwriteException, when createExecution rejects', async () => {
      functions.createExecution.mockRejectedValueOnce(new Error('network down'));

      await expect(repository.changeRole('user-1', 'operator')).rejects.toBeInstanceOf(RepositoryError);
    });

    it('throws a RepositoryError when the function itself returns a non-2xx status (e.g. 403 from a non-admin caller)', async () => {
      functions.createExecution.mockResolvedValueOnce({
        responseStatusCode: 403,
        responseBody: JSON.stringify({ error: 'Forbidden' }),
      });

      await expect(repository.changeRole('user-1', 'admin')).rejects.toBeInstanceOf(RepositoryError);
    });
  });
});
