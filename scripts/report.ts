import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runSimulationCheckpoints, SeededRandom, validateConfig } from '@lucky/math-engine';
import type { ExactMathReport } from '@lucky/shared-types';
import { formatPercentRatio } from '@lucky/shared-types';
import { loadSourceConfig } from './lib/source-loader.js';
import { buildDurableReport, renderSimulationMarkdown } from './lib/simulation-report.js';

function option(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  const index = process.argv.indexOf(`--${name}`);
  const raw = inline?.slice(prefix.length) ?? (index >= 0 ? process.argv[index + 1] : undefined);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`--${name} must be a positive safe integer`);
  return value;
}

async function optionalExact(path: string): Promise<ExactMathReport | null> {
  try {
    await access(path);
  } catch {
    return null;
  }
  return JSON.parse(await readFile(path, 'utf8')) as ExactMathReport;
}

const spins = option('spins', 1_000_000);
const seed = option('seed', 2026);
const { config, sourceHash } = await loadSourceConfig();
const issues = validateConfig(config, 'math/source');
if (issues.length > 0)
  throw new Error(`Report generation stopped: ${issues.length} math validation issue(s)`);

const reportsDirectory = resolve(process.cwd(), 'math/reports');
const cascadesEnabled = config.cascades?.enabled === true;
const exact = cascadesEnabled
  ? null
  : await optionalExact(resolve(reportsDirectory, `${config.configurationId}-exact.json`));
if (!cascadesEnabled && !exact)
  throw new Error('Default checkpoint reporting requires the exact math report');
if (cascadesEnabled)
  console.log(
    'Exact enumeration currently supports non-cascading profiles only. Using deterministic Monte Carlo for this cascade-enabled report.',
  );
const checkpoints = spins === 1_000_000 ? undefined : [spins];
const series = runSimulationCheckpoints(
  config,
  { seed, betCredits: config.totalBetCredits, ...(checkpoints ? { checkpoints } : {}) },
  new SeededRandom(seed),
  exact?.uncappedTotalRtp ?? 0,
  (checkpoint, progress) =>
    console.log(
      `Checkpoint completed: ${checkpoint.bets.toLocaleString()} bets (${(progress * 100).toFixed(2)}%).`,
    ),
);
const theoreticalRtp = exact?.uncappedTotalRtp ?? series.finalReport.creditedTotalRtp;
const reportCheckpoints = exact
  ? series.checkpoints
  : series.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      theoreticalRtp,
      rtpDeviation: checkpoint.simulatedRtp - theoreticalRtp,
    }));
const report = buildDurableReport(
  config,
  sourceHash,
  series.finalReport,
  exact,
  reportCheckpoints,
  theoreticalRtp,
);
const basename = `${config.configurationId}-simulation`;
await mkdir(reportsDirectory, { recursive: true });
await Promise.all([
  writeFile(resolve(reportsDirectory, `${basename}.json`), `${JSON.stringify(report, null, 2)}\n`),
  writeFile(resolve(reportsDirectory, `${basename}.md`), renderSimulationMarkdown(report)),
]);
console.log(
  `Simulated ${spins.toLocaleString()} paid spins with seed ${seed}: credited RTP ${formatPercentRatio(report.creditedTotalRtp, 6)}; all reconciliations PASS.`,
);
console.log(`Reports: ${resolve(reportsDirectory, `${basename}.{json,md}`)}`);
