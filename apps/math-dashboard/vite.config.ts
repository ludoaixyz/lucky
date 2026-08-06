import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/lucky/math-dashboard/' : '/',
  build: { target: 'es2022' },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
