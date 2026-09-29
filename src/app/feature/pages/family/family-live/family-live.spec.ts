import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { FamilyLive } from './family-live';
import { FamilyAccessService } from '../../../../data/services/family-access.service';
import {
  FamilyAccessDataService,
  FamilyCodeRejectedError,
  type FamilyAccessResult,
} from '../../../../data/services/family-access-data.service';
import { ServiceError } from '../../../../core/services/service-error';
import { ReportService } from '../../../../data/services/report.service';
import { base64UrlEncode } from '../../../../utils/base64-url.util';

const CODE = 'ABCD2345';

const result = (): FamilyAccessResult => ({
  event: {
    name: 'Odoi Funeral Service',
    type: 'funeral',
    venue: 'Accra',
    date: '2026-06-01',
    status: 'active',
  },
  donations: [
    {
      id: 'd1',
      eventId: '',
      receiptNumber: 'd1',
      donorName: 'Kofi',
      amountMinor: 5000,
      donationType: 'cash',
      recordedBy: '',
      recordedAt: '2026-01-01T00:00:00.000Z',
      syncStatus: 'synced',
    },
  ],
});

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function setup(
  resolveByCode = vi.fn().mockResolvedValue(result()),
  beforeCreate: () => void = () => undefined,
) {
  TestBed.configureTestingModule({
    imports: [FamilyLive],
    providers: [
      provideRouter([]),
      { provide: FamilyAccessDataService, useValue: { resolveByCode } },
      { provide: ReportService, useValue: { exportDonationsXlsx: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ code: base64UrlEncode(CODE) }) } },
      },
    ],
  });

  const router = TestBed.inject(Router);
  const location = TestBed.inject(Location);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const replaceState = vi.spyOn(location, 'replaceState').mockImplementation(() => undefined);
  const access = TestBed.inject(FamilyAccessService);
  beforeCreate();

  const fixture = TestBed.createComponent(FamilyLive);
  const component = fixture.componentInstance;
  await component.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();

  const el: HTMLElement = fixture.nativeElement;
  const dialog = () => el.querySelector<HTMLElement>('[role="dialog"]');
  const total = () => el.querySelector('.family-total');
  const button = (label: RegExp) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      label.test(b.textContent ?? ''),
    );

  return {
    fixture,
    component,
    el,
    dialog,
    total,
    button,
    navigateByUrl,
    replaceState,
    access,
    resolveByCode,
  };
}

