import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../../data/services/auth.service';
import { CompanyLayout } from './company-layout';

describe('CompanyLayout', () => {
  let logout: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    logout = vi.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [CompanyLayout],
      providers: [provideRouter([]), { provide: AuthService, useValue: { logout } }],
    }).compileComponents();
  });

  it('renders the sidebar with the Dashboard nav item for an approved tenant', async () => {
    const fixture = TestBed.createComponent(CompanyLayout);
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const link = el.querySelector('app-sidebar nav a');
    expect(link?.textContent).toContain('Dashboard');
    expect(link?.getAttribute('href')).toBe('/company');
  });

  it('logs out to /login', async () => {
    const fixture = TestBed.createComponent(CompanyLayout);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await fixture.componentInstance.onLogout();

    expect(logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
