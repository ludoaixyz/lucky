import type {
  ActiveGameConfig,
  BathalaSpinResult,
  FreeGameFeatureResult,
  FreeGameSpinResult,
  WinComponents,
} from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { resolveTumbleChain } from './tumble.js';
import type { GenerationState } from './board.js';

export function resolveScatterPayout(config: ActiveGameConfig, count: number): number {
  return (
    Object.entries(config.scatter.payouts)
      .map(([minimum, payout]) => ({ minimum: Number(minimum), payout }))
      .filter((entry) => entry.minimum <= count)
      .sort((left, right) => right.minimum - left.minimum)[0]?.payout ?? 0
  );
}

export function resolveBaseFreeGameAward(config: ActiveGameConfig, count: number): number {
  return count >= config.scatter.baseGameTrigger.minimumScatters
    ? config.scatter.baseGameTrigger.freeGamesAwarded
    : 0;
}

export function resolveFreeGameRetrigger(config: ActiveGameConfig, count: number): number {
  return count >= config.scatter.freeGameRetrigger.minimumScatters
    ? config.scatter.freeGameRetrigger.additionalFreeGames
    : 0;
}

export function resolveFreeGameFeature(
  config: ActiveGameConfig,
  rng: RandomSource,
  initialAward: number,
  trace = false,
  generationState: GenerationState = { nextId: 1 },
): FreeGameFeatureResult {
  if (!Number.isSafeInteger(initialAward) || initialAward <= 0)
    throw new RangeError('initialAward must be positive');
  let spinsRemaining = initialAward;
  let accumulatedMultiplier = 0;
  let totalWin = 0;
  let retriggerCount = 0;
  const spins: FreeGameSpinResult[] = [];
  while (spinsRemaining > 0) {
    spinsRemaining -= 1;
    const before = accumulatedMultiplier;
    const chain = resolveTumbleChain(config, rng, 'freegame', {
      trace,
      accumulatedMultiplier,
      generationState,
    });
    accumulatedMultiplier = chain.accumulatedMultiplierAfter;
    const directScatterPay = resolveScatterPayout(config, chain.scatterCount);
    const retriggeredSpins = resolveFreeGameRetrigger(config, chain.scatterCount);
    if (retriggeredSpins > 0) {
      spinsRemaining += retriggeredSpins;
      retriggerCount += 1;
    }
    const win = chain.totalWin + directScatterPay;
    totalWin += win;
    spins.push({
      index: spins.length + 1,
      accumulatedMultiplierBefore: before,
      tumbleRounds: chain.rounds,
      accumulatedMultiplierAfter: accumulatedMultiplier,
      scattersLanded: chain.scatterCount,
      scatterPayout: directScatterPay,
      retriggeredSpins,
      win,
    });
  }
  return {
    initialAward,
    totalSpinsPlayed: spins.length,
    retriggerCount,
    startingMultiplier: 0,
    endingMultiplier: accumulatedMultiplier,
    spins,
    totalWin,
  };
}

export function resolveSpin(
  config: ActiveGameConfig,
  rng: RandomSource,
  trace = false,
): BathalaSpinResult {
  const generationState = { nextId: 1 };
  const base = resolveTumbleChain(config, rng, 'base', { trace, generationState });
  const directScatterPay = resolveScatterPayout(config, base.scatterCount);
  const freeGamesAwarded = resolveBaseFreeGameAward(config, base.scatterCount);
  const feature =
    freeGamesAwarded > 0
      ? resolveFreeGameFeature(config, rng, freeGamesAwarded, trace, generationState)
      : null;
  const baseRaw = base.rounds.reduce((sum, round) => sum + round.baseWin, 0);
  const featureRegularRaw =
    feature?.spins.reduce(
      (spinSum, spin) =>
        spinSum + spin.tumbleRounds.reduce((roundSum, round) => roundSum + round.baseWin, 0),
      0,
    ) ?? 0;
  const featureScatter = feature?.spins.reduce((sum, spin) => sum + spin.scatterPayout, 0) ?? 0;
  const featureTumbleCredited =
    feature?.spins.reduce(
      (spinSum, spin) =>
        spinSum + spin.tumbleRounds.reduce((roundSum, round) => roundSum + round.creditedWin, 0),
      0,
    ) ?? 0;
  const components: WinComponents = {
    baseGameRegularPayout: baseRaw,
    baseGameScatterPayout: directScatterPay,
    baseGameMultiplierUplift: base.totalWin - baseRaw,
    freeGameRegularPayout: featureRegularRaw,
    freeGameScatterPayout: featureScatter,
    freeGameMultiplierUplift: featureTumbleCredited - featureRegularRaw,
  };
  const baseGameWin = base.totalWin + directScatterPay;
  const totalWin = baseGameWin + (feature?.totalWin ?? 0);
  return {
    ...(base.initialBoard ? { initialBoard: base.initialBoard } : {}),
    finalBoard: base.finalBoard,
    tumbleRounds: base.rounds,
    baseGameWin,
    scatterCount: base.scatterCount,
    scatterPayout: directScatterPay,
    freeGamesAwarded,
    feature,
    components,
    totalWin,
  };
}
