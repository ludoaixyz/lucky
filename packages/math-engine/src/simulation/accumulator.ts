import type {
  DistributionBucket,
  FeatureLengthPercentiles,
  RuntimeGameConfig,
  SimulationConfig,
  SimulationReport,
  SpinResult,
} from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { resolveSpin } from '../evaluation/spin.js';

const BUCKETS = [
  { label: '0x', minimumMultiple: 0, maximumMultiple: 0 },
  { label: '(0,1)x', minimumMultiple: Number.EPSILON, maximumMultiple: 1 },
  { label: '[1,5)x', minimumMultiple: 1, maximumMultiple: 5 },
  { label: '[5,20)x', minimumMultiple: 5, maximumMultiple: 20 },
  { label: '20x+', minimumMultiple: 20, maximumMultiple: null },
] as const;

function percentile(sorted: readonly number[], probability: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(probability * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export class SimulationAccumulator {
  private paidSpins = 0;
  private uncappedBaseLinePayout = 0;
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

  constructor(private readonly config: SimulationConfig) {}

  record(result: SpinResult): void {
    this.paidSpins += 1;
    this.uncappedBaseLinePayout += result.uncappedBaseLineWinCredits;
    this.uncappedBaseScatterPayout += result.uncappedBaseScatterWinCredits;
    this.uncappedFeaturePayout += result.uncappedFeatureWinCredits;
    this.uncappedTotalPayout += result.uncappedTotalWinCredits;
    this.creditedTotalPayout += result.totalWinCredits;
    this.capReduction += result.capReductionCredits;
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
    }
    if (result.maximumWinApplied) this.capApplications += 1;
    this.maximumObservedWin = Math.max(this.maximumObservedWin, result.totalWinCredits);
    const multiple = result.totalWinCredits / this.config.betCredits;
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
      uncappedBaseScatterPayoutCredits: this.uncappedBaseScatterPayout,
      uncappedBasePayoutCredits: this.uncappedBaseLinePayout + this.uncappedBaseScatterPayout,
      uncappedFeaturePayoutCredits: this.uncappedFeaturePayout,
      uncappedTotalPayoutCredits: this.uncappedTotalPayout,
      creditedTotalPayoutCredits: this.creditedTotalPayout,
      capReductionCredits: this.capReduction,
      uncappedBaseLineRtp: this.uncappedBaseLinePayout / totalWageredCredits,
      uncappedBaseScatterRtp: this.uncappedBaseScatterPayout / totalWageredCredits,
      uncappedFeatureRtp: this.uncappedFeaturePayout / totalWageredCredits,
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

export function assertFiniteReport(report: SimulationReport): void {
  const rates = [
    report.uncappedBaseLineRtp,
    report.uncappedBaseScatterRtp,
    report.uncappedFeatureRtp,
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
    report.variance,
    report.standardDeviation,
    report.standardError,
    ...report.confidenceInterval95,
    ...report.payoutDistribution.map((bucket) => bucket.probability),
  ];
  if (rates.some((value) => !Number.isFinite(value) || value < 0))
    throw new RangeError('Report contains a non-finite or negative rate');
}
