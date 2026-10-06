import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService, type ThemePreference } from '../../../../core/services/theme.service';
import { AppearanceSettings } from './appearance-settings';

describe('AppearanceSettings', () => {
  let setPreference: ReturnType<typeof vi.fn>;

  async function render(preference: ThemePreference): Promise<HTMLElement> {
    setPreference = vi.fn();
    TestBed.configureTestingModule({
      imports: [AppearanceSettings],
      providers: [
        { provide: ThemeService, useValue: { preference: signal(preference), setPreference } },
      ],
    });
    const fixture = TestBed.createComponent(AppearanceSettings);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const radios = (el: HTMLElement) => [
    ...el.querySelectorAll<HTMLInputElement>('fieldset input[type="radio"]'),
  ];

  it('offers Light, Dark and Match my device as one labelled radio group', async () => {
    const el = await render('system');

    expect(el.querySelector('fieldset legend')).not.toBeNull();
    expect(radios(el).map((radio) => radio.closest('label')?.textContent?.trim())).toEqual([
      'Light',
      'Dark',
      'Match my device',
    ]);
  });

  it('checks the current preference', async () => {
    const el = await render('system');

    expect(radios(el).map((radio) => radio.checked)).toEqual([false, false, true]);
  });

  it('applies a picked theme straight away', async () => {
    const el = await render('system');

    radios(el)[1].click();

    expect(setPreference).toHaveBeenCalledWith('dark');
  });
});
