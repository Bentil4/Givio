import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceError } from '../../../core/services/service-error';
import { UserService } from '../../../data/services/user.service';
import { SignOutEverywhere } from './sign-out-everywhere';

describe('SignOutEverywhere', () => {
  let fixture: ComponentFixture<SignOutEverywhere>;
  let forceExpireSessions: ReturnType<typeof vi.fn>;

  const button = (): HTMLButtonElement => fixture.nativeElement.querySelector('button');
  const status = (): HTMLElement => fixture.nativeElement.querySelector('[role="status"]');

  beforeEach(async () => {
    forceExpireSessions = vi.fn().mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [SignOutEverywhere],
      providers: [{ provide: UserService, useValue: { forceExpireSessions } }],
    }).compileComponents();
    fixture = TestBed.createComponent(SignOutEverywhere);
    fixture.componentRef.setInput('userId', 'u-1');
    fixture.componentRef.setInput('name', 'Ama Admin');
    fixture.detectChanges();
  });

  it('names the person in the accessible name', () => {
    expect(button().getAttribute('aria-label')).toBe('Sign out everywhere: Ama Admin');
  });

  it('announces success politely and expires that user', async () => {
    await fixture.componentInstance.signOut();
    fixture.detectChanges();
    expect(forceExpireSessions).toHaveBeenCalledWith('u-1');
    expect(status().textContent).toContain('Signed out everywhere');
  });

  it('disables the button while running', () => {
    forceExpireSessions.mockReturnValue(new Promise(() => undefined));
    void fixture.componentInstance.signOut();
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
  });

  it('reports the error and offers a retry', async () => {
    forceExpireSessions.mockRejectedValue(new ServiceError('Failed to force sign-out'));
    await fixture.componentInstance.signOut();
    fixture.detectChanges();
    expect(status().textContent).toContain('Failed to force sign-out');
    expect(button().getAttribute('aria-label')).toBe('Retry sign out: Ama Admin');
    expect(button().disabled).toBe(false);
  });
});
