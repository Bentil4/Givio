import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminSettings } from './admin-settings';
import { UserService } from '../../../../data/services/user.service';
import { ServiceError } from '../../../../data/services/service-error';
import type { AdminUser } from '../../../../data/models/admin-user';

describe('AdminSettings', () => {
  let component: AdminSettings;
  let fixture: ComponentFixture<AdminSettings>;
  let userService: {
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
    userService = {
      listUsers: vi.fn().mockResolvedValue([sampleUser]),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      setUserActive: vi.fn(),
      forceExpireSessions: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminSettings],
      providers: [{ provide: UserService, useValue: userService }],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminSettings);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads and renders users on init', () => {
    expect(userService.listUsers).toHaveBeenCalled();
    expect(component.users()).toEqual([sampleUser]);
  });

  it('shows a list error when loadUsers fails', async () => {
    userService.listUsers.mockRejectedValueOnce(new ServiceError('Forbidden'));

    await component.loadUsers();

    expect(component.listError()).toBe('Forbidden');
  });

  describe('create flow', () => {
    it('calls createUser with the form values and refreshes the list', async () => {
      userService.createUser.mockResolvedValueOnce({ success: true, userId: 'new-1' });
      userService.listUsers.mockResolvedValueOnce([sampleUser]);

      component.openCreateDialog();
      component.form.setValue({ name: 'New', email: 'new@givio.test', role: 'admin', password: 'secret123' });
      await component.submitForm();

      expect(userService.createUser).toHaveBeenCalledWith({
        name: 'New',
        email: 'new@givio.test',
        role: 'admin',
        password: 'secret123',
      });
      expect(component.showFormDialog()).toBe(false);
    });

    it('shows the generated-password notice only when one comes back', async () => {
      userService.createUser.mockResolvedValueOnce({
        success: true,
        userId: 'new-2',
        generatedPassword: 'gen-pass-1',
      });
      userService.listUsers.mockResolvedValueOnce([sampleUser]);

      component.openCreateDialog();
      component.form.setValue({ name: 'New', email: 'new@givio.test', role: 'admin', password: '' });
      await component.submitForm();

      expect(component.generatedPasswordNotice()).toBe('gen-pass-1');
    });

    it('does not show a generated-password notice when the admin supplied one', async () => {
      userService.createUser.mockResolvedValueOnce({ success: true, userId: 'new-3' });
      userService.listUsers.mockResolvedValueOnce([sampleUser]);

      component.openCreateDialog();
      component.form.setValue({ name: 'New', email: 'new@givio.test', role: 'admin', password: 'chosen-pw' });
      await component.submitForm();

      expect(component.generatedPasswordNotice()).toBeNull();
    });

    it('shows the duplicate-email error inline and keeps the dialog open', async () => {
      userService.createUser.mockRejectedValueOnce(
        new ServiceError('A user with this email already exists'),
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
      userService.updateUser.mockResolvedValueOnce(undefined);
      userService.listUsers.mockResolvedValueOnce([sampleUser]);

      component.openEditDialog(sampleUser);
      component.form.patchValue({ name: 'Ama Updated' });
      await component.submitForm();

      expect(userService.updateUser).toHaveBeenCalledWith('u1', {
        name: 'Ama Updated',
        email: 'ama@givio.test',
        role: 'operator',
      });
    });
  });

  describe('deactivate/reactivate', () => {
    it('requestDeactivate then confirming calls setUserActive(id, false)', async () => {
      userService.setUserActive.mockResolvedValueOnce(undefined);
      userService.listUsers.mockResolvedValueOnce([{ ...sampleUser, active: false }]);

      component.requestDeactivate(sampleUser);
      expect(component.confirmTarget()?.action).toBe('deactivate');
      await component.confirmActionSubmit();

      expect(userService.setUserActive).toHaveBeenCalledWith('u1', false);
      expect(component.confirmTarget()).toBeNull();
    });

    it('requestReactivate then confirming calls setUserActive(id, true)', async () => {
      userService.setUserActive.mockResolvedValueOnce(undefined);
      userService.listUsers.mockResolvedValueOnce([sampleUser]);

      component.requestReactivate({ ...sampleUser, active: false });
      await component.confirmActionSubmit();

      expect(userService.setUserActive).toHaveBeenCalledWith('u1', true);
    });

    it('refreshes the list even when setUserActive fails, so the table never shows stale data', async () => {
      userService.setUserActive.mockRejectedValueOnce(new ServiceError('Failed to update user status'));
      userService.listUsers.mockClear();
      userService.listUsers.mockResolvedValueOnce([sampleUser]);

      component.requestDeactivate(sampleUser);
      await component.confirmActionSubmit();

      expect(component.listError()).toBe('Failed to update user status');
      expect(userService.listUsers).toHaveBeenCalled();
    });

    it('cancelConfirm clears the confirm target without calling the repository', () => {
      component.requestDeactivate(sampleUser);
      component.cancelConfirm();

      expect(component.confirmTarget()).toBeNull();
      expect(userService.setUserActive).not.toHaveBeenCalled();
    });
  });

  describe('force sign-out', () => {
    it('requestForceExpireSessions then confirming calls forceExpireSessions, not setUserActive', async () => {
      userService.forceExpireSessions.mockResolvedValueOnce(undefined);
      userService.listUsers.mockResolvedValueOnce([sampleUser]);

      component.requestForceExpireSessions(sampleUser);
      expect(component.confirmTarget()?.action).toBe('forceExpireSessions');
      await component.confirmActionSubmit();

      expect(userService.forceExpireSessions).toHaveBeenCalledWith('u1');
      expect(userService.setUserActive).not.toHaveBeenCalled();
      expect(component.confirmTarget()).toBeNull();
    });

    it('cancel clears the target without calling the repository', () => {
      component.requestForceExpireSessions(sampleUser);
      component.cancelConfirm();

      expect(component.confirmTarget()).toBeNull();
      expect(userService.forceExpireSessions).not.toHaveBeenCalled();
    });
  });
});
