import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let osPrefersDark: boolean;
  let notifyOsChange: (prefersDark: boolean) => void;

  function create(stored?: string): ThemeService {
    if (stored !== undefined) localStorage.setItem('givio-theme', stored);
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: osPrefersDark,
          media: query,
          addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => {
            notifyOsChange = (prefersDark) => listener({ matches: prefersDark });
          },
        }) as unknown as MediaQueryList,
    );
    return TestBed.inject(ThemeService);
  }

  beforeEach(() => {
    osPrefersDark = false;
    localStorage.removeItem('givio-theme');
  });

  afterEach(() => {
    localStorage.removeItem('givio-theme');
    vi.restoreAllMocks();
  });

  it('follows the OS when nothing is stored, including a live change', () => {
    osPrefersDark = true;
    const service = create();

    expect(service.preference()).toBe('system');
    expect(service.theme()).toBe('dark');

    notifyOsChange(false);
    expect(service.theme()).toBe('light');
  });

  it('keeps an explicit stored theme from before Settings existed', () => {
    osPrefersDark = true;
    const service = create('light');

    expect(service.preference()).toBe('light');
    expect(service.theme()).toBe('light');
    notifyOsChange(true);
    expect(service.theme()).toBe('light');
  });

  it("setPreference('system') persists and hands control back to the OS", () => {
    const service = create('dark');

    service.setPreference('system');

    expect(localStorage.getItem('givio-theme')).toBe('system');
    expect(service.theme()).toBe('light');
    notifyOsChange(true);
    expect(service.theme()).toBe('dark');
  });

  it('restores a stored system preference', () => {
    osPrefersDark = true;
    const service = create('system');

    expect(service.preference()).toBe('system');
    expect(service.theme()).toBe('dark');
  });

  it('toggle() flips the applied theme and stores it as an explicit choice', () => {
    osPrefersDark = true;
    const service = create();

    service.toggle();

    expect(service.preference()).toBe('light');
    expect(localStorage.getItem('givio-theme')).toBe('light');
  });

  it('applies the resolved theme to the document', () => {
    const service = create();

    service.setPreference('dark');
    TestBed.tick();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
