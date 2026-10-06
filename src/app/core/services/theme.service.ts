import { Injectable, computed, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
/** 'system' follows the OS colour scheme, live. */
export type ThemePreference = Theme | 'system';

const STORAGE_KEY = 'givio-theme';

/**
 * System preference by default; an explicit choice is sticky (persisted) and then wins over
 * any later OS-level change, matching how most SaaS theme switchers behave. Choosing 'system'
 * again from Settings hands control back to the OS.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemTheme = signal<Theme>(themeFor(this.media.matches));

  private readonly _preference = signal<ThemePreference>(readStoredPreference());
  public readonly preference = this._preference.asReadonly();
  /** The theme actually applied — always light or dark, whatever the preference. */
  public readonly theme = computed<Theme>(() => {
    const preference = this._preference();
    return preference === 'system' ? this.systemTheme() : preference;
  });

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.theme());
    });
    this.media.addEventListener('change', (event) => {
      this.systemTheme.set(themeFor(event.matches));
    });
  }

  toggle(): void {
    this.setPreference(this.theme() === 'dark' ? 'light' : 'dark');
  }

  setPreference(preference: ThemePreference): void {
    this._preference.set(preference);
    localStorage.setItem(STORAGE_KEY, preference);
  }
}

// Nothing stored (or an unknown value) means the user never chose — follow the OS.
function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function themeFor(prefersDark: boolean): Theme {
  return prefersDark ? 'dark' : 'light';
}
