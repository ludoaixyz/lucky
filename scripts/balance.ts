import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runSimulation, SeededRandom, validateConfig } from '@lucky/math-engine';
import { formatPercentRatio } from '@lucky/shared-types';
import { loadSourceConfig } from './lib/source-loader.js';

const seeds = [2026, 888, 20260806, 314159, 271828] as const;
const spins = 1_000_000;
const { config, sourceHash } = await loadSourceConfig();
const issues = validateConfig(config, 'math/source');
if (issues.length > 0) throw new Error(`Balance run stopped: ${issues.length} validation issue(s)`);
const reports = seeds.map((seed) =>
  runSimulation(
    config,
    { spins, seed, betCredits: config.totalBetCredits },
    new SeededRandom(seed),
  ),
);
const average = (select: (index: number) => number): number =>
  reports.reduce((sum, _report, index) => sum + select(index), 0) / reports.length;
const aggregate = {
  schemaVersion: '1.0.0',
  methodology: 'aggregate-deterministic-monte-carlo',
  configurationId: config.configurationId,
  sourceHash,
  seeds,
  paidSpins: spins * reports.length,
  uncappedBaseLineRtp: average((index) => reports[index]?.uncappedBaseLineRtp ?? 0),
  uncappedFeatureRtp: average((index) => reports[index]?.uncappedFeatureRtp ?? 0),
  uncappedTotalRtp: average((index) => reports[index]?.uncappedTotalRtp ?? 0),
  creditedTotalRtp: average((index) => reports[index]?.creditedTotalRtp ?? 0),
  featureTriggerFrequency: average((index) => reports[index]?.featureTriggerFrequency ?? 0),
  averageFeatureLength: average((index) => reports[index]?.averageTotalFreeSpinsPerTrigger ?? 0),
  averageRetriggersPerTrigger: average((index) => reports[index]?.averageRetriggersPerTrigger ?? 0),
  baseHitFrequency: average((index) => reports[index]?.baseHitFrequency ?? 0),
  featureInclusiveHitFrequency: average(
    (index) => reports[index]?.featureInclusiveHitFrequency ?? 0,
  ),
  capApplications: reports.reduce((sum, report) => sum + report.capApplications, 0),
  maximumObservedWinCredits: Math.max(...reports.map((report) => report.maximumObservedWinCredits)),
};
const rows = reports
  .map(
    (report) =>
      `| ${report.seed} | ${formatPercentRatio(report.creditedTotalRtp, 6)} | ${formatPercentRatio(report.uncappedFeatureRtp, 6)} | ${formatPercentRatio(report.featureTriggerFrequency, 6)} | ${report.averageTotalFreeSpinsPerTrigger.toFixed(4)} | ${report.featureLengthPercentiles.p95} | ${report.capApplications} |`,
  )
  .join('\n');
const markdown = `# LUCKY888 deterministic balance seeds

Five fixed seeds, ${spins.toLocaleString('en-US')} paid spins per seed, ${aggregate.paidSpins.toLocaleString('en-US')} aggregate trials. Each trial includes the complete feature and one paid wager. This is an engineering Monte Carlo study, not certification.

| Seed | Credited RTP | Feature RTP | Trigger frequency | Feature length | p95 | Cap applications |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}
| **Mean / total** | **${formatPercentRatio(aggregate.creditedTotalRtp, 6)}** | **${formatPercentRatio(aggregate.uncappedFeatureRtp, 6)}** | **${formatPercentRatio(aggregate.featureTriggerFrequency, 6)}** | **${aggregate.averageFeatureLength.toFixed(4)}** | — | **${aggregate.capApplications}** |

- Mean uncapped base line RTP: ${formatPercentRatio(aggregate.uncappedBaseLineRtp, 6)}
- Mean uncapped total RTP: ${formatPercentRatio(aggregate.uncappedTotalRtp, 6)}
- Mean base hit frequency: ${formatPercentRatio(aggregate.baseHitFrequency, 6)}
- Mean feature-inclusive hit frequency: ${formatPercentRatio(aggregate.featureInclusiveHitFrequency, 6)}
- Mean retriggers per trigger: ${aggregate.averageRetriggersPerTrigger.toFixed(6)}
- Maximum observed credited payout: ${aggregate.maximumObservedWinCredits} credits
- Source SHA-256: \`${sourceHash}\`
`;
const outputDirectory = resolve(process.cwd(), 'math/reports');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(
    resolve(outputDirectory, 'lucky888-balance-seeds.json'),
    `${JSON.stringify({ aggregate, reports }, null, 2)}\n`,
  ),
  writeFile(resolve(outputDirectory, 'lucky888-balance-seeds.md'), markdown),
]);
console.log(
  `Balanced ${aggregate.paidSpins.toLocaleString()} paid spins: mean credited RTP ${formatPercentRatio(aggregate.creditedTotalRtp, 6)}.`,
);
