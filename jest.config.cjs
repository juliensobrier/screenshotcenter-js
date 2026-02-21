/** @type {import('jest').Config} */
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
  // Run both unit and integration tests.
  // Integration tests self-skip when SCREENSHOTCENTER_API_KEY is not set.
  testMatch: ['**/tests/client.test.ts', '**/tests/integration.test.ts'],
  // Integration tests create real screenshots — allow up to 2 minutes.
  testTimeout: 120_000,
  collectCoverageFrom: ['src/**/*.ts'],
};
