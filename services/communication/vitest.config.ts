import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Scan only source. Without an explicit exclude, stale compiled tests in
    // dist/ get picked up as a second copy of every suite.
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    environment: 'node',
    testTimeout: 10000,
  },
});
