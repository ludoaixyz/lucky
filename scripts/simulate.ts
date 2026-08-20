import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  assertFiniteReport,
  runSimulation,
  SeededRandom,
  validateConfig,
} from '@lucky/math-engine';
import { formatPercentRatio } from '@lucky/shared-types';
import { loadSourceConfig, requireProfileId, simulationReportName } from './lib/source-loader.js';

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
const profileId = requireProfileId();
if (process.argv.some((argument) => argument === '--source' || argument.startsWith('--source=')))
  throw new Error('--source is no longer supported. Select an isolated profile with --profile.');
if (process.argv.some((argument) => argument === '--config' || argument.startsWith('--config=')))
  throw new Error('--config is no longer supported for profile simulation. Use --profile.');
const { config } = await loadSourceConfig(profileId);
console.log(
  `Math profile: ${profileId}\nSource: math/profiles/${profileId}\nSpins: ${spins.toLocaleString('en-US')}\nSeed: ${seed}`,
);
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
const reportName = simulationReportName(profileId, seed, spins);
const output = resolve(process.cwd(), 'math/reports', reportName);
const envelope = {
  metadata: {
    schemaVersion: report.schemaVersion,
    gameId: config.gameId,
    gameName: config.gameName,
    gameVersion: config.gameVersion,
    configurationId: config.configurationId,
    generatedAt: new Date().toISOString(),
    calibrationProfile: config.metadata.profileName,
  },
  simulation: { methodology: report.methodology, spins, seed },
  metrics: report,
};
if (
  envelope.metadata.configurationId !== profileId ||
  envelope.metrics.configurationId !== profileId
)
  throw new Error(`Simulation report configuration mismatch for profile "${profileId}".`);
const dashboardDirectory = resolve(process.cwd(), 'apps/math-dashboard/public/reports');
await mkdir(dashboardDirectory, { recursive: true });
const dashboardOutput = resolve(dashboardDirectory, reportName);
const serialized = `${JSON.stringify(envelope, null, 2)}\n`;
await Promise.all([writeFile(output, serialized), writeFile(dashboardOutput, serialized)]);
console.log(
  `\nSimulation complete.\n\nProfile: ${profileId}\nRTP: ${formatPercentRatio(report.rtp, 4)}\nHit frequency: ${formatPercentRatio(report.winningSpinFrequency, 4)}\nFeature frequency: ${formatPercentRatio(report.featureFrequency, 4)}\nCoV: ${report.coefficientOfVariation.toFixed(4)}\n\nReport:\nmath/reports/${reportName}\n\nDashboard:\napps/math-dashboard/public/reports/${reportName}`,
);
