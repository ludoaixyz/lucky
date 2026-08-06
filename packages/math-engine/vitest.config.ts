import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'math-engine', environment: 'node', include: ['tests/**/*.test.ts'] },
});
