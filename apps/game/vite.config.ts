import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/lucky/' : '/',
  build: { target: 'es2022' },
});
