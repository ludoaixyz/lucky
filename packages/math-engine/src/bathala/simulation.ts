import type {
  ActiveGameConfig,
  BathalaSimulationConfig,
  BathalaSimulationReport,
  BathalaSpinResult,
  TumbleRound,
  WinComponents,
} from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { resolveSpin } from './spin.js';

const TAILS = [10, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

export class BathalaSimulationAccumulator {
  private spins = 0;
  private credited = 0;
  private winning = 0;
  private tumbleTriggers = 0;
  private tumbleRounds = 0;
  private baseTumbleTriggers = 0;
  private baseTumbleRounds = 0;
  private freeGameTumbleTriggers = 0;
  private freeGameTumbleRounds = 0;
  private freeGameSpins = 0;
  private maxBaseDepth = 0;
  private maxFreeGameDepth = 0;
  private maxDepth = 0;
  private bathala = 0;
  private bathalaRemoved = 0;
  private bathalaNextWin = 0;
  private multiplierSpins = 0;
  private multiplierCount = 0;
  private multiplierValue = 0;
  private multipliedRounds = 0;
  private summedMultipliers = 0;
  private maxSummedMultiplier = 0;
  private features = 0;
  private featureSpins = 0;
  private initialFeatureSpins = 0;
  private maxFeatureLength = 0;
  private readonly featureLengths: number[] = [];
  private retriggers = 0;
  private endingMultipliers = 0;
  private featureWin = 0;
  private baseWin = 0;
  private maxWin = 0;
  private meanWin = 0;
  private winM2 = 0;
  private readonly tailCounts = TAILS.map(() => 0);
  private components: { -readonly [Key in keyof WinComponents]: number } = {
    baseGameRegularPayout: 0,
    baseGameScatterPayout: 0,
    baseGameMultiplierUplift: 0,
    freeGameRegularPayout: 0,
    freeGameScatterPayout: 0,
    freeGameMultiplierUplift: 0,
  };

  private rounds(result: BathalaSpinResult): TumbleRound[] {
    return [
      ...result.tumbleRounds,
      ...(result.feature?.spins.flatMap((spin) => spin.tumbleRounds) ?? []),
    ];
  }

  record(result: BathalaSpinResult): void {
    this.spins += 1;
    const delta = result.totalWin - this.meanWin;
    this.meanWin += delta / this.spins;
    this.winM2 += delta * (result.totalWin - this.meanWin);
    this.credited += result.totalWin;
    this.winning += result.totalWin > 0 ? 1 : 0;
    this.baseWin += result.baseGameWin;
    this.featureWin += result.feature?.totalWin ?? 0;
    this.maxWin = Math.max(this.maxWin, result.totalWin);
    const allRounds = this.rounds(result);
    const chains = [
      result.tumbleRounds,
      ...(result.feature?.spins.map((spin) => spin.tumbleRounds) ?? []),
    ];
    const triggered = chains.filter((rounds) => rounds.length > 0);
    this.tumbleTriggers += triggered.length;
    this.tumbleRounds += triggered.reduce((sum, rounds) => sum + rounds.length, 0);
    this.maxDepth = Math.max(this.maxDepth, ...chains.map((rounds) => rounds.length));
    if (result.tumbleRounds.length > 0) this.baseTumbleTriggers += 1;
    this.baseTumbleRounds += result.tumbleRounds.length;
    this.maxBaseDepth = Math.max(this.maxBaseDepth, result.tumbleRounds.length);
    const featureChains = result.feature?.spins.map((spin) => spin.tumbleRounds) ?? [];
    this.freeGameSpins += featureChains.length;
    this.freeGameTumbleTriggers += featureChains.filter((rounds) => rounds.length > 0).length;
    this.freeGameTumbleRounds += featureChains.reduce((sum, rounds) => sum + rounds.length, 0);
    this.maxFreeGameDepth = Math.max(
      this.maxFreeGameDepth,
      ...featureChains.map((rounds) => rounds.length),
    );
    let hasMultiplier = false;
    for (const round of allRounds) {
      if (round.bathala?.occurred) {
        this.bathala += 1;
        this.bathalaRemoved += round.bathala.removedPositions.length;
        this.bathalaNextWin += round.bathala.resultedInNextWin ? 1 : 0;
      }
      if (round.multiplierSymbols.length > 0) hasMultiplier = true;
      for (const multiplier of round.multiplierSymbols) {
        this.multiplierCount += 1;
        this.multiplierValue += multiplier.value;
      }
      if (round.effectiveMultiplier > 1) {
        this.multipliedRounds += 1;
        this.summedMultipliers += round.effectiveMultiplier;
        this.maxSummedMultiplier = Math.max(this.maxSummedMultiplier, round.effectiveMultiplier);
      }
    }
    this.multiplierSpins += hasMultiplier ? 1 : 0;
    if (result.feature) {
      this.features += 1;
      this.featureSpins += result.feature.totalSpinsPlayed;
      this.initialFeatureSpins += result.feature.initialAward;
      this.maxFeatureLength = Math.max(this.maxFeatureLength, result.feature.totalSpinsPlayed);
      this.featureLengths.push(result.feature.totalSpinsPlayed);
      this.retriggers += result.feature.retriggerCount;
      this.endingMultipliers += result.feature.endingMultiplier;
    }
    for (const key of Object.keys(this.components) as (keyof WinComponents)[])
      this.components[key] += result.components[key];
    TAILS.forEach((threshold, index) => {
      if (result.totalWin >= threshold) this.tailCounts[index]! += 1;
    });
  }

  report(config: ActiveGameConfig, simulation: BathalaSimulationConfig): BathalaSimulationReport {
    const divide = (value: number, denominator: number): number =>
      denominator === 0 ? 0 : value / denominator;
    const variance = divide(this.winM2, this.spins);
    const standardDeviation = Math.sqrt(variance);
    const standardError = divide(standardDeviation, Math.sqrt(this.spins));
    const sortedFeatureLengths = [...this.featureLengths].sort((a, b) => a - b);
    const percentile = (ratio: number): number => {
      if (sortedFeatureLengths.length === 0) return 0;
      return sortedFeatureLengths[Math.ceil(ratio * sortedFeatureLengths.length) - 1] ?? 0;
    };
    return {
      schemaVersion: '2.0.0',
      methodology: 'deterministic-streaming-monte-carlo',
      configurationId: config.configurationId,
      seed: simulation.seed,
      totalSpins: this.spins,
      totalBet: this.spins,
      totalCreditedWin: this.credited,
      rtp: divide(this.credited, this.spins),
      winningSpinFrequency: divide(this.winning, this.spins),
      averageWinPerWinningSpin: divide(this.credited, this.winning),
      baseGameTumbleTriggerFrequency: divide(this.baseTumbleTriggers, this.spins),
      freeGameTumbleTriggerFrequency: divide(this.freeGameTumbleTriggers, this.freeGameSpins),
      averageBaseGameTumbleRoundsPerTrigger: divide(this.baseTumbleRounds, this.baseTumbleTriggers),
      averageFreeGameTumbleRoundsPerTrigger: divide(
        this.freeGameTumbleRounds,
        this.freeGameTumbleTriggers,
      ),
      tumbleRoundsPerPaidSpin: divide(this.tumbleRounds, this.spins),
      tumbleTriggerFrequency: divide(this.tumbleTriggers, this.spins),
      averageTumbleRoundsPerTriggeringSpin: divide(this.tumbleRounds, this.tumbleTriggers),
      maximumObservedBaseGameTumbleDepth: this.maxBaseDepth,
      maximumObservedFreeGameTumbleDepth: this.maxFreeGameDepth,
      maximumObservedTumbleDepth: this.maxDepth,
      bathalaActivations: this.bathala,
      bathalaActivationFrequency: divide(this.bathala, this.tumbleRounds),
      averageSymbolsRemoved: divide(this.bathalaRemoved, this.bathala),
      bathalaToNextWinConversionRate: divide(this.bathalaNextWin, this.bathala),
      multiplierAppearanceFrequency: divide(this.multiplierSpins, this.spins),
      averageMultiplierValue: divide(this.multiplierValue, this.multiplierCount),
      averageSummedMultiplierOnMultipliedWins: divide(
        this.summedMultipliers,
        this.multipliedRounds,
      ),
      maximumSummedMultiplier: this.maxSummedMultiplier,
      freeGameTriggerCount: this.features,
      featureFrequency: divide(this.features, this.spins),
      averageFreeGamesPlayed: divide(this.featureSpins, this.features),
      averageInitiallyAwardedFreeGames: divide(this.initialFeatureSpins, this.features),
      maximumObservedFeatureLength: this.maxFeatureLength,
      featureLengthPercentiles: {
        p50: percentile(0.5),
        p75: percentile(0.75),
        p90: percentile(0.9),
        p95: percentile(0.95),
        p99: percentile(0.99),
      },
      retriggerCount: this.retriggers,
      averageRetriggersPerFeature: divide(this.retriggers, this.features),
      averageEndingFreeGameMultiplier: divide(this.endingMultipliers, this.features),
      freeGameWinContribution: divide(this.featureWin, this.spins),
      baseGameWinContribution: divide(this.baseWin, this.spins),
      maximumObservedWin: this.maxWin,
      meanWinPerPaidSpin: this.meanWin,
      variance,
      standardDeviation,
      coefficientOfVariation: divide(standardDeviation, this.meanWin),
      standardError,
      confidenceInterval95: [
        Math.max(0, this.meanWin - 1.96 * standardError),
        this.meanWin + 1.96 * standardError,
      ],
      components: this.components,
      tails: TAILS.map((threshold, index) => ({
        threshold,
        count: this.tailCounts[index]!,
        frequency: divide(this.tailCounts[index]!, this.spins),
      })),
    };
  }
}

export function runSimulation(
  config: ActiveGameConfig,
  simulation: BathalaSimulationConfig,
  rng: RandomSource,
): BathalaSimulationReport {
  if (!Number.isSafeInteger(simulation.spins) || simulation.spins <= 0)
    throw new RangeError('spins must be positive');
  const accumulator = new BathalaSimulationAccumulator();
  for (let index = 0; index < simulation.spins; index += 1)
    accumulator.record(resolveSpin(config, rng, simulation.trace ?? false));
  return accumulator.report(config, simulation);
}

export function assertFiniteReport(report: BathalaSimulationReport): void {
  const visit = (value: unknown, path: string): void => {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0))
      throw new Error(`${path} must be finite and non-negative`);
    if (Array.isArray(value)) value.forEach((child, index) => visit(child, `${path}[${index}]`));
    else if (value && typeof value === 'object')
      Object.entries(value).forEach(([key, child]) => visit(child, `${path}.${key}`));
  };
  visit(report, 'report');
}
