import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'givio-theme';

/**
 * System preference by default; an explicit toggle is sticky (persisted) and then wins over
 * any later OS-level change, matching how most SaaS theme switchers behave.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  private readonly _theme = signal<Theme>(this.readInitialTheme());
  public readonly theme = this._theme.asReadonly();

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-theme', this._theme());
    });

    // Only follow a live OS change if the user has never made an explicit choice here —
    // once toggle() runs, that choice is sticky regardless of what the OS does afterward.
    this.media.addEventListener('change', (event) => {
      if (localStorage.getItem(STORAGE_KEY) === null) {
        this._theme.set(event.matches ? 'dark' : 'light');
      }
    });
  }

  toggle(): void {
    const next: Theme = this._theme() === 'dark' ? 'light' : 'dark';
    this._theme.set(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  private readInitialTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return this.media.matches ? 'dark' : 'light';
  }
}
