/**
 * Run only the integration tests — useful for CI jobs that want to isolate
 * live API runs from the unit suite.
 *
 * Prefer `npm test` for local development: it runs both suites and
 * integration tests self-skip when SCREENSHOTCENTER_API_KEY is absent.
 *
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  testMatch: ['**/tests/integration.test.ts'],
  testTimeout: 120_000,
};
