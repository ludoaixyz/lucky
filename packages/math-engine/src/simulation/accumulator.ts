import type {
  DistributionBucket,
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

export class SimulationAccumulator {
  private basePayout = 0;
  private baseScatterPayout = 0;
  private featurePayout = 0;
  private totalPayout = 0;
  private baseWinningSpins = 0;
  private featureTriggers = 0;
  private featureInclusiveWinningSpins = 0;
  private initiallyAwardedFreeSpins = 0;
  private totalFreeSpins = 0;
  private totalRetriggers = 0;
  private maximumObservedWin = 0;
  private capApplications = 0;
  private readonly returns: number[] = [];
  private readonly bucketCounts = Array<number>(BUCKETS.length).fill(0);

  constructor(private readonly config: SimulationConfig) {}

  record(result: SpinResult): void {
    // The paid-spin cap is applied once to the aggregate result. For component reporting,
    // credited base wins are allocated first and the feature receives the remainder.
    const creditedBase = Math.min(result.baseWinCredits, result.totalWinCredits);
    const creditedBaseScatter = Math.min(result.baseScatterWinCredits, creditedBase);
    const creditedFeature = result.totalWinCredits - creditedBase;
    this.basePayout += creditedBase;
    this.baseScatterPayout += creditedBaseScatter;
    this.featurePayout += creditedFeature;
    this.totalPayout += result.totalWinCredits;
    if (result.baseWinCredits > 0) this.baseWinningSpins += 1;
    if (result.totalWinCredits > 0) this.featureInclusiveWinningSpins += 1;
    if (result.feature) {
      this.featureTriggers += 1;
      this.initiallyAwardedFreeSpins += result.feature.initialAwardedSpins;
      this.totalFreeSpins += result.feature.totalPlayedSpins;
      this.totalRetriggers += result.feature.retriggerCount;
    }
    if (result.maximumWinApplied) this.capApplications += 1;
    this.maximumObservedWin = Math.max(this.maximumObservedWin, result.totalWinCredits);
    const multiple = result.totalWinCredits / this.config.betCredits;
    this.returns.push(multiple);
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
    const paidSpins = this.returns.length;
    if (paidSpins === 0) throw new RangeError('At least one result is required');
    const totalWageredCredits = paidSpins * this.config.betCredits;
    const mean = this.totalPayout / totalWageredCredits;
    const variance = this.returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / paidSpins;
    const standardDeviation = Math.sqrt(variance);
    const standardError = standardDeviation / Math.sqrt(paidSpins);
    const margin = 1.96 * standardError;
    const payoutDistribution: DistributionBucket[] = BUCKETS.map((bucket, index) => ({
      ...bucket,
      count: this.bucketCounts[index] ?? 0,
      probability: (this.bucketCounts[index] ?? 0) / paidSpins,
    }));
    const report: SimulationReport = {
      schemaVersion: '1.1.0',
      gameVersion: game.gameVersion,
      configurationId: game.configurationId,
      generatedAt: new Date().toISOString(),
      seed: this.config.seed,
      paidSpins,
      totalWageredCredits,
      basePayoutCredits: this.basePayout,
      baseScatterPayoutCredits: this.baseScatterPayout,
      featurePayoutCredits: this.featurePayout,
      totalPayoutCredits: this.totalPayout,
      baseRtp: this.basePayout / totalWageredCredits,
      baseScatterRtp: this.baseScatterPayout / totalWageredCredits,
      featureRtp: this.featurePayout / totalWageredCredits,
      totalRtp: mean,
      baseHitFrequency: this.baseWinningSpins / paidSpins,
      featureTriggerFrequency: this.featureTriggers / paidSpins,
      featureInclusiveHitFrequency: this.featureInclusiveWinningSpins / paidSpins,
      averageInitiallyAwardedFreeSpins: this.initiallyAwardedFreeSpins / paidSpins,
      averageTotalFreeSpinsPerTrigger:
        this.featureTriggers === 0 ? 0 : this.totalFreeSpins / this.featureTriggers,
      averageRetriggersPerTrigger:
        this.featureTriggers === 0 ? 0 : this.totalRetriggers / this.featureTriggers,
      variance,
      standardDeviation,
      standardError,
      confidenceInterval95: [Math.max(0, mean - margin), mean + margin],
      maximumObservedWinCredits: this.maximumObservedWin,
      capApplications: this.capApplications,
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
    report.baseRtp,
    report.baseScatterRtp,
    report.featureRtp,
    report.totalRtp,
    report.baseHitFrequency,
    report.featureTriggerFrequency,
    report.featureInclusiveHitFrequency,
    report.averageInitiallyAwardedFreeSpins,
    report.averageTotalFreeSpinsPerTrigger,
    report.averageRetriggersPerTrigger,
    report.variance,
    report.standardDeviation,
    report.standardError,
    ...report.confidenceInterval95,
    ...report.payoutDistribution.map((bucket) => bucket.probability),
  ];
  if (rates.some((value) => !Number.isFinite(value) || value < 0))
    throw new RangeError('Report contains a non-finite or negative rate');
}
