import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertFiniteReport,
  runSimulation,
  SeededRandom,
  validateConfig,
} from '@lucky/math-engine';
import { formatPercentRatio } from '@lucky/shared-types';
import { loadSourceConfig } from './lib/source-loader.js';

function option(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  const position = process.argv.indexOf(`--${name}`);
  const raw =
    inline?.slice(prefix.length) ?? (position >= 0 ? process.argv[position + 1] : undefined);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`${name} must be a positive integer`);
  return value;
}

const spins = option('spins', 100_000);
const seed = option('seed', 2026);
const { config } = await loadSourceConfig();
const issues = validateConfig(config);
if (issues.length > 0) throw new Error(`Simulation stopped: ${issues.length} validation issue(s)`);
const report = runSimulation(config, { spins, seed }, new SeededRandom(seed));
assertFiniteReport(report);
const componentTotal =
  report.components.baseGameRegularPayout +
  report.components.baseGameScatterPayout +
  report.components.baseGameMultiplierUplift +
  report.components.freeGameRegularPayout +
  report.components.freeGameScatterPayout +
  report.components.freeGameMultiplierUplift;
if (
  Math.abs(componentTotal - report.totalCreditedWin) >
  1e-8 * Math.max(1, report.totalCreditedWin)
)
  throw new Error('RTP component reconciliation failed');
await mkdir(resolve(process.cwd(), 'math/reports'), { recursive: true });
const output = resolve(process.cwd(), `math/reports/bathala-simulation-${seed}-${spins}.json`);
const envelope = {
  metadata: {
    schemaVersion: report.schemaVersion,
    gameId: config.gameId,
    gameName: config.gameName,
    gameVersion: config.gameVersion,
    configurationId: config.configurationId,
    generatedAt: new Date().toISOString(),
    calibrationProfile: 'placeholder calibration profile',
  },
  simulation: { methodology: report.methodology, spins, seed },
  metrics: report,
};
await writeFile(output, `${JSON.stringify(envelope, null, 2)}\n`);
if (spins === 100_000 && seed === 2026)
  await writeFile(
    resolve(
      process.cwd(),
      'apps/math-dashboard/public/reports/bathala-simulation-2026-100000.json',
    ),
    `${JSON.stringify(envelope, null, 2)}\n`,
  );
console.log(
  `Simulated ${spins.toLocaleString()} spins: RTP ${formatPercentRatio(report.rtp, 4)}, hit ${formatPercentRatio(report.winningSpinFrequency, 4)}, features ${report.freeGameTriggerCount}.`,
);
console.log(`Report: ${output}`);
