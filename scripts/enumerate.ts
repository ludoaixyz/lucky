import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { enumerateExact, runSimulation, SeededRandom, validateConfig } from '@lucky/math-engine';
import {
  formatPercentRatio,
  type ExactMathReport,
  type RuntimeGameConfig,
  type SimulationReport,
} from '@lucky/shared-types';
import { loadSourceConfig } from './lib/source-loader.js';

const number = (value: number): string => value.toFixed(6);

function parReport(
  config: RuntimeGameConfig,
  exact: ExactMathReport,
  simulation: SimulationReport,
): string {
  const symbolIds = config.symbols.map((symbol) => symbol.id);
  const reelTable = config.reelStrips
    .map((reel, index) => {
      const counts = symbolIds.map((id) => reel.filter((symbol) => symbol === id).length);
      return `| ${index + 1} | ${reel.length} | ${counts.join(' | ')} |`;
    })
    .join('\n');
  const freeReelTable = config.freeSpinReelStrips
    .map((reel, index) => {
      const counts = symbolIds.map((id) => reel.filter((symbol) => symbol === id).length);
      return `| ${index + 1} | ${reel.length} | ${counts.join(' | ')} |`;
    })
    .join('\n');
  const awardRows = config.bonus.awards
    .map((award) => `| ${award.count} | ${award.freeSpins} |`)
    .join('\n');
  const retriggerRows = config.bonus.retriggerAwards
    .map((award) => `| ${award.count} | ${award.freeSpins} |`)
    .join('\n');
  const triggerRows = Object.entries(exact.triggerFrequencyByScatterCount)
    .map(([count, frequency]) => `| ${count} | ${formatPercentRatio(frequency, 6)} |`)
    .join('\n');
  const distribution = exact.payoutDistribution
    .map(
      (bucket, index) =>
        `| ${bucket.label} | ${formatPercentRatio(bucket.probability, 6)} | ${formatPercentRatio(simulation.payoutDistribution[index]?.probability ?? 0, 6)} |`,
    )
    .join('\n');
  return `# LUCKY888 balanced base v1 PAR report

> Provisional engineering mathematics. This is not a regulatory certification.

## Identity

- Game: ${config.gameName} (\`${config.gameId}\`)
- Game version: ${config.gameVersion}
- Configuration: ${config.configurationId}
- Source SHA-256: \`${exact.sourceHash}\`
- Exact methodology: ${exact.methodology}
- Credited methodology: deterministic Monte Carlo estimate
- Exact paid-stop combinations: ${exact.totalPaidSpinCombinations.toLocaleString('en-US')}

## Reel symbol counts

| Base reel | Length | ${symbolIds.join(' | ')} |
| --- | ---: | ${symbolIds.map(() => '---:').join(' | ')} |
${reelTable}

| Free-spin reel | Length | ${symbolIds.join(' | ')} |
| --- | ---: | ${symbolIds.map(() => '---:').join(' | ')} |
${freeReelTable}

Free spins use alternate configuration \`${config.bonus.alternateReelStripConfigurationId}\`.

## Payout contracts

- Lines: ${config.rules.lineAwardRules.direction}, consecutive from reel 1, highest award per payline, no nested award accumulation; all ${config.paylines.length} paylines accumulate.
- Wild: \`${config.rules.wild.symbolId}\` substitutes only for ${config.rules.wild.substitutesFor.join(', ')}; never Scatter; all-Wild rule is \`${config.rules.wild.allWildCombinationRule}\`; multiplier ${config.rules.wild.multiplier}x.
- Scatter: \`${config.rules.scatter.symbolId}\` is counted anywhere from visible symbols, never substitutes, has no direct credit award, and triggers the feature.
- Maximum win: ${config.maximumWinCredits} credits, scope \`${config.maximumWinScope}\`, applied once to base plus the complete feature.

| Base Scatters | Initial free spins |
| ---: | ---: |
${awardRows}

| Free-spin Scatters | Added spins |
| ---: | ---: |
${retriggerRows}

## RTP and frequency

Internal RTP values are decimal ratios: 1.0 is 100%. Formatting multiplies by 100 exactly once.

| Measure | Result |
| --- | ---: |
| Exact uncapped base line RTP | ${formatPercentRatio(exact.uncappedBaseLineRtp, 6)} |
| Exact uncapped base Scatter RTP | ${formatPercentRatio(exact.uncappedBaseScatterRtp, 6)} |
| Exact uncapped feature RTP | ${formatPercentRatio(exact.uncappedFeatureRtp, 6)} |
| Exact uncapped total RTP | ${formatPercentRatio(exact.uncappedTotalRtp, 6)} |
| Simulated credited total RTP | ${formatPercentRatio(simulation.creditedTotalRtp, 6)} |
| Simulated cap reduction RTP | ${formatPercentRatio(simulation.uncappedTotalRtp - simulation.creditedTotalRtp, 6)} |
| Exact trigger frequency | ${formatPercentRatio(exact.triggerFrequency, 6)} |
| Exact base hit frequency | ${formatPercentRatio(exact.baseHitFrequency, 6)} |
| Exact feature-inclusive hit frequency | ${formatPercentRatio(exact.featureInclusiveHitFrequency, 6)} |
| Exact free spins / trigger | ${number(exact.expectedTotalFreeSpinsPerTrigger)} |
| Exact retriggers / trigger | ${number(exact.expectedRetriggerCountPerTrigger)} |

| Scatter count | Exact frequency |
| ---: | ---: |
${triggerRows}

## Feature length and volatility

| Measure | Simulation |
| --- | ---: |
| Median | ${simulation.featureLengthPercentiles.median} |
| p75 | ${simulation.featureLengthPercentiles.p75} |
| p90 | ${simulation.featureLengthPercentiles.p90} |
| p95 | ${simulation.featureLengthPercentiles.p95} |
| p99 | ${simulation.featureLengthPercentiles.p99} |
| Maximum observed | ${simulation.maximumObservedFeatureLength} |
| Feature-cap hit frequency | ${formatPercentRatio(simulation.featureCapHitFrequency, 6)} |
| Credited-return standard deviation | ${number(simulation.standardDeviation)} bet multiples |

The volatility random variable is credited payout from one paid spin and its complete feature divided by the five-credit paid wager. Free spins add no wager.

| Payout multiple | Exact uncapped | Simulated credited |
| --- | ---: | ---: |
${distribution}

## Maximum and cap

- Maximum reachable base payout: ${exact.maximumReachableBaseWinCredits} credits.
- Maximum reachable uncapped paid-spin payout under feature limits: ${exact.maximumReachableUncappedWinCredits} credits.
- Maximum credited payout: ${exact.maximumReachableCreditedWinCredits} credits.
- Cap is reachable: ${exact.maximumWinCapReducesRtp ? 'yes' : 'no'}.
- Observed cap applications: ${simulation.capApplications} of ${simulation.paidSpins.toLocaleString('en-US')} paid spins.

Exact state equations calculate uncapped feature expectation. The aggregate maximum-win tail is estimated through deterministic Monte Carlo and is not labeled exact.

## Simulation comparison

Seed ${simulation.seed}; ${simulation.paidSpins.toLocaleString('en-US')} paid spins; credited RTP 95% interval ${formatPercentRatio(simulation.confidenceInterval95[0], 6)} to ${formatPercentRatio(simulation.confidenceInterval95[1], 6)}. The deterministic RNG supports reproducible engineering tests and is not production-approved.

## Remaining decisions

- Independent math review and target-profile approval remain outstanding.
- Exact sparse cap-tail calculation may be added if the payout-state cost becomes practical.
- Art direction for the original three-dragon emblem remains provisional.
`;
}

