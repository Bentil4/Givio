import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminSettings } from './admin-settings';
import { UserRepository } from '../../../../data/repositories/user-repository';
import { RepositoryError } from '../../../../data/repositories/repository-error';
import type { AdminUser } from '../../../../data/models/admin-user';

describe('AdminSettings', () => {
  let component: AdminSettings;
  let fixture: ComponentFixture<AdminSettings>;
  let userRepository: {
    listUsers: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    setUserActive: ReturnType<typeof vi.fn>;
    forceExpireSessions: ReturnType<typeof vi.fn>;
  };

  const sampleUser: AdminUser = {
    id: 'u1',
    name: 'Ama',
    email: 'ama@givio.test',
    role: 'operator',
    active: true,
    registeredAt: '2026-01-01',
  };

  beforeEach(async () => {
    userRepository = {
      listUsers: vi.fn().mockResolvedValue([sampleUser]),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      setUserActive: vi.fn(),
      forceExpireSessions: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminSettings],
      providers: [{ provide: UserRepository, useValue: userRepository }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminSettings);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads and renders users on init', () => {
    expect(userRepository.listUsers).toHaveBeenCalled();
    expect(component.users()).toEqual([sampleUser]);
  });

  it('shows a list error when loadUsers fails', async () => {
    userRepository.listUsers.mockRejectedValueOnce(new RepositoryError('Forbidden'));

    await component.loadUsers();

    expect(component.listError()).toBe('Forbidden');
  });

  describe('create flow', () => {
    it('calls createUser with the form values and refreshes the list', async () => {
      userRepository.createUser.mockResolvedValueOnce({ success: true, userId: 'new-1' });
      userRepository.listUsers.mockResolvedValueOnce([sampleUser]);

      component.openCreateDialog();
      component.form.setValue({ name: 'New', email: 'new@givio.test', role: 'admin', password: 'secret123' });
      await component.submitForm();

      expect(userRepository.createUser).toHaveBeenCalledWith({
        name: 'New',
        email: 'new@givio.test',
        role: 'admin',
        password: 'secret123',
      });
      expect(component.showFormDialog()).toBe(false);
    });

    it('shows the generated-password notice only when one comes back', async () => {
      userRepository.createUser.mockResolvedValueOnce({
        success: true,
        userId: 'new-2',
        generatedPassword: 'gen-pass-1',
      });
      userRepository.listUsers.mockResolvedValueOnce([sampleUser]);

      component.openCreateDialog();
      component.form.setValue({ name: 'New', email: 'new@givio.test', role: 'admin', password: '' });
      await component.submitForm();

      expect(component.generatedPasswordNotice()).toBe('gen-pass-1');
    });

    it('does not show a generated-password notice when the admin supplied one', async () => {
      userRepository.createUser.mockResolvedValueOnce({ success: true, userId: 'new-3' });
      userRepository.listUsers.mockResolvedValueOnce([sampleUser]);

      component.openCreateDialog();
      component.form.setValue({ name: 'New', email: 'new@givio.test', role: 'admin', password: 'chosen-pw' });
      await component.submitForm();

      expect(component.generatedPasswordNotice()).toBeNull();
    });

    it('shows the duplicate-email error inline and keeps the dialog open', async () => {
      userRepository.createUser.mockRejectedValueOnce(
        new RepositoryError('A user with this email already exists'),
      );

      component.openCreateDialog();
      component.form.setValue({ name: 'New', email: 'dup@givio.test', role: 'admin', password: '' });
      await component.submitForm();

      expect(component.formError()).toBe('A user with this email already exists');
      expect(component.showFormDialog()).toBe(true);
    });
  });

  describe('edit flow', () => {
    it('calls updateUser with only the changed-form fields', async () => {
      userRepository.updateUser.mockResolvedValueOnce(undefined);
      userRepository.listUsers.mockResolvedValueOnce([sampleUser]);

      component.openEditDialog(sampleUser);
      component.form.patchValue({ name: 'Ama Updated' });
      await component.submitForm();

      expect(userRepository.updateUser).toHaveBeenCalledWith('u1', {
        name: 'Ama Updated',
        email: 'ama@givio.test',
        role: 'operator',
      });
    });
  });

  describe('deactivate/reactivate', () => {
    it('requestDeactivate then confirming calls setUserActive(id, false)', async () => {
      userRepository.setUserActive.mockResolvedValueOnce(undefined);
      userRepository.listUsers.mockResolvedValueOnce([{ ...sampleUser, active: false }]);

      component.requestDeactivate(sampleUser);
      expect(component.confirmTarget()?.action).toBe('deactivate');
      await component.confirmActionSubmit();

      expect(userRepository.setUserActive).toHaveBeenCalledWith('u1', false);
      expect(component.confirmTarget()).toBeNull();
    });

    it('requestReactivate then confirming calls setUserActive(id, true)', async () => {
      userRepository.setUserActive.mockResolvedValueOnce(undefined);
      userRepository.listUsers.mockResolvedValueOnce([sampleUser]);

      component.requestReactivate({ ...sampleUser, active: false });
      await component.confirmActionSubmit();

      expect(userRepository.setUserActive).toHaveBeenCalledWith('u1', true);
    });

    it('refreshes the list even when setUserActive fails, so the table never shows stale data', async () => {
      userRepository.setUserActive.mockRejectedValueOnce(new RepositoryError('Failed to update user status'));
      userRepository.listUsers.mockClear();
      userRepository.listUsers.mockResolvedValueOnce([sampleUser]);

      component.requestDeactivate(sampleUser);
      await component.confirmActionSubmit();

      expect(component.listError()).toBe('Failed to update user status');
      expect(userRepository.listUsers).toHaveBeenCalled();
    });

    it('cancelConfirm clears the confirm target without calling the repository', () => {
      component.requestDeactivate(sampleUser);
      component.cancelConfirm();

      expect(component.confirmTarget()).toBeNull();
      expect(userRepository.setUserActive).not.toHaveBeenCalled();
    });
  });

  describe('force sign-out', () => {
    it('requestForceExpireSessions then confirming calls forceExpireSessions, not setUserActive', async () => {
      userRepository.forceExpireSessions.mockResolvedValueOnce(undefined);
      userRepository.listUsers.mockResolvedValueOnce([sampleUser]);

      component.requestForceExpireSessions(sampleUser);
      expect(component.confirmTarget()?.action).toBe('forceExpireSessions');
      await component.confirmActionSubmit();

      expect(userRepository.forceExpireSessions).toHaveBeenCalledWith('u1');
      expect(userRepository.setUserActive).not.toHaveBeenCalled();
      expect(component.confirmTarget()).toBeNull();
    });

    it('cancel clears the target without calling the repository', () => {
      component.requestForceExpireSessions(sampleUser);
      component.cancelConfirm();

      expect(component.confirmTarget()).toBeNull();
      expect(userRepository.forceExpireSessions).not.toHaveBeenCalled();
    });
  });
});
