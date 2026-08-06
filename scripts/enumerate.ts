import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { enumerateExact, runSimulation, SeededRandom, validateConfig } from '@lucky/math-engine';
import type { ExactMathReport, RuntimeGameConfig, SimulationReport } from '@lucky/shared-types';
import { loadSourceConfig } from './lib/source-loader.js';

const percent = (value: number): string => `${(value * 100).toFixed(6)}%`;
const number = (value: number): string => value.toFixed(6);

function parReport(
  config: RuntimeGameConfig,
  exact: ExactMathReport,
  simulation: SimulationReport,
): string {
  const symbolIds = config.symbols.map((symbol) => symbol.id);
  const counts = config.reelStrips.map((reel) =>
    Object.fromEntries(symbolIds.map((id) => [id, reel.filter((symbol) => symbol === id).length])),
  );
  const symbolHeader = `| Reel | Length | ${symbolIds.join(' | ')} |`;
  const symbolRule = `| --- | ---: | ${symbolIds.map(() => '---:').join(' | ')} |`;
  const symbolRows = counts.map(
    (reel, index) =>
      `| ${index + 1} | ${config.reelStrips[index]?.length ?? 0} | ${symbolIds.map((id) => reel[id] ?? 0).join(' | ')} |`,
  );
  const awards = config.bonus.awards
    .map((award) => `| ${award.count} | ${award.freeSpins} |`)
    .join('\n');
  const retriggers = config.bonus.retriggerAwards
    .map((award) => `| ${award.count} | ${award.freeSpins} |`)
    .join('\n');
  const paytable = config.paytable
    .map((award) => `| ${award.symbolId} | ${award.count} | ${award.awardCredits} |`)
    .join('\n');
  const paylines = config.paylines
    .map((line) => `| ${line.id} | ${line.rows.join(', ')} |`)
    .join('\n');
  const distribution = exact.payoutDistribution
    .map((bucket, index) => {
      const simulated = simulation.payoutDistribution[index];
      return `| ${bucket.label} | ${percent(bucket.probability)} | ${percent(simulated?.probability ?? 0)} |`;
    })
    .join('\n');
  return `# Lucky888 base v1 PAR report

## Document identity

- Game version: ${config.gameVersion}
- Configuration: ${config.configurationId}
- Runtime schema: ${config.schemaVersion}
- Bonus schema: ${config.bonus.schemaVersion}
- Exact method: finite-state exact enumeration (Method A), uncapped return moments
- Paid-spin combinations: ${exact.totalPaidSpinCombinations.toLocaleString('en-US')}
- Source SHA-256: \`${exact.sourceHash}\`

This is an engineering mathematics report, not a regulatory certification.

## Reel strips

${symbolHeader}
${symbolRule}
${symbolRows.join('\n')}

## Paytable

| Symbol | Match count | Award credits |
| --- | ---: | ---: |
${paytable}

## Paylines

Rows are zero-based from the top.

| Payline | Reel rows |
| --- | --- |
${paylines}

## Scatter and free-spin rules

${config.bonus.triggerSymbolId} is counted anywhere in the full ${config.reelCount}x${config.visibleRows} window. It does not substitute and has no direct credit pay. Free spins use the base strips and paytable at ${config.bonus.freeSpinMultiplier}x. The maximum is ${config.bonus.maximumFeatureSpins} played free spins and ${config.bonus.maximumRetriggers} successful retriggers per paid spin.

| Trigger Scatters | Initial free spins |
| ---: | ---: |
${awards}

| Free-spin Scatters | Retriggered free spins |
| ---: | ---: |
${retriggers}

## Exact return and frequency

| Measure | Exact result |
| --- | ---: |
| Base line RTP | ${percent(exact.baseLineRtp)} |
| Base Scatter RTP | ${percent(exact.baseScatterRtp)} |
| Free-spin RTP | ${percent(exact.featureRtp)} |
| Total uncapped RTP | ${percent(exact.totalRtp)} |
| Uncapped total RTP | ${percent(exact.uncappedTotalRtp)} |
| Feature trigger frequency | ${percent(exact.triggerFrequency)} |
| Base hit frequency | ${percent(exact.baseHitFrequency)} |
| Feature-inclusive hit frequency | ${percent(exact.featureInclusiveHitFrequency)} |
| Initial free spins / paid spin | ${number(exact.expectedInitiallyAwardedFreeSpins)} |
| Total free spins / paid spin | ${number(exact.expectedTotalFreeSpinsPerPaidSpin)} |
| Total free spins / trigger | ${number(exact.expectedTotalFreeSpinsPerTrigger)} |
| Retriggers / trigger | ${number(exact.expectedRetriggerCountPerTrigger)} |

| Scatter count | Exact paid-spin frequency |
| ---: | ---: |
${Object.entries(exact.triggerFrequencyByScatterCount)
  .map(([count, frequency]) => `| ${count} | ${percent(frequency)} |`)
  .join('\n')}

The exact feature expectation memoizes the bounded state (remaining spins, played spins, retrigger count). All feature return is divided by the original paid wager; free spins add no wager. Return moments are explicitly uncapped: the aggregate-cap tail is enforced in runtime and Monte Carlo, but is not mislabeled as an exact capped expectation.

## Volatility and payout distribution

The return random variable is the total capped payout resulting from one paid spin, including its entire feature, divided by the ${config.totalBetCredits}-credit bet. Exact variance is ${number(exact.variance)} bet-multiple squared and standard deviation is ${number(exact.standardDeviation)} bet multiples.

| Paid-spin payout | Exact | Simulation |
| --- | ---: | ---: |
${distribution}

## Maximum win

The ${config.maximumWinCredits}-credit maximum applies once to the aggregate base plus feature payout from one paid spin. The maximum reachable base result is ${exact.maximumReachableBaseWinCredits} credits; the feature-inclusive uncapped maximum under configured limits is ${exact.maximumReachableUncappedWinCredits} credits; the credited maximum is ${exact.maximumReachableCreditedWinCredits} credits. Cap changes exact RTP: ${exact.maximumWinCapReducesRtp ? 'yes' : 'no'}.

## Deterministic simulation comparison

Simulation uses ${simulation.paidSpins.toLocaleString('en-US')} paid spins, seed ${simulation.seed}. Each trial includes the complete feature but only one wager.

| Measure | Exact | Simulation |
| --- | ---: | ---: |
| Base RTP | ${percent(exact.baseLineRtp + exact.baseScatterRtp)} | ${percent(simulation.baseRtp)} |
| Feature RTP | ${percent(exact.featureRtp)} | ${percent(simulation.featureRtp)} |
| Total RTP (exact uncapped / simulated capped) | ${percent(exact.totalRtp)} | ${percent(simulation.totalRtp)} |
| Trigger frequency | ${percent(exact.triggerFrequency)} | ${percent(simulation.featureTriggerFrequency)} |
| Total free spins / trigger | ${number(exact.expectedTotalFreeSpinsPerTrigger)} | ${number(simulation.averageTotalFreeSpinsPerTrigger)} |

Simulation total-RTP 95% confidence interval: ${percent(simulation.confidenceInterval95[0])} to ${percent(simulation.confidenceInterval95[1])}. Deterministic seeded RNG is for reproducibility and is not a certified production RNG.

## Assumptions and open decisions

- Scatter has no direct credit payout, so base Scatter RTP is zero.
- Base and free spins share strips and paytable because alternate assets are disabled.
- The fixed-payline, left-to-right base model is unchanged.
- Exact cap-tail expectation remains unresolved; use the capped simulation estimate rather than calling the exact uncapped moment a credited theoretical RTP.
- Product approval, target RTP selection, and regulatory validation remain outside this prototype report.
`;
}