function balanceComparison(exact: ExactMathReport, simulation: SimulationReport): string {
  return `# LUCKY888 balance comparison

> Engineering comparison only; no certification claim.

| Measure | Old illustrative profile | Balanced candidate | Provisional target |
| --- | ---: | ---: | ---: |
| Exact uncapped total RTP | 264.522224% | ${formatPercentRatio(exact.uncappedTotalRtp, 6)} | 94%–97% credited |
| Simulated credited RTP | 262.818600% (100k, seed 2026) | ${formatPercentRatio(simulation.creditedTotalRtp, 6)} | 94%–97% |
| Trigger frequency | 10.351563% | ${formatPercentRatio(exact.triggerFrequency, 6)} | 0.667%–1.25% |
| Average feature length | 19.003980 | ${number(simulation.averageTotalFreeSpinsPerTrigger)} | 9–14 preferred |
| Feature p95 | Not recorded by legacy report | ${simulation.featureLengthPercentiles.p95} | Below 30 preferred |
| Base hit frequency | 31.875322% | ${formatPercentRatio(simulation.baseHitFrequency, 6)} | 20%–35% |
| Feature-cap hit frequency | Not recorded | ${formatPercentRatio(simulation.featureCapHitFrequency, 6)} | Effectively zero |

## Rule changes

- Base reels: one Scatter in 12 stops became one in 30 stops per reel.
- Free spins: dedicated 30-stop strips with reduced Wild exposure.
- Retriggers: 3/4/5 Scatters changed from 5/8/10 spins to 2/4/6.
- Paytable: deliberately retuned after reel changes; the maximum-win cap was not used as the primary balancing mechanism.

The candidate was selected because it corrects the extreme trigger rate and feature contribution while awarding 9/11/13 initial spins and keeping the shorter 2/4/6 retrigger schedule. Results outside provisional bands are reported, not hidden.
`;
}

