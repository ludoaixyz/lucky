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
  private totalPayout = 0;
  private winningSpins = 0;
  private featureTriggers = 0;
  private readonly returns: number[] = [];
  private readonly bucketCounts = Array<number>(BUCKETS.length).fill(0);

  constructor(private readonly config: SimulationConfig) {}

  record(result: SpinResult): void {
    this.totalPayout += result.winCredits;
    if (result.winCredits > 0) this.winningSpins += 1;
    if (result.featureTriggered) this.featureTriggers += 1;
    const multiple = result.winCredits / this.config.betCredits;
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
    const spins = this.returns.length;
    if (spins === 0) throw new RangeError('At least one result is required');
    const totalWager = spins * this.config.betCredits;
    const mean = this.returns.reduce((sum, value) => sum + value, 0) / spins;
    const variance = this.returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / spins;
    const standardDeviation = Math.sqrt(variance);
    const margin = (1.96 * standardDeviation) / Math.sqrt(spins);
    const payoutDistribution: DistributionBucket[] = BUCKETS.map((bucket, index) => ({
      ...bucket,
      count: this.bucketCounts[index] ?? 0,
      probability: (this.bucketCounts[index] ?? 0) / spins,
    }));
    const report: SimulationReport = {
      schemaVersion: '1.0.0',
      gameVersion: game.gameVersion,
      configurationId: game.configurationId,
      generatedAt: new Date().toISOString(),
      seed: this.config.seed,
      spinCount: spins,
      totalWagerCredits: totalWager,
      totalPayoutCredits: this.totalPayout,
      winningSpinCount: this.winningSpins,
      featureTriggerCount: this.featureTriggers,
      rtp: this.totalPayout / totalWager,
      hitFrequency: this.winningSpins / spins,
      bonusFrequency: this.featureTriggers / spins,
      variance,
      standardDeviation,
      rtpConfidence95: [Math.max(0, mean - margin), mean + margin],
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
    report.rtp,
    report.hitFrequency,
    report.bonusFrequency,
    report.variance,
    report.standardDeviation,
    ...report.rtpConfidence95,
    ...report.payoutDistribution.map((bucket) => bucket.probability),
  ];
  if (rates.some((value) => !Number.isFinite(value) || value < 0))
    throw new RangeError('Report contains a non-finite or negative rate');
}
