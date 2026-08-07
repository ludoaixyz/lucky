import type {
  ExactMathReport,
  RuntimeGameConfig,
  SimulationCheckpoint,
  SimulationReport,
} from '@lucky/shared-types';
import { formatPercentRatio } from '@lucky/shared-types';

export const RECONCILIATION_TOLERANCE = 1e-12;

export interface ReconciliationCheck {
  readonly id: string;
  readonly actual: number;
  readonly expected: number;
  readonly difference: number;
  readonly tolerance: number;
  readonly passed: boolean;
}

export interface TargetComparison {
  readonly measure: string;
  readonly result: number;
  readonly target: string;
  readonly status: 'PASS' | 'WARN' | 'FAIL';
}

export interface DurableSimulationReport extends SimulationReport {
  readonly gameId: string;
  readonly gameName: string;
  readonly sourceHash: string;
  readonly exactEnumeration: ExactMathReport | null;
  readonly reconciliations: readonly ReconciliationCheck[];
  readonly targetComparisons: readonly TargetComparison[];
  readonly theoreticalRtp: number;
  readonly maxSimulatedBets: number;
  readonly cumulativeSimulation: true;
  readonly simulationCheckpoints: readonly SimulationCheckpoint[];
}

function check(
  id: string,
  actual: number,
  expected: number,
  tolerance: number,
): ReconciliationCheck {
  const difference = Math.abs(actual - expected);
  return { id, actual, expected, difference, tolerance, passed: difference <= tolerance };
}

export function reconcileSimulation(
  report: SimulationReport,
  betCredits: number,
): readonly ReconciliationCheck[] {
  return [
    check('total-wager', report.totalWageredCredits, report.paidSpins * betCredits, 0),
    check(
      'uncapped-components',
      report.uncappedBaseLinePayoutCredits +
        report.uncappedBaseScatterPayoutCredits +
        report.uncappedFeaturePayoutCredits,
      report.uncappedTotalPayoutCredits,
      0,
    ),
    check(
      'credited-plus-cap-reduction',
      report.creditedTotalPayoutCredits + report.capReductionCredits,
      report.uncappedTotalPayoutCredits,
      0,
    ),
    check(
      'payout-bucket-probabilities',
      report.payoutDistribution.reduce((sum, bucket) => sum + bucket.probability, 0),
      1,
      RECONCILIATION_TOLERANCE,
    ),
    check(
      'scatter-trigger-frequencies',
      Object.values(report.featureTriggerFrequencyByScatterCount).reduce(
        (sum, frequency) => sum + frequency,
        0,
      ),
      report.featureTriggerFrequency,
      RECONCILIATION_TOLERANCE,
    ),
    check(
      'cascade-payout-components',
      report.baseGameCascadePayoutCredits + report.freeSpinCascadePayoutCredits,
      report.cascadePayoutCredits,
      0,
    ),
    check(
      'cascade-step-components',
      report.baseGameCascadeSteps + report.freeSpinCascadeSteps,
      report.totalCascadeSteps,
      0,
    ),
    check(
      'cascade-spin-components',
      report.baseGameSpinsWithCascade + report.freeSpinSpinsWithCascade,
      report.spinsWithCascade,
      0,
    ),
  ];
}

export function compareTargets(report: SimulationReport): readonly TargetComparison[] {
  const frequencyDenominator =
    report.featureTriggerFrequency === 0
      ? Number.POSITIVE_INFINITY
      : 1 / report.featureTriggerFrequency;
  return [
    {
      measure: 'Credited RTP',
      result: report.creditedTotalRtp,
      target: '94%–97%',
      status: report.creditedTotalRtp >= 0.94 && report.creditedTotalRtp <= 0.97 ? 'PASS' : 'FAIL',
    },
    {
      measure: 'Feature frequency (paid spins per trigger)',
      result: frequencyDenominator,
      target: '80–150',
      status: frequencyDenominator >= 80 && frequencyDenominator <= 150 ? 'PASS' : 'FAIL',
    },
    {
      measure: 'Average feature length',
      result: report.averageTotalFreeSpinsPerTrigger,
      target: '9–14',
      status:
        report.averageTotalFreeSpinsPerTrigger >= 9 && report.averageTotalFreeSpinsPerTrigger <= 14
          ? 'PASS'
          : 'WARN',
    },
    {
      measure: 'p95 feature length',
      result: report.featureLengthPercentiles.p95,
      target: '<30',
      status: report.featureLengthPercentiles.p95 < 30 ? 'PASS' : 'WARN',
    },
    {
      measure: 'Feature-cap hit frequency',
      result: report.featureCapHitFrequency,
      target: 'effectively zero',
      status:
        report.featureCapHitFrequency <= 1e-6
          ? 'PASS'
          : report.featureCapHitFrequency <= 1e-5
            ? 'WARN'
            : 'FAIL',
    },
  ];
}

