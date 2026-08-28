// Global Vitest setup (wired via angular.json's test.options.setupFiles) — runs once before
// any spec file's own module graph loads, which matters for Dexie: its `Dexie.dependencies`
// snapshot needs a working `indexedDB` in place before any module constructs the app's
// singleton AppDb (see data/dexie/dexie-test-setup.ts for why this can't just live per-spec).
import './app/data/dexie/dexie-test-setup';
