import { defineConfig } from 'vitest/config';

// Loaded by the Angular unit-test builder through `runnerConfig` (angular.json). The builder
// merges this with its own settings, so only the values we override live here. On a loaded
// machine the first spec's cold compile exceeds Vitest's 5 s test / 10 s hook defaults.
export default defineConfig({
  test: {
    testTimeout: 20000,
    hookTimeout: 30000,
    outputFile: { junit: 'test-results/angular-junit.xml' },
  },
});
