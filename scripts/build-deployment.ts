import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveDeploymentBases } from './lib/deployment-base.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const gameDist = resolve(repositoryRoot, 'apps/game/dist');
const dashboardDist = resolve(repositoryRoot, 'apps/math-dashboard/dist');
const reportDist = resolve(repositoryRoot, 'apps/report/dist');
const pagesDist = resolve(repositoryRoot, 'dist-pages');
const assembledDashboard = resolve(pagesDist, 'dashboard');
const assembledReport = resolve(pagesDist, 'report');
const npmCli = process.env.npm_execpath;
const bases = resolveDeploymentBases(process.env.VITE_BASE_PATH);

function runNpmScript(script: string, environment = process.env): void {
  if (!npmCli) throw new Error('npm_execpath is unavailable; run this build through npm');

  console.info(`[deploy] Running npm run ${script}`);

  const result = spawnSync(process.execPath, [npmCli, 'run', script], {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm run ${script} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function requirePath(path: string, type: 'directory' | 'file', label: string): void {
  if (
    !existsSync(path) ||
    (type === 'directory' ? !statSync(path).isDirectory() : !statSync(path).isFile())
  ) {
    throw new Error(`${label} was not created at ${path}`);
  }
}

function verifyHtmlBase(htmlPath: string, base: string, label: string): void {
  const html = readFileSync(htmlPath, 'utf8');
  const references = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gu)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
  const invalid = references.filter(
    (reference) =>
      reference.startsWith('/src/') ||
      (base !== '/' && reference.startsWith('/') && !reference.startsWith(base)),
  );

  if (invalid.length) {
    throw new Error(`${label} contains references outside ${base}: ${invalid.join(', ')}`);
  }
}

try {
  console.info(`[deploy] Game base: ${bases.game}`);
  console.info(`[deploy] Dashboard base: ${bases.dashboard}`);
  console.info(`[deploy] Report base: ${bases.report}`);

  runNpmScript('build', { ...process.env, VITE_BASE_PATH: bases.game });
  requirePath(gameDist, 'directory', 'Game production bundle');

  runNpmScript('dashboard:build', {
    ...process.env,
    VITE_BASE_PATH: bases.dashboard,
  });
  requirePath(dashboardDist, 'directory', 'Dashboard production bundle');

  runNpmScript('report:build', { ...process.env, VITE_BASE_PATH: bases.report });
  requirePath(reportDist, 'directory', 'Report production bundle');

  console.info('[deploy] Assembling Pages artifact at dist-pages');
  rmSync(pagesDist, { force: true, recursive: true });
  cpSync(gameDist, pagesDist, { recursive: true });
  cpSync(dashboardDist, assembledDashboard, { recursive: true });
  cpSync(reportDist, assembledReport, { recursive: true });
  requirePath(pagesDist, 'directory', 'Combined Pages artifact');
  requirePath(assembledDashboard, 'directory', 'Assembled dashboard bundle');
  requirePath(assembledReport, 'directory', 'Assembled report bundle');

  const gameIndex = resolve(pagesDist, 'index.html');
  const dashboardIndex = resolve(assembledDashboard, 'index.html');
  const reportIndex = resolve(assembledReport, 'index.html');
  requirePath(gameIndex, 'file', 'Game entry point');
  requirePath(dashboardIndex, 'file', 'Dashboard entry point');
  requirePath(reportIndex, 'file', 'Report entry point');
  verifyHtmlBase(gameIndex, bases.game, 'Game entry point');
  verifyHtmlBase(dashboardIndex, bases.dashboard, 'Dashboard entry point');
  verifyHtmlBase(reportIndex, bases.report, 'Report entry point');

  console.info('[deploy] Deployment bundle ready at dist-pages');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[deploy] Build failed: ${message}`);
  process.exitCode = 1;
}
