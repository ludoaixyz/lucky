import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'game', environment: 'node', include: ['tests/**/*.test.ts'] },
});
