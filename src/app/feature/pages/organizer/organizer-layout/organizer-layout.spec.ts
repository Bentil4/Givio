import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ACCOUNT } from '../../../../data/appwrite/client';

import { OrganizerLayout } from './organizer-layout';

describe('OrganizerLayout', () => {
  let component: OrganizerLayout;
  let fixture: ComponentFixture<OrganizerLayout>;
  let account: { deleteSession: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    account = { deleteSession: vi.fn(), get: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [OrganizerLayout],
      providers: [provideRouter([]), { provide: ACCOUNT, useValue: account }],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizerLayout);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('onLogout logs out and navigates to /login', async () => {
    account.deleteSession.mockResolvedValueOnce({});

    await component.onLogout();

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('onLogout still navigates to /login even if the Appwrite session deletion fails', async () => {
    account.deleteSession.mockRejectedValueOnce(new Error('network error'));

    await component.onLogout();

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