const { config, sourceHash } = await loadSourceConfig();
const issues = validateConfig(config, 'math/source');
if (issues.length > 0) throw new Error(`Enumeration stopped: ${issues.length} validation issue(s)`);
const exact = enumerateExact(config, sourceHash);
if (Math.abs(exact.probabilityReconciliation - 1) > 1e-12)
  throw new Error(`Exact probability reconciled to ${exact.probabilityReconciliation}, expected 1`);
const simulation = runSimulation(
  config,
  { spins: 100_000, seed: 2026, betCredits: config.totalBetCredits },
  new SeededRandom(2026),
);
const reports = resolve(process.cwd(), 'math/reports');
await mkdir(reports, { recursive: true });
await Promise.all([
  writeFile(resolve(reports, 'lucky888-base-v1-exact.json'), `${JSON.stringify(exact, null, 2)}\n`),
  writeFile(resolve(reports, 'lucky888-base-v1-par.md'), parReport(config, exact, simulation)),
]);
console.log(
  `Exact ${exact.totalPaidSpinCombinations.toLocaleString()} combinations: uncapped total RTP ${percent(exact.totalRtp)}, trigger ${percent(exact.triggerFrequency)}.`,
);
console.log(`PAR report: ${resolve(reports, 'lucky888-base-v1-par.md')}`);
