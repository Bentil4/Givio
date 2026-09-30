#!/usr/bin/env node
/**
 * Enforces CLAUDE.md's "at most 500 code lines per file" rule across the app, the Appwrite
 * Function, tests and scripts. ESLint's `max-lines` can't do this alone: `ng lint` only covers
 * src/, not functions/ or scripts/.
 *
 * Files that were already over the limit when the rule was introduced are listed in
 * LEGACY_EXCEPTIONS with their size at that time. They may shrink but never grow; delete an
 * entry once its file is split below the limit.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_CODE_LINES = 500;

const CHECKED_PATTERNS = [
  'src/**/*.ts',
  'src/**/*.html',
  'src/**/*.scss',
  'functions/**/*.js',
  'scripts/**/*.mjs',
];

const IGNORED_PREFIXES = ['src/vendor/'];

const LEGACY_EXCEPTIONS = {
  'functions/set-role-and-permissions/src/tenant-membership.js': 1202,
  'functions/set-role-and-permissions/tests/tenant-membership.test.js': 1147,
  'functions/set-role-and-permissions/tests/admin-users.test.js': 1069,
  'src/app/data/services/donation-data.service.spec.ts': 850,
  'functions/set-role-and-permissions/tests/family-access.test.js': 640,
  'src/app/data/services/event-data.service.spec.ts': 600,
  'functions/set-role-and-permissions/tests/team-management.test.js': 573,
  'functions/set-role-and-permissions/tests/tenant-read-grants.test.js': 507,
};

main();

function main() {
  const violations = trackedFiles().flatMap(checkFile);
  reportStaleExceptions();
  if (violations.length > 0) {
    printViolations(violations);
    process.exitCode = 1;
    return;
  }
  console.log(`File length OK: no file exceeds ${MAX_CODE_LINES} code lines.`);
}

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '--', ...CHECKED_PATTERNS], {
    encoding: 'utf8',
  });
  return output
    .split('\n')
    .filter((path) => path && !path.includes('/node_modules/'))
    .filter((path) => !IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix)));
}

function checkFile(path) {
  const lines = countCodeLines(readFileSync(path, 'utf8'));
  const limit = LEGACY_EXCEPTIONS[path] ?? MAX_CODE_LINES;
  return lines > limit ? [{ path, lines, limit }] : [];
}

function countCodeLines(source) {
  let inBlockComment = false;
  let count = 0;
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (inBlockComment) {
      inBlockComment = !closesBlockComment(line);
      continue;
    }
    if (isBlankOrLineComment(line)) {
      continue;
    }
    if (opensBlockComment(line)) {
      inBlockComment = !closesBlockComment(line);
      continue;
    }
    count += 1;
  }
  return count;
}

function isBlankOrLineComment(line) {
  return line === '' || line.startsWith('//') || line.startsWith('*');
}

function opensBlockComment(line) {
  return line.startsWith('/*') || line.startsWith('<!--');
}

function closesBlockComment(line) {
  return line.includes('*/') || line.includes('-->');
}

function reportStaleExceptions() {
  for (const [path, recorded] of Object.entries(LEGACY_EXCEPTIONS)) {
    const lines = safeCount(path);
    if (lines !== null && lines <= MAX_CODE_LINES) {
      console.warn(`${path} is now ${lines} lines: remove it from LEGACY_EXCEPTIONS.`);
    } else if (lines !== null && lines < recorded) {
      console.warn(`${path} shrank to ${lines} lines: lower its LEGACY_EXCEPTIONS entry.`);
    }
  }
}

function safeCount(path) {
  try {
    return countCodeLines(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function printViolations(violations) {
  console.error(`Files over the ${MAX_CODE_LINES}-code-line limit (CLAUDE.md, Clean Code):`);
  for (const { path, lines, limit } of violations) {
    const note = limit === MAX_CODE_LINES ? '' : ` (legacy exception, may not grow past ${limit})`;
    console.error(`  ${path}: ${lines} lines${note}`);
  }
  console.error('Split the file by responsibility before adding more to it.');
}
