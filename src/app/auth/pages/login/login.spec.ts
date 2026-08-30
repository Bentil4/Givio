import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ACCOUNT } from '../../../data/appwrite/client';

import { Login } from './login';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let account: {
    deleteSession: ReturnType<typeof vi.fn>;
    createEmailPasswordSession: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  beforeEach(async () => {
    account = {
      deleteSession: vi.fn(),
      createEmailPasswordSession: vi.fn(),
      get: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), { provide: ACCOUNT, useValue: account }],
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
  });

  it('navigates to /organizer on successful login with an operator label', async () => {
    account.deleteSession.mockResolvedValueOnce({});
    account.createEmailPasswordSession.mockResolvedValueOnce({});
    account.get.mockResolvedValueOnce({ labels: ['operator'] });

    component.form.setValue({ email: 'op@givio.test', password: 'correct-password' });
    await component.submit();

    expect(router.navigate).toHaveBeenCalledWith(['/organizer']);
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

  it('logs out and shows a generic error when the session is created but no role label is present', async () => {
    account.deleteSession.mockResolvedValueOnce({}); // the pre-login clear
    account.createEmailPasswordSession.mockResolvedValueOnce({});
    account.get.mockResolvedValueOnce({ labels: [] });
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