interface EnumerationCliDependencies {
  readonly loadSource: typeof loadSourceConfig;
  readonly validate: typeof validateConfig;
  readonly enumerate: typeof enumerateExact;
  readonly runLegacy: (
    config: RuntimeGameConfig,
    sourceHash: string,
    exact: ExactMathReport,
  ) => Promise<void>;
  readonly log: (message: string) => void;
}

async function runLegacyEnumeration(
  config: RuntimeGameConfig,
  _sourceHash: string,
  exact: ExactMathReport,
): Promise<void> {
  if (Math.abs(exact.probabilityReconciliation - 1) > 1e-12)
    throw new Error(
      `Exact probability reconciled to ${exact.probabilityReconciliation}, expected 1`,
    );
  const simulation = runSimulation(
    config,
    { spins: 1_000_000, seed: 2026, betCredits: config.totalBetCredits },
    new SeededRandom(2026),
  );
  const hybrid: ExactMathReport = {
    ...exact,
    methodology: 'hybrid',
    creditedTotalRtp: simulation.creditedTotalRtp,
    creditedTotalRtpMethodology: 'monte-carlo-estimate',
    estimatedCapReductionRtp: simulation.uncappedTotalRtp - simulation.creditedTotalRtp,
  };
  const reports = resolve(process.cwd(), 'math/reports');
  await mkdir(reports, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(reports, 'lucky888-balanced-base-v1-exact.json'),
      `${JSON.stringify(hybrid, null, 2)}\n`,
    ),
    writeFile(
      resolve(reports, 'lucky888-balanced-base-v1-par.md'),
      parReport(config, hybrid, simulation),
    ),
    writeFile(
      resolve(reports, 'lucky888-balance-comparison.md'),
      balanceComparison(hybrid, simulation),
    ),
  ]);
  console.log(
    `Exact ${exact.totalPaidSpinCombinations.toLocaleString()} combinations: uncapped RTP ${formatPercentRatio(exact.uncappedTotalRtp, 6)}, trigger ${formatPercentRatio(exact.triggerFrequency, 6)}.`,
  );
  console.log(`PAR report: ${resolve(reports, 'lucky888-balanced-base-v1-par.md')}`);
}

const DEFAULT_DEPENDENCIES: EnumerationCliDependencies = {
  loadSource: loadSourceConfig,
  validate: validateConfig,
  enumerate: enumerateExact,
  runLegacy: runLegacyEnumeration,
  log: console.log,
};

export async function runEnumerationCli(
  dependencies: EnumerationCliDependencies = DEFAULT_DEPENDENCIES,
): Promise<'completed' | 'not-applicable'> {
  const { config, sourceHash } = await dependencies.loadSource();
  const issues = dependencies.validate(config, 'math/source');
  if (issues.length > 0)
    throw new Error(`Enumeration stopped: ${issues.length} validation issue(s)`);

  if (config.cascades?.enabled === true) {
    dependencies.log(`LUCKY888 Exact Enumeration

Configuration: ${config.configurationId}
Cascades: enabled

Exact enumeration: SKIPPED

Exact enumeration currently supports non-cascading profiles only.
Cascade refill introduces additional RNG draws and variable-length resolution sequences.

Use deterministic Monte Carlo for this profile:

npm run math:report -- --spins 1000000 --seed 2026

Status: NOT APPLICABLE`);
    return 'not-applicable';
  }

  const exact = dependencies.enumerate(config, sourceHash);
  await dependencies.runLegacy(config, sourceHash, exact);
  return 'completed';
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href)
  await runEnumerationCli();
