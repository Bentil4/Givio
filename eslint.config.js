// @ts-check
const eslint = require("@eslint/js");
const { defineConfig } = require("eslint/config");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = defineConfig([
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      "@angular-eslint/directive-selector": [
        "error",
        {
          type: "attribute",
          prefix: "app",
          style: "camelCase",
        },
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          type: "element",
          prefix: "app",
          style: "kebab-case",
        },
      ],
    },
  },
  {
    // Clean Code standards (CLAUDE.md): small functions, few arguments, no deep nesting.
    // Specs are exempt, since describe/it callbacks are long by nature.
    files: ["**/*.ts"],
    ignores: ["**/*.spec.ts"],
    rules: {
      "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true }],
      "max-params": ["error", 3],
      "max-depth": ["error", 2],
    },
  },
  {
    // Legacy files that broke the rules above when they were introduced. They stay warnings
    // until the clean-code conformance task fixes them; remove each entry once it's fixed.
    files: [
      "src/app/data/appwrite/invoke-admin-function.ts",
      "src/app/data/services/audit-log-writer.ts",
      "src/app/data/services/donation-data.service.ts",
      "src/app/data/services/event-data.service.ts",
      "src/app/data/services/receipt.service.ts",
      "src/app/data/services/sync-engine.service.ts",
      "src/app/data/services/tenant-data.service.ts",
      "src/app/feature/pages/admin/admin-event-detail/admin-event-detail.ts",
      "src/app/feature/pages/admin/admin-users/admin-users.ts",
    ],
    rules: {
      "max-lines-per-function": ["warn", { max: 40, skipBlankLines: true, skipComments: true }],
      "max-params": ["warn", 3],
      "max-depth": ["warn", 2],
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
    rules: {},
  }
]);
