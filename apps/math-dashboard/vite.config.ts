import { defineConfig } from 'vite';
import { resolveDashboardBase } from './src/config/base-path.js';

export default defineConfig({
  base: resolveDashboardBase(process.env),
  build: { target: 'es2022' },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});