describe('FamilyLive — personal-device prompt (FR-16)', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    vi.useRealTimers();
  });

  it('asks before the total renders, as a modal dialog with focus on its first control', async () => {
    const { dialog, total, button } = await setup();

    expect(total()).toBeNull();
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(dialog()?.textContent).toContain('Is this your personal phone?');
    expect(document.activeElement).toBe(button(/Yes, my personal phone/));
  });

  it('offers no dismiss control — only the two answers, and Escape does nothing', async () => {
    const { fixture, dialog } = await setup();

    const buttons = Array.from(dialog()!.querySelectorAll('button')).map((b) =>
      b.textContent?.trim(),
    );
    expect(buttons).toEqual(['Yes, my personal phone', 'No, not my phone']);
    expect(dialog()!.querySelector('[aria-label*="lose" i], [aria-label*="dismiss" i]')).toBeNull();

    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(dialog()).not.toBeNull();
  });

  it('shows the total once answered, and moves focus to the page heading', async () => {
    const { fixture, button, total, dialog, el } = await setup();

    button(/No, not my phone/)!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(dialog()).toBeNull();
    expect(total()?.textContent).toContain('50');
    expect(document.activeElement).toBe(el.querySelector('h1.family-title'));
  });

  it('"No": overwrites the code-bearing history entry immediately', async () => {
    const { fixture, button, replaceState } = await setup();

    button(/No, not my phone/)!.click();
    fixture.detectChanges();

    expect(replaceState).toHaveBeenCalledWith('/family');
  });

  it('"No" + backgrounding the tab: clears all family data, stops polling and returns to code entry', async () => {
    const { fixture, component, button, el, navigateByUrl, resolveByCode } = await setup();
    button(/No, not my phone/)!.click();
    fixture.detectChanges();
    vi.useFakeTimers();

    setVisibility('hidden');

    expect(component.cleared()).toBe(true);
    expect(component.event()).toBeNull();
    expect(component.donations()).toEqual([]);
    expect(el.textContent).not.toContain('Odoi Funeral Service');
    expect(el.querySelector('.family-total')).toBeNull();
    expect(navigateByUrl).toHaveBeenCalledWith('/family', { replaceUrl: true });

    resolveByCode.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolveByCode).not.toHaveBeenCalled();
  });

  it('"No" + leaving the page (pagehide) clears the session too', async () => {
    const { fixture, component, button, navigateByUrl } = await setup();
    button(/No, not my phone/)!.click();
    fixture.detectChanges();

    window.dispatchEvent(new Event('pagehide'));

    expect(component.cleared()).toBe(true);
    expect(navigateByUrl).toHaveBeenCalledWith('/family', { replaceUrl: true });
  });

  it('"No" is never remembered, and overrides an earlier "yes" for the same code', async () => {
    const { fixture, button, access, component } = await setup(undefined, () =>
      TestBed.inject(FamilyAccessService).markPersonalDevice(CODE),
    );
    expect(component.deviceAnswer()).toBe('personal');

    component.deviceAnswer.set(null);
    fixture.detectChanges();
    button(/No, not my phone/)!.click();

    expect(access.isPersonalDevice(CODE)).toBe(false);
  });

  it('an unanswered prompt is treated as "not my phone" when the tab is backgrounded', async () => {
    const { component, navigateByUrl } = await setup();

    setVisibility('hidden');

    expect(component.cleared()).toBe(true);
    expect(navigateByUrl).toHaveBeenCalledWith('/family', { replaceUrl: true });
  });

  it('"Yes": backgrounding and returning keeps the session, and the answer is not asked again in-app', async () => {
    const { fixture, component, button, total, navigateByUrl, replaceState, access } =
      await setup();
    button(/Yes, my personal phone/)!.click();
    fixture.detectChanges();

    setVisibility('hidden');
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('visible');
    fixture.detectChanges();

    expect(component.cleared()).toBe(false);
    expect(total()).not.toBeNull();
    expect(navigateByUrl).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(access.isPersonalDevice(CODE)).toBe(true);
  });

  it('"Yes" is honoured when the view is opened again in the same tab (no re-prompt)', async () => {
    const { dialog, total } = await setup(undefined, () =>
      TestBed.inject(FamilyAccessService).markPersonalDevice(CODE),
    );

    expect(dialog()).toBeNull();
    expect(total()).not.toBeNull();
  });
});

describe('FamilyLive — code regenerated mid-session (FR-16 leak recovery)', () => {
  afterEach(() => vi.useRealTimers());

  it("stops showing the family's data and offers code entry once a poll is rejected", async () => {
    const resolveByCode = vi.fn().mockResolvedValue(result());
    const { fixture, component, button, el } = await setup(resolveByCode);
    button(/Yes, my personal phone/)!.click();
    fixture.detectChanges();
    vi.useFakeTimers();

    resolveByCode.mockRejectedValue(new FamilyCodeRejectedError('{"error":"Code not recognised"}'));
    await vi.advanceTimersByTimeAsync(15_000);
    fixture.detectChanges();

    expect(component.notFound()).toBe(true);
    expect(component.donations()).toEqual([]);
    expect(el.textContent).not.toContain('Odoi Funeral Service');
    expect(el.querySelector('a[href="/family"]')).not.toBeNull();

    resolveByCode.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolveByCode).not.toHaveBeenCalled();
  });

  it('a network failure keeps the loaded summary and shows "Reconnecting…"', async () => {
    const resolveByCode = vi.fn().mockResolvedValue(result());
    const { fixture, component, button } = await setup(resolveByCode);
    button(/Yes, my personal phone/)!.click();
    fixture.detectChanges();
    vi.useFakeTimers();

    resolveByCode.mockRejectedValue(new ServiceError('Code not recognised', new Error('offline')));
    await vi.advanceTimersByTimeAsync(15_000);

    expect(component.notFound()).toBe(false);
    expect(component.connected()).toBe(false);
    expect(component.donations().length).toBe(1);
  });
});
