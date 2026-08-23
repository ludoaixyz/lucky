import { defineConfig } from 'vite';

function normalizedBase(value: string | undefined): string {
  if (!value || value === '/') return '/';
  return `/${value.replace(/^\/+|\/+$/gu, '')}/`;
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH
    ? normalizedBase(process.env.VITE_BASE_PATH)
    : process.env.GITHUB_ACTIONS
      ? '/lucky/report/'
      : '/',
  build: { target: 'es2020' },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
});
