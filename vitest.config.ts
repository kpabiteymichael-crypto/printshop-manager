import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['server/__tests__/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['verbose'],
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
