// Global Vitest setup (wired via angular.json's test.options.setupFiles) — runs once before
// any spec file's own module graph loads, which matters for Dexie: its `Dexie.dependencies`
// snapshot needs a working `indexedDB` in place before any module constructs the app's
// singleton AppDb (see data/dexie/dexie-test-setup.ts for why this can't just live per-spec).
import './app/data/dexie/dexie-test-setup';

// The test environment doesn't implement matchMedia — ThemeService (core/services) reads it
// eagerly in its constructor to seed the initial theme from the OS preference.
if (typeof window.matchMedia !== 'function') {
  const noop = (): void => undefined;
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: noop,
      removeListener: noop,
      addEventListener: noop,
      removeEventListener: noop,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
