import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FamilyCode } from './family-code';
import {
  FamilyAccessDataService,
  FamilyCodeRejectedError,
  type FamilyAccessResult,
} from '../../../../data/services/family-access-data.service';
import { ServiceError } from '../../../../core/services/service-error';

const CODE = 'ABCD2345';

const result = (): FamilyAccessResult => ({
  event: {
    name: 'Odoi Funeral Service',
    type: 'funeral',
    venue: 'Accra',
    date: '2026-06-01',
    status: 'active',
  },
  donations: [],
});

const rejected = () => new FamilyCodeRejectedError('{"error":"Code not recognised"}');
const serverError = () =>
  new ServiceError(
    'Failed to load donations, try again',
    '{"error":"Failed to load donations, try again"}',
  );

function setup(resolveByCode: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    imports: [FamilyCode],
    providers: [
      provideRouter([]),
      { provide: FamilyAccessDataService, useValue: { resolveByCode } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(FamilyCode);
  const component = fixture.componentInstance;
  component.code.set(CODE);
  const alert = () => {
    fixture.detectChanges();
    return (
      (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent ?? ''
    );
  };
  return { component, navigate, alert };
}

describe('FamilyCode — submit', () => {
  it('a server or network error shows a retry message and does not count toward the lockout', async () => {
    const resolveByCode = vi.fn().mockRejectedValue(serverError());
    const { component, alert } = setup(resolveByCode);

    for (let i = 0; i < 6; i++) await component.submit();
    resolveByCode.mockRejectedValue(new ServiceError('Could not reach the server', new Error('x')));
    await component.submit();

    expect(component.tries()).toBe(0);
    expect(component.error()).toBe('unavailable');
    expect(component.cooling()).toBe(false);
    expect(alert()).toContain("We couldn't check the code just now");
    expect(alert()).not.toContain('did not work');
  });

  it('a rejected code counts toward the lockout and locks out at the fifth try', async () => {
    const resolveByCode = vi.fn().mockRejectedValue(rejected());
    const { component, alert } = setup(resolveByCode);

    await component.submit();
    expect(component.tries()).toBe(1);
    expect(alert()).toContain('That code did not work');

    for (let i = 0; i < 4; i++) await component.submit();
    expect(component.tries()).toBe(5);
    expect(component.error()).toBe('cooldown');
    expect(component.cooling()).toBe(true);
    expect(component.canSubmit()).toBe(false);
  });

  it('a server error between rejections does not reset or advance the count', async () => {
    const resolveByCode = vi
      .fn()
      .mockRejectedValueOnce(rejected())
      .mockRejectedValueOnce(serverError());
    const { component } = setup(resolveByCode);

    await component.submit();
    await component.submit();

    expect(component.tries()).toBe(1);
    expect(component.error()).toBe('unavailable');
  });

  it('a recognised code navigates to the live view and resets the count', async () => {
    const resolveByCode = vi.fn().mockRejectedValueOnce(rejected()).mockResolvedValue(result());
    const { component, navigate } = setup(resolveByCode);

    await component.submit();
    await component.submit();

    expect(component.tries()).toBe(0);
    expect(navigate).toHaveBeenCalledWith(['/family', expect.any(String)]);
  });

  it('editing the code clears the retry message', async () => {
    const { component } = setup(vi.fn().mockRejectedValue(serverError()));
    await component.submit();

    component.onInput('ABCD');

    expect(component.error()).toBeNull();
  });
});
