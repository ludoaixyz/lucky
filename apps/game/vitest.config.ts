import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, '../..'),
  test: {
    name: 'game',
    environment: 'jsdom',
    include: ['apps/game/tests/bathala-prototype.test.ts', 'apps/game/tests/workbench.test.ts'],
  },
});
