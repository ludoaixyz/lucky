import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: 'scripts', environment: 'node', include: ['tests/**/*.test.ts'] },
});
