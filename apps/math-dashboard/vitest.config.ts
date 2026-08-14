import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, '../..'),
  test: {
    name: 'math-dashboard',
    environment: 'jsdom',
    include: ['apps/math-dashboard/tests/**/*.test.ts'],
  },
});
