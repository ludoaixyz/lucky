import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, '../..'),
  test: {
    name: 'math-engine',
    environment: 'node',
    include: ['packages/math-engine/tests/bathala-engine.test.ts'],
  },
});
