import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runSimulation, SeededRandom, validateConfig } from '@lucky/math-engine';
import { formatPercentRatio } from '@lucky/shared-types';
import { loadSourceConfig } from './lib/source-loader.js';

function option(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  const index = process.argv.indexOf(`--${name}`);
  const raw = inline?.slice(prefix.length) ?? (index >= 0 ? process.argv[index + 1] : undefined);
  return raw === undefined ? fallback : Number(raw);
}

const spins = option('spins', 100_000);
const seed = option('seed', 2026);
const { config } = await loadSourceConfig();
const issues = validateConfig(config);
if (issues.length > 0) throw new Error(`Simulation stopped: ${issues.length} validation issue(s)`);
const report = runSimulation(
  config,
  { spins, seed, betCredits: config.totalBetCredits },
  new SeededRandom(seed),
);
await mkdir(resolve(process.cwd(), 'math/reports'), { recursive: true });
const output = resolve(process.cwd(), `math/reports/simulation-${seed}-${spins}.json`);
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Simulated ${spins.toLocaleString()} paid spins: credited RTP ${formatPercentRatio(report.creditedTotalRtp, 4)}, uncapped feature RTP ${formatPercentRatio(report.uncappedFeatureRtp, 4)}, hit ${formatPercentRatio(report.featureInclusiveHitFrequency, 4)}.`,
);
console.log(`Report: ${output}`);
