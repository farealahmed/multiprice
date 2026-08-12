import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the backend.
 *
 * Source uses `.ts` extensions in imports (matching what `tsx` runs in dev
 * and what Vite resolves natively). `allowImportingTsExtensions` in
 * `tsconfig.json` lets TypeScript validate this.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
  },
});