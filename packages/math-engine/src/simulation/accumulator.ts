import type {
  DistributionBucket,
  FeatureLengthPercentiles,
  RuntimeGameConfig,
  SimulationConfig,
  SimulationCheckpoint,
  SimulationCheckpointSeries,
  SimulationReport,
  SpinResult,
} from '@lucky/shared-types';
import { DEFAULT_SIMULATION_CHECKPOINTS } from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { resolveSpin } from '../evaluation/spin.js';

const BUCKETS = [
  { label: '0x', minimumMultiple: 0, maximumMultiple: 0 },
  { label: '(0,1)x', minimumMultiple: Number.EPSILON, maximumMultiple: 1 },
  { label: '[1,5)x', minimumMultiple: 1, maximumMultiple: 5 },
  { label: '[5,20)x', minimumMultiple: 5, maximumMultiple: 20 },
  { label: '20x+', minimumMultiple: 20, maximumMultiple: null },
] as const;
const TAIL_THRESHOLDS = [1, 5, 10, 20, 50, 100, 250, 500, 1000] as const;

function percentile(sorted: readonly number[], probability: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(probability * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export class SimulationAccumulator {
  private paidSpins = 0;
  private uncappedBaseLinePayout = 0;
  private initialBoardBaseLinePayout = 0;
  private uncappedBaseScatterPayout = 0;
  private uncappedFeaturePayout = 0;
  private uncappedTotalPayout = 0;
  private creditedTotalPayout = 0;
  private capReduction = 0;
  private baseWinningSpins = 0;
  private featureTriggers = 0;
  private featureInclusiveWinningSpins = 0;
  private initiallyAwardedFreeSpins = 0;
  private totalFreeSpins = 0;
  private totalRetriggers = 0;
  private maximumObservedWin = 0;
  private maximumObservedFeatureLength = 0;
  private featureCapHits = 0;
  private capApplications = 0;
  private returnSum = 0;
  private returnSquaredSum = 0;
  private readonly triggerCounts = new Map<number, number>();
  private readonly featureLengths: number[] = [];
  private readonly bucketCounts = Array<number>(BUCKETS.length).fill(0);
  private readonly outcomeMultiples: number[] = [];
  private readonly tailCounts = Array<number>(TAIL_THRESHOLDS.length).fill(0);
  private readonly tailPayoutCredits = Array<number>(TAIL_THRESHOLDS.length).fill(0);
  private zeroReturnCount = 0;
  private subBetReturnCount = 0;
  private baseGameSpinsWithCascade = 0;
  private baseGameCascadeSteps = 0;
  private baseGameCascadePayout = 0;
  private freeSpinEligibleCascadeSpins = 0;
  private freeSpinSpinsWithCascade = 0;
  private freeSpinCascadeSteps = 0;
  private freeSpinCascadePayout = 0;
  private maxCascadeDepthObserved = 0;

  constructor(private readonly config: SimulationConfig) {}

  record(result: SpinResult): void {
    this.paidSpins += 1;
    this.uncappedBaseLinePayout += result.uncappedBaseLineWinCredits;
    this.initialBoardBaseLinePayout +=
      result.uncappedBaseLineWinCredits - (result.cascadePayoutCredits ?? 0);
    this.uncappedBaseScatterPayout += result.uncappedBaseScatterWinCredits;
    this.uncappedFeaturePayout += result.uncappedFeatureWinCredits;
    this.uncappedTotalPayout += result.uncappedTotalWinCredits;
    this.creditedTotalPayout += result.totalWinCredits;
    this.capReduction += result.capReductionCredits;
    const baseCascadeCount = result.cascadeCount ?? 0;
    if (baseCascadeCount > 0) this.baseGameSpinsWithCascade += 1;
    this.baseGameCascadeSteps += baseCascadeCount;
    this.baseGameCascadePayout += result.cascadePayoutCredits ?? 0;
    this.maxCascadeDepthObserved = Math.max(this.maxCascadeDepthObserved, baseCascadeCount);
    if (result.uncappedBaseWinCredits > 0) this.baseWinningSpins += 1;
    if (result.totalWinCredits > 0) this.featureInclusiveWinningSpins += 1;
    if (result.feature) {
      this.featureTriggers += 1;
      this.triggerCounts.set(
        result.scatterCount,
        (this.triggerCounts.get(result.scatterCount) ?? 0) + 1,
      );
      this.initiallyAwardedFreeSpins += result.feature.initialAwardedSpins;
      this.totalFreeSpins += result.feature.totalPlayedSpins;
      this.totalRetriggers += result.feature.retriggerCount;
      this.featureLengths.push(result.feature.totalPlayedSpins);
      this.maximumObservedFeatureLength = Math.max(
        this.maximumObservedFeatureLength,
        result.feature.totalPlayedSpins,
      );
      if (result.feature.limitReached) this.featureCapHits += 1;
      this.freeSpinEligibleCascadeSpins += result.feature.freeSpins.length;
      for (const freeSpin of result.feature.freeSpins) {
        const cascadeCount = freeSpin.cascadeCount ?? 0;
        if (cascadeCount > 0) this.freeSpinSpinsWithCascade += 1;
        this.freeSpinCascadeSteps += cascadeCount;
        this.freeSpinCascadePayout += (freeSpin.cascadePayoutCredits ?? 0) * freeSpin.multiplier;
        this.maxCascadeDepthObserved = Math.max(this.maxCascadeDepthObserved, cascadeCount);
      }
    }
    if (result.maximumWinApplied) this.capApplications += 1;
    this.maximumObservedWin = Math.max(this.maximumObservedWin, result.totalWinCredits);
    const multiple = result.totalWinCredits / this.config.betCredits;
    this.outcomeMultiples.push(multiple);
    if (result.totalWinCredits === 0) this.zeroReturnCount += 1;
    else if (result.totalWinCredits < this.config.betCredits) this.subBetReturnCount += 1;
    TAIL_THRESHOLDS.forEach((threshold, tailIndex) => {
      if (result.totalWinCredits < threshold * this.config.betCredits) return;
      this.tailCounts[tailIndex] = (this.tailCounts[tailIndex] ?? 0) + 1;
      this.tailPayoutCredits[tailIndex] =
        (this.tailPayoutCredits[tailIndex] ?? 0) + result.totalWinCredits;
    });
    this.returnSum += multiple;
    this.returnSquaredSum += multiple ** 2;
    const index = BUCKETS.findIndex((bucket) => {
      if (bucket.label === '0x') return multiple === 0;
      return (
        multiple >= bucket.minimumMultiple &&
        (bucket.maximumMultiple === null || multiple < bucket.maximumMultiple)
      );
    });
    if (index >= 0) this.bucketCounts[index] = (this.bucketCounts[index] ?? 0) + 1;
  }

  report(game: RuntimeGameConfig): SimulationReport {
    if (this.paidSpins === 0) throw new RangeError('At least one result is required');
    const totalWageredCredits = this.paidSpins * this.config.betCredits;
    const mean = this.returnSum / this.paidSpins;
    const variance = Math.max(0, this.returnSquaredSum / this.paidSpins - mean ** 2);
    const standardDeviation = Math.sqrt(variance);
    const standardError = standardDeviation / Math.sqrt(this.paidSpins);
    const margin = 1.96 * standardError;
    const sortedFeatureLengths = [...this.featureLengths].sort((left, right) => left - right);
    const sortedOutcomeMultiples = [...this.outcomeMultiples].sort((left, right) => left - right);
    const featureLengthPercentiles: FeatureLengthPercentiles = {
      median: percentile(sortedFeatureLengths, 0.5),
      p75: percentile(sortedFeatureLengths, 0.75),
      p90: percentile(sortedFeatureLengths, 0.9),
      p95: percentile(sortedFeatureLengths, 0.95),
      p99: percentile(sortedFeatureLengths, 0.99),
    };
    const payoutDistribution: DistributionBucket[] = BUCKETS.map((bucket, index) => ({
      ...bucket,
      count: this.bucketCounts[index] ?? 0,
      probability: (this.bucketCounts[index] ?? 0) / this.paidSpins,
    }));
    const eligibleCascadeSpins = this.paidSpins + this.freeSpinEligibleCascadeSpins;
    const spinsWithCascade = this.baseGameSpinsWithCascade + this.freeSpinSpinsWithCascade;
    const totalCascadeSteps = this.baseGameCascadeSteps + this.freeSpinCascadeSteps;
    const cascadePayoutCredits = this.baseGameCascadePayout + this.freeSpinCascadePayout;
    const freeSpinFeatureNonCascadePayout = this.uncappedFeaturePayout - this.freeSpinCascadePayout;
    const tailMetrics = TAIL_THRESHOLDS.map((thresholdMultiple, index) => ({
      thresholdMultiple,
      count: this.tailCounts[index] ?? 0,
      probability: (this.tailCounts[index] ?? 0) / this.paidSpins,
      rtpContribution: (this.tailPayoutCredits[index] ?? 0) / totalWageredCredits,
    }));
    const outcomePercentiles = {
      p90: percentile(sortedOutcomeMultiples, 0.9),
      p95: percentile(sortedOutcomeMultiples, 0.95),
      p99: percentile(sortedOutcomeMultiples, 0.99),
      p995: percentile(sortedOutcomeMultiples, 0.995),
      p999: percentile(sortedOutcomeMultiples, 0.999),
      p9999: percentile(sortedOutcomeMultiples, 0.9999),
    };
    const volatilityTarget = game.volatilityTarget;
    const criteria: Record<string, 'PASS' | 'FAIL'> = {};
    if (volatilityTarget) {
      const inRange = (value: number, range: { minimum: number; maximum: number }) =>
        value >= range.minimum && value <= range.maximum ? 'PASS' : 'FAIL';
      criteria.standardDeviationMultiple = inRange(
        standardDeviation,
        volatilityTarget.standardDeviationMultiple,
      );
      const targetThresholds = [
        [20, '20xPlusProbability'],
        [50, '50xPlusProbability'],
        [100, '100xPlusProbability'],
        [250, '250xPlusProbability'],
      ] as const;
      for (const [threshold, key] of targetThresholds) {
        const metric = tailMetrics.find((candidate) => candidate.thresholdMultiple === threshold);
        criteria[key] = inRange(metric?.probability ?? 0, volatilityTarget.tailTargets[key]);
      }
    }
    const volatilityPassed = Object.values(criteria).every((status) => status === 'PASS');
    const report: SimulationReport = {
      schemaVersion: '1.2.0',
      methodology: 'deterministic-monte-carlo',
      gameVersion: game.gameVersion,
      configurationId: game.configurationId,
      generatedAt: new Date().toISOString(),
      seed: this.config.seed,
      paidSpins: this.paidSpins,
      totalWageredCredits,
      uncappedBaseLinePayoutCredits: this.uncappedBaseLinePayout,
      initialBoardBaseLinePayoutCredits: this.initialBoardBaseLinePayout,
      uncappedBaseScatterPayoutCredits: this.uncappedBaseScatterPayout,
      uncappedBasePayoutCredits: this.uncappedBaseLinePayout + this.uncappedBaseScatterPayout,
      uncappedFeaturePayoutCredits: this.uncappedFeaturePayout,
      freeSpinFeatureNonCascadePayoutCredits: freeSpinFeatureNonCascadePayout,
      uncappedTotalPayoutCredits: this.uncappedTotalPayout,
      creditedTotalPayoutCredits: this.creditedTotalPayout,
      capReductionCredits: this.capReduction,
      uncappedBaseLineRtp: this.uncappedBaseLinePayout / totalWageredCredits,
      initialBoardBaseLineRtp: this.initialBoardBaseLinePayout / totalWageredCredits,
      uncappedBaseScatterRtp: this.uncappedBaseScatterPayout / totalWageredCredits,
      uncappedFeatureRtp: this.uncappedFeaturePayout / totalWageredCredits,
      freeSpinFeatureNonCascadeRtp: freeSpinFeatureNonCascadePayout / totalWageredCredits,
      uncappedTotalRtp: this.uncappedTotalPayout / totalWageredCredits,
      creditedTotalRtp: this.creditedTotalPayout / totalWageredCredits,
      baseHitFrequency: this.baseWinningSpins / this.paidSpins,
      featureTriggerFrequency: this.featureTriggers / this.paidSpins,
      featureTriggerFrequencyByScatterCount: Object.fromEntries(
        [...this.triggerCounts].map(([count, occurrences]) => [
          String(count),
          occurrences / this.paidSpins,
        ]),
      ),
      featureInclusiveHitFrequency: this.featureInclusiveWinningSpins / this.paidSpins,
      averageInitiallyAwardedFreeSpins:
        this.featureTriggers === 0 ? 0 : this.initiallyAwardedFreeSpins / this.featureTriggers,
      averageTotalFreeSpinsPerTrigger:
        this.featureTriggers === 0 ? 0 : this.totalFreeSpins / this.featureTriggers,
      averageRetriggersPerTrigger:
        this.featureTriggers === 0 ? 0 : this.totalRetriggers / this.featureTriggers,
      featureLengthPercentiles,
      maximumObservedFeatureLength: this.maximumObservedFeatureLength,
      featureCapHitFrequency:
        this.featureTriggers === 0 ? 0 : this.featureCapHits / this.featureTriggers,
      variance,
      standardDeviation,
      standardError,
      confidenceInterval95: [Math.max(0, mean - margin), mean + margin],
      maximumObservedWinCredits: this.maximumObservedWin,
      capApplications: this.capApplications,
      capApplicationFrequency: this.capApplications / this.paidSpins,
      payoutDistribution,
      zeroReturnProbability: this.zeroReturnCount / this.paidSpins,
      subBetReturnProbability: this.subBetReturnCount / this.paidSpins,
      tailMetrics,
      outcomePercentiles,
      ...(volatilityTarget
        ? {
            volatilityTarget,
            volatilityAssessment: {
              status: volatilityPassed ? ('PASS' as const) : ('FAIL' as const),
              configuredClassification: volatilityTarget.classification,
              observedClassification: volatilityPassed ? volatilityTarget.classification : null,
              criteria,
            },
          }
        : {}),
      ...(game.featureFrequencyTarget
        ? { featureFrequencyTarget: game.featureFrequencyTarget }
        : {}),
      paidSpinsPerFeatureTrigger:
        this.featureTriggers === 0 ? null : this.paidSpins / this.featureTriggers,
      cascadeEnabled: game.cascades?.enabled === true,
      spinsWithCascade,
      eligibleCascadeSpins,
      cascadeSpinRate: spinsWithCascade / eligibleCascadeSpins,
      totalCascadeSteps,
      averageCascadeStepsPerPaidSpin: totalCascadeSteps / this.paidSpins,
      averageCascadeStepsWhenTriggered:
        spinsWithCascade === 0 ? 0 : totalCascadeSteps / spinsWithCascade,
      maxCascadeDepthObserved: this.maxCascadeDepthObserved,
      cascadePayout: cascadePayoutCredits,
      cascadePayoutCredits,
      cascadeRtpContribution: cascadePayoutCredits / totalWageredCredits,
      baseGameSpinsWithCascade: this.baseGameSpinsWithCascade,
      baseGameCascadeSpinRate: this.baseGameSpinsWithCascade / this.paidSpins,
      baseGameCascadeSteps: this.baseGameCascadeSteps,
      baseGameCascadePayoutCredits: this.baseGameCascadePayout,
      freeSpinSpinsWithCascade: this.freeSpinSpinsWithCascade,
      freeSpinCascadeSpinRate:
        this.freeSpinEligibleCascadeSpins === 0
          ? 0
          : this.freeSpinSpinsWithCascade / this.freeSpinEligibleCascadeSpins,
      freeSpinCascadeSteps: this.freeSpinCascadeSteps,
      freeSpinCascadePayoutCredits: this.freeSpinCascadePayout,
    };
    assertFiniteReport(report);
    return report;
  }
}

export function runSimulation(
  game: RuntimeGameConfig,
  config: SimulationConfig,
  rng: RandomSource,
): SimulationReport {
  if (!Number.isSafeInteger(config.spins) || config.spins <= 0)
    throw new RangeError('spins must be a positive safe integer');
  if (!Number.isSafeInteger(config.betCredits) || config.betCredits <= 0)
    throw new RangeError('betCredits must be a positive safe integer');
  const accumulator = new SimulationAccumulator(config);
  for (let spin = 0; spin < config.spins; spin += 1) accumulator.record(resolveSpin(game, rng));
  return accumulator.report(game);
}

export function runSimulationCheckpoints(
  game: RuntimeGameConfig,
  config: Omit<SimulationConfig, 'spins'> & { readonly checkpoints?: readonly number[] },
  rng: RandomSource,
  theoreticalRtp: number,
  onCheckpoint?: (checkpoint: SimulationCheckpoint, progress: number) => void,
): SimulationCheckpointSeries {
  const checkpoints = [...(config.checkpoints ?? DEFAULT_SIMULATION_CHECKPOINTS)];
  if (
    checkpoints.length === 0 ||
    checkpoints.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
    checkpoints.some((value, index) => index > 0 && value <= (checkpoints[index - 1] ?? 0))
  )
    throw new RangeError('checkpoints must be unique positive safe integers in ascending order');
  if (!Number.isSafeInteger(config.betCredits) || config.betCredits <= 0)
    throw new RangeError('betCredits must be a positive safe integer');
  if (!Number.isFinite(theoreticalRtp) || theoreticalRtp < 0)
    throw new RangeError('theoreticalRtp must be finite and non-negative');
  const maximum = checkpoints.at(-1) ?? 0;
  const checkpointSet = new Set(checkpoints);
  const accumulator = new SimulationAccumulator({
    spins: maximum,
    seed: config.seed,
    betCredits: config.betCredits,
  });
  const snapshots: SimulationCheckpoint[] = [];
  let finalReport: SimulationReport | undefined;
  for (let bet = 1; bet <= maximum; bet += 1) {
    accumulator.record(resolveSpin(game, rng));
    if (!checkpointSet.has(bet)) continue;
    const report = accumulator.report(game);
    finalReport = report;
    const confidenceInterval95: readonly [number, number] = Object.freeze([
      report.confidenceInterval95[0],
      report.confidenceInterval95[1],
    ]);
    const checkpoint: SimulationCheckpoint = Object.freeze({
      bets: bet,
      totalWageredCredits: report.totalWageredCredits,
      totalReturnedCredits: report.creditedTotalPayoutCredits,
      simulatedRtp: report.creditedTotalRtp,
      theoreticalRtp,
      rtpDeviation: report.creditedTotalRtp - theoreticalRtp,
      totalWins: Math.round(report.featureInclusiveHitFrequency * bet),
      hitFrequency: report.featureInclusiveHitFrequency,
      bonusTriggers: Math.round(report.featureTriggerFrequency * bet),
      bonusFrequency: report.featureTriggerFrequency,
      maximumWinCredits: report.maximumObservedWinCredits,
      maximumWinMultiplier: report.maximumObservedWinCredits / config.betCredits,
      standardDeviation: report.standardDeviation,
      confidenceInterval95,
    });
    snapshots.push(checkpoint);
    onCheckpoint?.(checkpoint, bet / maximum);
  }
  if (!finalReport) throw new Error('Final checkpoint report was not produced');
  return Object.freeze({
    seed: config.seed,
    maxBets: maximum,
    betCredits: config.betCredits,
    theoreticalRtp,
    checkpoints: Object.freeze(snapshots),
    finalReport,
  });
}

export function assertFiniteReport(report: SimulationReport): void {
  const rates = [
    report.uncappedBaseLineRtp,
    report.initialBoardBaseLineRtp,
    report.uncappedBaseScatterRtp,
    report.uncappedFeatureRtp,
    report.freeSpinFeatureNonCascadeRtp,
    report.uncappedTotalRtp,
    report.creditedTotalRtp,
    report.baseHitFrequency,
    report.featureTriggerFrequency,
    report.featureInclusiveHitFrequency,
    report.averageInitiallyAwardedFreeSpins,
    report.averageTotalFreeSpinsPerTrigger,
    report.averageRetriggersPerTrigger,
    report.featureCapHitFrequency,
    report.capApplicationFrequency,
    report.cascadeSpinRate,
    report.averageCascadeStepsPerPaidSpin,
    report.averageCascadeStepsWhenTriggered,
    report.cascadeRtpContribution,
    report.baseGameCascadeSpinRate,
    report.freeSpinCascadeSpinRate,
    report.variance,
    report.standardDeviation,
    report.standardError,
    ...report.confidenceInterval95,
    ...report.payoutDistribution.map((bucket) => bucket.probability),
    report.zeroReturnProbability,
    report.subBetReturnProbability,
    ...report.tailMetrics.flatMap((metric) => [metric.probability, metric.rtpContribution]),
    report.outcomePercentiles.p90,
    report.outcomePercentiles.p95,
    report.outcomePercentiles.p99,
    report.outcomePercentiles.p995,
    report.outcomePercentiles.p999,
    report.outcomePercentiles.p9999,
  ];
  if (rates.some((value) => !Number.isFinite(value) || value < 0))
    throw new RangeError('Report contains a non-finite or negative rate');
}
