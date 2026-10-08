import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ACCOUNT } from '../../../../core/appwrite/client';
import { AuthService } from '../../../../data/services/auth.service';
import { UserService } from '../../../../data/services/user.service';
import type { AdminUser } from '../../../../data/models/admin-user';
import { AdminUsers } from './admin-users';

const ACTIVE: AdminUser = {
  id: 'op-1',
  name: 'Esi Operator',
  email: 'esi@givio.test',
  role: 'operator',
  active: true,
  registeredAt: '2026-03-01',
};
const DEACTIVATED: AdminUser = { ...ACTIVE, id: 'op-2', name: 'Kwame Gone', active: false };

describe('AdminUsers sign out everywhere', () => {
  let fixture: ComponentFixture<AdminUsers>;

  beforeEach(async () => {
    const userService = { listUsers: vi.fn().mockResolvedValue([ACTIVE, DEACTIVATED]) };
    const account = {
      get: vi.fn().mockResolvedValue({ $id: 'super-1', labels: ['admin', 'superadmin'] }),
    };
    await TestBed.configureTestingModule({
      imports: [AdminUsers],
      providers: [
        { provide: UserService, useValue: userService },
        { provide: ACCOUNT, useValue: account },
      ],
    }).compileComponents();
    await TestBed.inject(AuthService).restoreSession();
    fixture = TestBed.createComponent(AdminUsers);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('offers Sign out everywhere only on deactivated rows', () => {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('app-sign-out-everywhere button'),
    );
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Sign out everywhere: Kwame Gone',
    ]);
  });
});
