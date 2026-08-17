import { runSimulation, SeededRandom, validateConfig } from '@lucky/math-engine';
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

const spins = option('spins', 1_000_000);
const seed = option('seed', 2026);
const { config } = await loadSourceConfig();
const issues = validateConfig(config);
if (issues.length > 0) throw new Error(`Invalid source config: ${issues.length} issue(s)`);

const report = runSimulation(config, { spins, seed }, new SeededRandom(seed));
const featureOneIn =
  report.featureFrequency === 0 ? Number.POSITIVE_INFINITY : 1 / report.featureFrequency;
const componentTotal =
  report.components.baseGameRegularPayout +
  report.components.baseGameScatterPayout +
  report.components.baseGameMultiplierUplift +
  report.components.freeGameRegularPayout +
  report.components.freeGameScatterPayout +
  report.components.freeGameMultiplierUplift;
const reconciliationTolerance = 1e-8 * Math.max(1, report.totalCreditedWin);

const failures: string[] = [];
if (featureOneIn < 100 || featureOneIn > 150)
  failures.push(`feature 1-in-N ${featureOneIn.toFixed(2)} is outside 100-150`);
if (report.rtp < 0.9 || report.rtp > 0.95)
  failures.push(`credited RTP ${(report.rtp * 100).toFixed(4)}% is outside 90-95%`);
if (Math.abs(componentTotal - report.totalCreditedWin) > reconciliationTolerance)
  failures.push('RTP components do not reconcile to total credited win');

console.log(
  `Calibration validation (${spins.toLocaleString()} spins, seed ${seed}): RTP ${(report.rtp * 100).toFixed(4)}%, feature 1 in ${featureOneIn.toFixed(2)}, hit ${(report.winningSpinFrequency * 100).toFixed(4)}%.`,
);
if (failures.length > 0) throw new Error(`CALIBRATION FAILED: ${failures.join('; ')}`);
console.log('CALIBRATION PASSED');
