import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'game', environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
