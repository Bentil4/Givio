import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ACCOUNT } from '../../../../core/appwrite/client';
import { ServiceError } from '../../../../core/services/service-error';
import { AuthService } from '../../../../data/services/auth.service';
import { UserService } from '../../../../data/services/user.service';
import type { AdminUser } from '../../../../data/models/admin-user';
import { AdminAdmins } from './admin-admins';

const SUPER: AdminUser = {
  id: 'super-1',
  name: 'Nana Super',
  email: 'nana@givio.test',
  role: 'admin',
  superAdmin: true,
  active: true,
  registeredAt: '2026-01-01',
};
const ADMIN: AdminUser = {
  id: 'admin-2',
  name: 'Ama Admin',
  email: 'ama@givio.test',
  role: 'admin',
  superAdmin: false,
  active: true,
  registeredAt: '2026-02-01',
};
const SUSPENDED: AdminUser = { ...ADMIN, id: 'admin-3', name: 'Kofi Suspended', active: false };
const OPERATOR: AdminUser = {
  id: 'op-1',
  name: 'Esi Operator',
  email: 'esi@givio.test',
  role: 'operator',
  active: true,
  registeredAt: '2026-03-01',
};

describe('AdminAdmins', () => {
  let fixture: ComponentFixture<AdminAdmins>;
  let component: AdminAdmins;
  let userService: {
    listUsers: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
    setUserActive: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    userService = {
      listUsers: vi.fn().mockResolvedValue([SUPER, ADMIN, SUSPENDED, OPERATOR]),
      createUser: vi.fn().mockResolvedValue({ userId: 'new', generatedPassword: 'pw-123' }),
      updateUser: vi.fn().mockResolvedValue(undefined),
      setUserActive: vi.fn().mockResolvedValue(undefined),
    };
    const account = {
      get: vi.fn().mockResolvedValue({ $id: 'super-1', labels: ['admin', 'superadmin'] }),
    };

    await TestBed.configureTestingModule({
      imports: [AdminAdmins],
      providers: [
        { provide: UserService, useValue: userService },
        { provide: ACCOUNT, useValue: account },
      ],
    }).compileComponents();

    await TestBed.inject(AuthService).restoreSession();
    fixture = TestBed.createComponent(AdminAdmins);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('lists only Admin-tier accounts, with tier and status labels', () => {
    expect(component.admins().map((u) => u.id)).toEqual(['super-1', 'admin-2', 'admin-3']);
    expect(text()).toContain('Super Admin');
    expect(text()).toContain('Suspended');
    expect(text()).not.toContain('Esi Operator');
  });

  it('never offers actions on the Super Admin row', () => {
    expect(component.canManage(SUPER)).toBe(false);
    expect(component.canManage(ADMIN)).toBe(true);
    expect(text()).toContain("That's you");
  });

  it('offers only active operators for promotion', () => {
    expect(component.promotable().map((u) => u.id)).toEqual(['op-1']);
  });

  it('creates an Admin through the server-side Function with role admin', async () => {
    component.openCreate();
    component.createForm.setValue({
      name: 'New Admin',
      email: 'new@givio.test',
      inviteEmail: true,
    });

    await component.create();

    expect(userService.createUser).toHaveBeenCalledWith({
      name: 'New Admin',
      email: 'new@givio.test',
      role: 'admin',
      inviteChannels: ['email'],
    });
    expect(component.generatedPassword()).toBe('pw-123');
    expect(component.creating()).toBe(false);
  });

  it('does not submit an invalid create form', async () => {
    component.openCreate();

    await component.create();

    expect(userService.createUser).not.toHaveBeenCalled();
  });

  it('promotes the chosen operator to admin', async () => {
    component.openPromote();
    component.promoteForm.setValue({ userId: 'op-1' });

    await component.promote();

    expect(userService.updateUser).toHaveBeenCalledWith('op-1', { role: 'admin' });
    expect(component.promoting()).toBe(false);
  });

  it('demotes an Admin to operator after confirmation', async () => {
    component.ask('demote', ADMIN);
    await component.confirmPending();

    expect(userService.updateUser).toHaveBeenCalledWith('admin-2', { role: 'operator' });
  });

  it('suspends an Admin after confirmation and re-reads the list rather than guessing', async () => {
    userService.listUsers.mockClear();
    component.ask('suspend', ADMIN);
    expect(component.pendingCopy()?.title).toBe('Suspend Ama Admin?');

    await component.confirmPending();

    expect(userService.setUserActive).toHaveBeenCalledWith('admin-2', false);
    expect(userService.listUsers).toHaveBeenCalled();
    expect(component.pending()).toBeNull();
  });

  it('reinstates a suspended Admin', async () => {
    component.ask('reinstate', SUSPENDED);
    await component.confirmPending();

    expect(userService.setUserActive).toHaveBeenCalledWith('admin-3', true);
  });

  it('shows a server rejection inline on the row and leaves the status unchanged', async () => {
    userService.setUserActive.mockRejectedValueOnce(
      new ServiceError(
        'Only the Super Admin can create, promote, demote, or suspend an Admin account',
      ),
    );
    component.ask('suspend', ADMIN);

    await component.confirmPending();
    fixture.detectChanges();

    expect(component.rowErrorFor(ADMIN)).toContain('Only the Super Admin');
    expect(component.admins().find((u) => u.id === 'admin-2')?.active).toBe(true);
    expect(fixture.nativeElement.querySelector('.row-error[role="alert"]')).not.toBeNull();
  });

  it('surfaces a create failure in the dialog', async () => {
    userService.createUser.mockRejectedValueOnce(
      new ServiceError('A user with this email already exists'),
    );
    component.openCreate();
    component.createForm.setValue({ name: 'Dup', email: 'dup@givio.test', inviteEmail: false });

    await component.create();

    expect(component.formError()).toBe('A user with this email already exists');
    expect(component.creating()).toBe(true);
  });

  it('shows a load error when listing fails', async () => {
    userService.listUsers.mockRejectedValueOnce(new ServiceError('Forbidden'));

    await component.load();

    expect(component.loadError()).toBe('Forbidden');
  });
});
