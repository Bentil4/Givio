import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceError } from '../../../../core/services/service-error';
import { AccountSettingsService } from '../../../../data/services/account-settings.service';
import { AuthService } from '../../../../data/services/auth.service';
import { ProfileSettings } from './profile-settings';

describe('ProfileSettings', () => {
  let fixture: ComponentFixture<ProfileSettings>;
  let el: HTMLElement;
  let accountSettings: {
    updateName: ReturnType<typeof vi.fn>;
    updatePhone: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    accountSettings = {
      updateName: vi.fn().mockResolvedValue(undefined),
      updatePhone: vi.fn().mockResolvedValue(undefined),
      updatePassword: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [ProfileSettings],
      providers: [
        { provide: AccountSettingsService, useValue: accountSettings },
        {
          provide: AuthService,
          useValue: { currentUser: () => ({ name: 'Ama Mensah', phone: '+233241234567' }) },
        },
      ],
    });
    fixture = TestBed.createComponent(ProfileSettings);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const input = (id: string) => el.querySelector<HTMLInputElement>(`#${id}`)!;

  function type(id: string, value: string): void {
    input(id).value = value;
    input(id).dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  async function submit(formIndex: number): Promise<void> {
    el.querySelectorAll('form')[formIndex].dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const status = (formIndex: number) =>
    el.querySelectorAll('form')[formIndex].querySelector('[role="status"]')?.textContent?.trim();
  const alert = (formIndex: number) =>
    el.querySelectorAll('form')[formIndex].querySelector('[role="alert"]')?.textContent?.trim();

  it('prefills the name and phone from the signed-in Account', () => {
    expect(input('profile-name').value).toBe('Ama Mensah');
    expect(input('profile-phone').value).toBe('+233241234567');
  });

  it('labels every field', () => {
    for (const field of el.querySelectorAll('input')) {
      expect(el.querySelector(`label[for="${field.id}"]`)).not.toBeNull();
    }
  });

  describe('name', () => {
    it('saves the trimmed name and announces it', async () => {
      type('profile-name', '  Ama K. Mensah  ');

      await submit(0);

      expect(accountSettings.updateName).toHaveBeenCalledWith('Ama K. Mensah');
      expect(status(0)).toBe('Your name is saved.');
    });

    it('refuses a blank name: shows the error, marks the field and focuses it', async () => {
      type('profile-name', '   ');

      await submit(0);

      expect(accountSettings.updateName).not.toHaveBeenCalled();
      expect(input('profile-name').getAttribute('aria-invalid')).toBe('true');
      expect(input('profile-name').getAttribute('aria-describedby')).toBe('profile-name-error');
      expect(el.querySelector('#profile-name-error')).not.toBeNull();
      expect(document.activeElement).toBe(input('profile-name'));
    });
  });

  describe('phone', () => {
    it('sends the number in E.164 with the current password, then clears the password', async () => {
      type('profile-phone', '+233 20 765 4321');
      type('profile-phone-password', 'secret-pass');

      await submit(1);

      expect(accountSettings.updatePhone).toHaveBeenCalledWith('+233207654321', 'secret-pass');
      expect(status(1)).toBe('Your phone number is saved.');
      expect(input('profile-phone-password').value).toBe('');
    });

    it('needs the current password before saving', async () => {
      await submit(1);

      expect(accountSettings.updatePhone).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(input('profile-phone-password'));
    });

    it('shows a number already in use as an inline alert', async () => {
      accountSettings.updatePhone.mockRejectedValueOnce(
        new ServiceError('That phone number is already in use'),
      );
      type('profile-phone-password', 'secret-pass');

      await submit(1);

      expect(alert(1)).toBe('That phone number is already in use');
      expect(status(1)).toBe('');
    });
  });

  describe('password', () => {
    function fillPasswords(current: string, next: string, confirm: string): void {
      type('profile-current-password', current);
      type('profile-new-password', next);
      type('profile-confirm-password', confirm);
    }

    it('changes the password and clears the form', async () => {
      fillPasswords('old-password', 'new-password', 'new-password');

      await submit(2);

      expect(accountSettings.updatePassword).toHaveBeenCalledWith('new-password', 'old-password');
      expect(status(2)).toBe('Your password is changed.');
      expect(input('profile-new-password').value).toBe('');
    });

    it('refuses a confirmation that does not match', async () => {
      fillPasswords('old-password', 'new-password', 'new-passwrod');

      await submit(2);

      expect(accountSettings.updatePassword).not.toHaveBeenCalled();
      expect(el.querySelector('#profile-confirm-password-error')).not.toBeNull();
      expect(document.activeElement).toBe(input('profile-confirm-password'));
    });

    it('refuses a new password shorter than 8 characters', async () => {
      fillPasswords('old-password', 'short', 'short');

      await submit(2);

      expect(accountSettings.updatePassword).not.toHaveBeenCalled();
      expect(el.querySelector('#profile-new-password-error')).not.toBeNull();
    });

    it('shows a wrong current password as an inline alert', async () => {
      accountSettings.updatePassword.mockRejectedValueOnce(
        new ServiceError('Current password is incorrect'),
      );
      fillPasswords('wrong-password', 'new-password', 'new-password');

      await submit(2);

      expect(alert(2)).toBe('Current password is incorrect');
    });
  });
});
