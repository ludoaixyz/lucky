import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'math-dashboard', environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
