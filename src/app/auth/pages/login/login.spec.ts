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

  it('navigates to /admin on successful login with an admin label', async () => {
    account.deleteSession.mockRejectedValueOnce(new Error('no session'));
    account.createEmailPasswordSession.mockResolvedValueOnce({});
    account.get.mockResolvedValueOnce({ labels: ['admin'] });

    component.loginForm.setValue({ email: 'admin@givio.test', password: 'correct-password' });
    await component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(component.errorMessage()).toBeNull();
  });

  it('navigates to /organizer on successful login with an operator label', async () => {
    account.deleteSession.mockResolvedValueOnce({});
    account.createEmailPasswordSession.mockResolvedValueOnce({});
    account.get.mockResolvedValueOnce({ labels: ['operator'] });

    component.loginForm.setValue({ email: 'op@givio.test', password: 'correct-password' });
    await component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/organizer']);
  });

  it('shows a generic error message on invalid credentials, never which field was wrong', async () => {
    account.deleteSession.mockRejectedValueOnce(new Error('no session'));
    account.createEmailPasswordSession.mockRejectedValueOnce(new Error('user_invalid_credentials'));

    component.loginForm.setValue({ email: 'nobody@givio.test', password: 'wrong' });
    await component.onSubmit();

    expect(component.errorMessage()).toBe('Invalid credentials');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('logs out and shows a generic error when the session is created but no role label is present', async () => {
    account.deleteSession.mockResolvedValueOnce({}); // the pre-login clear
    account.createEmailPasswordSession.mockResolvedValueOnce({});
    account.get.mockResolvedValueOnce({ labels: [] });
    account.deleteSession.mockResolvedValueOnce({}); // the post-login-no-role logout

    component.loginForm.setValue({ email: 'nolabel@givio.test', password: 'correct-password' });
    await component.onSubmit();

    expect(component.errorMessage()).toBe('Invalid credentials');
    expect(router.navigate).not.toHaveBeenCalled();
    expect(account.deleteSession).toHaveBeenCalledTimes(2);
  });
});