export function buildDurableReport(
  game: RuntimeGameConfig,
  sourceHash: string,
  simulation: SimulationReport,
  exactEnumeration: ExactMathReport | null,
  simulationCheckpoints: readonly SimulationCheckpoint[] = [],
  theoreticalRtp = exactEnumeration?.uncappedTotalRtp ?? simulation.creditedTotalRtp,
): DurableSimulationReport {
  const reconciliations = reconcileSimulation(simulation, game.totalBetCredits);
  const failed = reconciliations.filter((candidate) => !candidate.passed);
  if (failed.length > 0) {
    throw new Error(
      `Simulation reconciliation failed: ${failed.map((candidate) => candidate.id).join(', ')}`,
    );
  }
  return {
    ...simulation,
    gameId: game.gameId,
    gameName: game.gameName,
    sourceHash,
    exactEnumeration,
    reconciliations,
    targetComparisons: compareTargets(simulation),
    theoreticalRtp,
    maxSimulatedBets: simulation.paidSpins,
    cumulativeSimulation: true,
    simulationCheckpoints,
  };
}

function number(value: number, decimals = 6): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : '∞';
}

export function renderSimulationMarkdown(report: DurableSimulationReport): string {
  const rtpReferenceLabel = report.exactEnumeration
    ? 'Theoretical RTP'
    : 'Final deterministic Monte Carlo estimate (exact cascade enumeration unsupported)';
  const checkpoints = report.simulationCheckpoints
    .map(
      (checkpoint) =>
        `| ${checkpoint.bets.toLocaleString('en-US')} | ${formatPercentRatio(checkpoint.simulatedRtp, 4)} | ${formatPercentRatio(checkpoint.theoreticalRtp, 4)} | ${(checkpoint.rtpDeviation * 100).toFixed(4)} pp | ${formatPercentRatio(checkpoint.hitFrequency, 4)} | ${formatPercentRatio(checkpoint.bonusFrequency, 4)} | ${checkpoint.maximumWinCredits.toLocaleString('en-US')} |`,
    )
    .join('\n');
  const distribution = report.payoutDistribution
    .map(
      (bucket) =>
        `| ${bucket.label} | ${bucket.count.toLocaleString('en-US')} | ${formatPercentRatio(bucket.probability, 6)} |`,
    )
    .join('\n');
  const scatterFrequencies = ['3', '4', '5']
    .map(
      (count) =>
        `| ${count} | ${formatPercentRatio(report.featureTriggerFrequencyByScatterCount[count] ?? 0, 6)} |`,
    )
    .join('\n');
  const reconciliations = report.reconciliations
    .map(
      (item) =>
        `| ${item.id} | ${number(item.actual, 12)} | ${number(item.expected, 12)} | ${number(item.difference, 12)} | ${item.passed ? 'PASS' : 'FAIL'} |`,
    )
    .join('\n');
  const targets = report.targetComparisons
    .map((item) => {
      const shown =
        item.measure === 'Credited RTP' || item.measure.includes('frequency')
          ? item.measure.startsWith('Feature frequency')
            ? number(item.result, 3)
            : formatPercentRatio(item.result, 6)
          : number(item.result, 3);
      return `| ${item.measure} | ${shown} | ${item.target} | ${item.status} |`;
    })
    .join('\n');
  const cascadeSection = report.cascadeEnabled
    ? `## Cascades

Approximately ${formatPercentRatio(report.cascadeSpinRate, 4)} of eligible base/free-spin resolutions generated at least one additional board. Cascade-triggering resolutions produced ${number(report.averageCascadeStepsWhenTriggered, 3)} additional boards on average. Uncapped cascade-stage awards contributed ${formatPercentRatio(report.cascadeRtpContribution, 6)} of paid-wager RTP.

| Measure | Result |
| --- | ---: |
| Spins with cascades | ${report.spinsWithCascade.toLocaleString('en-US')} |
| Eligible spin resolutions | ${report.eligibleCascadeSpins.toLocaleString('en-US')} |
| Cascade rate | ${formatPercentRatio(report.cascadeSpinRate, 6)} |
| Total additional boards | ${report.totalCascadeSteps.toLocaleString('en-US')} |
| Average additional boards / paid spin | ${number(report.averageCascadeStepsPerPaidSpin)} |
| Average additional boards when triggered | ${number(report.averageCascadeStepsWhenTriggered)} |
| Maximum cascade chain | ${report.maxCascadeDepthObserved} |
| Uncapped cascade payout | ${report.cascadePayoutCredits.toLocaleString('en-US')} credits |
| Cascade RTP contribution | ${formatPercentRatio(report.cascadeRtpContribution, 6)} |

`
    : '';
  return `# ${report.gameName} simulation report

> Provisional engineering simulation. This report does not claim certification.

## Identity and methodology

- Game: ${report.gameName} (\`${report.gameId}\`)
- Game version: ${report.gameVersion}
- Configuration ID: \`${report.configurationId}\`
- Source SHA-256: \`${report.sourceHash}\`
- Methodology: deterministic Monte Carlo
- Exact enumeration loaded: ${report.exactEnumeration ? 'yes' : 'no'}
- Seed: ${report.seed}
- Paid spins: ${report.paidSpins.toLocaleString('en-US')}
- Bet: ${report.totalWageredCredits / report.paidSpins} credits
- Total wagered: ${report.totalWageredCredits.toLocaleString('en-US')} credits

## Cumulative RTP convergence

All checkpoints are immutable snapshots from one seeded cumulative simulation run. The ${rtpReferenceLabel.toLowerCase()} is ${formatPercentRatio(report.theoreticalRtp, 6)}.

| Bets | Simulated RTP | ${rtpReferenceLabel} | Deviation | Hit frequency | Bonus frequency | Max win |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${checkpoints}

Results at 100 and 1,000 bets are expected to fluctuate significantly. The 10,000 and 100,000 checkpoints provide an intermediate convergence view; 250,000 and 500,000 help reveal stabilization; and 1,000,000 is the strongest default indicator in this report. A small-sample deviation does not by itself indicate a mathematical defect. The simulation provides empirical validation and convergence evidence, but does not replace exact mathematical verification.

## RTP and frequencies

| Measure | Result |
| --- | ---: |
| Uncapped base line RTP | ${formatPercentRatio(report.uncappedBaseLineRtp, 6)} |
| Uncapped Scatter RTP | ${formatPercentRatio(report.uncappedBaseScatterRtp, 6)} |
| Uncapped feature RTP | ${formatPercentRatio(report.uncappedFeatureRtp, 6)} |
| Uncapped total RTP | ${formatPercentRatio(report.uncappedTotalRtp, 6)} |
| Credited total RTP | ${formatPercentRatio(report.creditedTotalRtp, 6)} |
| Cap reduction | ${report.capReductionCredits.toLocaleString('en-US')} credits (${formatPercentRatio(report.uncappedTotalRtp - report.creditedTotalRtp, 6)}) |
| 95% confidence interval | ${formatPercentRatio(report.confidenceInterval95[0], 6)}–${formatPercentRatio(report.confidenceInterval95[1], 6)} |
| Base hit frequency | ${formatPercentRatio(report.baseHitFrequency, 6)} |
| Feature-inclusive hit frequency | ${formatPercentRatio(report.featureInclusiveHitFrequency, 6)} |
| Feature trigger frequency | ${formatPercentRatio(report.featureTriggerFrequency, 6)} (1 in ${number(1 / report.featureTriggerFrequency, 3)}) |

| Triggering Scatters | Frequency per paid spin |
| ---: | ---: |
${scatterFrequencies}

${cascadeSection}

## Feature length

| Measure | Result |
| --- | ---: |
| Average initial free spins / trigger | ${number(report.averageInitiallyAwardedFreeSpins)} |
| Average total free spins / trigger | ${number(report.averageTotalFreeSpinsPerTrigger)} |
| Average retriggers / trigger | ${number(report.averageRetriggersPerTrigger)} |
| Median | ${report.featureLengthPercentiles.median} |
| p75 | ${report.featureLengthPercentiles.p75} |
| p90 | ${report.featureLengthPercentiles.p90} |
| p95 | ${report.featureLengthPercentiles.p95} |
| p99 | ${report.featureLengthPercentiles.p99} |
| Maximum feature length | ${report.maximumObservedFeatureLength} |
| Feature-cap hit frequency | ${formatPercentRatio(report.featureCapHitFrequency, 8)} |

## Volatility

The return random variable is credited payout from one paid spin and its complete feature, divided by the paid wager.

| Measure | Result |
| --- | ---: |
| Variance | ${number(report.variance)} |
| Standard deviation | ${number(report.standardDeviation)} |
| Standard error | ${number(report.standardError)} |
| Maximum observed payout | ${report.maximumObservedWinCredits.toLocaleString('en-US')} credits |

## Payout distribution

| Payout multiple | Count | Probability |
| --- | ---: | ---: |
${distribution}

## Reconciliation checks

Tolerance is zero for integer-credit identities and ${RECONCILIATION_TOLERANCE} for probability identities. Report generation fails if any check exceeds its tolerance.

| Check | Actual | Expected | Difference | Status |
| --- | ---: | ---: | ---: | --- |
${reconciliations}

## Target comparison

| Measure | Result | Target band | Status |
| --- | ---: | --- | --- |
${targets}
`;
}
