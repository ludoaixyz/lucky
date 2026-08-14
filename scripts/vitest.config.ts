import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, '..'),
  test: { name: 'scripts', environment: 'node', include: ['scripts/tests/bathala-source.test.ts'] },
});
