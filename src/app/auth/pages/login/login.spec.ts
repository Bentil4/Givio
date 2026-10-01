import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ACCOUNT, DATABASES, FUNCTIONS } from '../../../core/appwrite/client';

import { Login } from './login';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let account: {
    deleteSession: ReturnType<typeof vi.fn>;
    createEmailPasswordSession: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let databases: { listRows: ReturnType<typeof vi.fn>; getRow: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    databases = { listRows: vi.fn(), getRow: vi.fn() };
    account = {
      deleteSession: vi.fn(),
      createEmailPasswordSession: vi.fn(),
      get: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        { provide: ACCOUNT, useValue: account },
        { provide: DATABASES, useValue: databases },
        { provide: FUNCTIONS, useValue: approvedTenantFunctions() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('navigates to /dashboard on successful login with an admin label', async () => {
    account.deleteSession.mockRejectedValueOnce(new Error('no session'));
    account.createEmailPasswordSession.mockResolvedValueOnce({});
    account.get.mockResolvedValueOnce({ labels: ['admin'] });

    component.form.setValue({ email: 'admin@givio.test', password: 'correct-password' });
    await component.submit();

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(component.serverError()).toBeNull();
    expect(databases.listRows).not.toHaveBeenCalled();
  });

  it('navigates to /organizer on successful login with an operator label', async () => {
    account.deleteSession.mockResolvedValueOnce({});
    account.createEmailPasswordSession.mockResolvedValueOnce({});
    account.get.mockResolvedValueOnce({ labels: ['operator'] });

    component.form.setValue({ email: 'op@givio.test', password: 'correct-password' });
    await component.submit();

    expect(router.navigate).toHaveBeenCalledWith(['/organizer']);
    expect(databases.listRows).not.toHaveBeenCalled();
  });

  it('keeps an Operator on /organizer even if a Membership row also exists (Labels win)', async () => {
    account.deleteSession.mockResolvedValueOnce({});
    account.createEmailPasswordSession.mockResolvedValueOnce({});
    account.get.mockResolvedValueOnce({ $id: 'op-1', labels: ['operator'] });
    databases.listRows.mockResolvedValue({ rows: [membershipRow({ userId: 'op-1' })] });

    component.form.setValue({ email: 'op@givio.test', password: 'correct-password' });
    await component.submit();

    expect(router.navigate).toHaveBeenCalledWith(['/organizer']);
  });

  function membershipRow(overrides: Record<string, unknown> = {}) {
    return {
      $id: 'm1',
      userId: 'org-1',
      tenantId: 't1',
      role: 'super_organizer',
      status: 'active',
      grantedBy: 'org-1',
      grantedAt: '2026-09-30T00:00:00.000Z',
      ...overrides,
    };
  }

  async function loginWithoutLabel(): Promise<void> {
    account.deleteSession.mockResolvedValue({});
    account.createEmailPasswordSession.mockResolvedValueOnce({});
    account.get.mockResolvedValueOnce({ $id: 'org-1', labels: [] });
    component.form.setValue({ email: 'org@givio.test', password: 'correct-password' });
    await component.submit();
  }

  it('sends an Organizer with an active Membership to /company', async () => {
    databases.listRows.mockResolvedValueOnce({ rows: [membershipRow()] });
    databases.getRow.mockResolvedValueOnce({ $id: 't1', status: 'pending' });

    await loginWithoutLabel();

    expect(router.navigate).toHaveBeenCalledWith(['/company']);
    expect(component.serverError()).toBeNull();
  });

  it('resumes the signup wizard for an Account with no Label and no Membership', async () => {
    databases.listRows.mockResolvedValueOnce({ rows: [] });

    await loginWithoutLabel();

    expect(router.navigate).toHaveBeenCalledWith(['/auth/signup']);
  });

  it('treats a revoked Membership like a failed sign-in', async () => {
    databases.listRows.mockResolvedValueOnce({ rows: [membershipRow({ status: 'revoked' })] });
    databases.getRow.mockResolvedValueOnce({ $id: 't1', status: 'approved' });

    await loginWithoutLabel();

    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.serverError()).toBe('Email or password is incorrect');
  });

  it('shows a generic error message on invalid credentials, never which field was wrong', async () => {
    account.deleteSession.mockRejectedValueOnce(new Error('no session'));
    account.createEmailPasswordSession.mockRejectedValueOnce(new Error('user_invalid_credentials'));

    component.form.setValue({ email: 'nobody@givio.test', password: 'wrong-password' });
    await component.submit();

    expect(component.serverError()).toBe('Email or password is incorrect');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(component.failedAttempts()).toBe(1);
  });

  it('logs out and shows a generic error when there is no role label and the Membership lookup fails', async () => {
    account.deleteSession.mockResolvedValueOnce({}); // the pre-login clear
    account.createEmailPasswordSession.mockResolvedValueOnce({});
    account.get.mockResolvedValueOnce({ $id: 'u1', labels: [] });
    databases.listRows.mockRejectedValueOnce(new Error('offline'));
    account.deleteSession.mockResolvedValueOnce({}); // the post-login-no-role logout

    component.form.setValue({ email: 'nolabel@givio.test', password: 'correct-password' });
    await component.submit();

    expect(component.serverError()).toBe('Email or password is incorrect');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(account.deleteSession).toHaveBeenCalledTimes(2);
  });

  it('locks out sign-in after 5 failed attempts', async () => {
    account.deleteSession.mockRejectedValue(new Error('no session'));
    account.createEmailPasswordSession.mockRejectedValue(new Error('user_invalid_credentials'));

    for (let i = 0; i < 5; i++) {
      component.form.setValue({ email: 'nobody@givio.test', password: 'wrong-password' });
      await component.submit();
    }

    expect(component.failedAttempts()).toBe(5);
    expect(component.locked()).toBe(true);

    // A 6th attempt is a no-op while locked — the mocked session calls are not invoked again.
    account.createEmailPasswordSession.mockClear();
    await component.submit();
    expect(account.createEmailPasswordSession).not.toHaveBeenCalled();
  });
});

// Story 9.2 AC3: an Operator's sign-in asks the Function for their tenant's status.
function approvedTenantFunctions() {
  return {
    createExecution: vi.fn().mockResolvedValue({
      responseStatusCode: 200,
      responseBody: JSON.stringify({ success: true, tenantStatus: 'approved' }),
    }),
  };
}
