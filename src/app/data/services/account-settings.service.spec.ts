import { TestBed } from '@angular/core/testing';
import { AppwriteException } from 'appwrite';
import { ACCOUNT } from '../../core/appwrite/client';
import { ServiceError } from '../../core/services/service-error';
import { AccountSettingsService } from './account-settings.service';
import { AuthService } from './auth.service';

describe('AccountSettingsService', () => {
  let service: AccountSettingsService;
  let account: {
    updateName: ReturnType<typeof vi.fn>;
    updatePhone: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
  };
  let refreshCurrentUser: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    account = {
      updateName: vi.fn().mockResolvedValue({}),
      updatePhone: vi.fn().mockResolvedValue({}),
      updatePassword: vi.fn().mockResolvedValue({}),
    };
    refreshCurrentUser = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: ACCOUNT, useValue: account },
        { provide: AuthService, useValue: { refreshCurrentUser } },
      ],
    });
    service = TestBed.inject(AccountSettingsService);
  });

  it('updateName saves the name, then refreshes the signed-in user', async () => {
    await service.updateName('Ama Mensah');

    expect(account.updateName).toHaveBeenCalledWith({ name: 'Ama Mensah' });
    expect(refreshCurrentUser).toHaveBeenCalled();
  });

  it('updatePhone sends the number with the current password', async () => {
    await service.updatePhone('+233241234567', 'secret-pass');

    expect(account.updatePhone).toHaveBeenCalledWith({
      phone: '+233241234567',
      password: 'secret-pass',
    });
    expect(refreshCurrentUser).toHaveBeenCalled();
  });

  it('updatePassword sends the new and the old password', async () => {
    await service.updatePassword('new-password', 'old-password');

    expect(account.updatePassword).toHaveBeenCalledWith({
      password: 'new-password',
      oldPassword: 'old-password',
    });
  });

  it('maps a 401 to "Current password is incorrect"', async () => {
    account.updatePassword.mockRejectedValueOnce(new AppwriteException('Invalid credentials', 401));

    await expect(service.updatePassword('new-password', 'wrong')).rejects.toThrow(
      'Current password is incorrect',
    );
    expect(refreshCurrentUser).not.toHaveBeenCalled();
  });

  it('maps a 409 on a phone change to "That phone number is already in use"', async () => {
    account.updatePhone.mockRejectedValueOnce(new AppwriteException('Conflict', 409));

    await expect(service.updatePhone('+233241234567', 'pw')).rejects.toThrow(
      'That phone number is already in use',
    );
  });

  it('wraps any other failure in a ServiceError with a plain message', async () => {
    account.updateName.mockRejectedValueOnce(new Error('network down'));

    const failure = service.updateName('Ama');

    await expect(failure).rejects.toBeInstanceOf(ServiceError);
    await expect(failure).rejects.toThrow("Couldn't update your name");
  });

  it('still resolves when only the refresh afterwards fails', async () => {
    refreshCurrentUser.mockRejectedValueOnce(new Error('offline'));

    await expect(service.updateName('Ama')).resolves.toBeUndefined();
  });
});
