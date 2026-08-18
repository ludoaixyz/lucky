import type {
  ActiveGameConfig,
  BathalaSpinResult,
  SpinRecord,
  TumbleRound,
  WinOutcome,
} from '@lucky/shared-types';

export interface SpinRecordContext {
  readonly sessionId: string;
  readonly sessionSeed: number;
  readonly spinNumber: number;
  readonly timestamp: string;
  readonly bet: number;
}

export function scaleNormalizedWin(winMultiple: number, bet: number): number {
  if (!Number.isFinite(winMultiple) || winMultiple < 0)
    throw new RangeError('Win multiple must be non-negative');
  if (!Number.isFinite(bet) || bet <= 0) throw new RangeError('Bet must be positive');
  return winMultiple * bet;
}

export function createSpinRecord(
  config: ActiveGameConfig,
  result: BathalaSpinResult,
  context: SpinRecordContext,
): SpinRecord {
  const freeRounds = result.feature?.spins.flatMap((spin) => spin.tumbleRounds) ?? [];
  const allRounds: readonly TumbleRound[] = [...result.tumbleRounds, ...freeRounds];
  const multipliers = allRounds.flatMap((round) =>
    round.multiplierSymbols.map(({ value }) => value),
  );
  const multipliedRounds = allRounds.filter((round) => round.effectiveMultiplier > 1);
  const tumbleChains = [
    result.tumbleRounds,
    ...(result.feature?.spins.map((spin) => spin.tumbleRounds) ?? []),
  ];
  const baseMultiple = Math.min(result.baseGameWin, result.totalWin);
  const featureMultiple = Math.max(0, result.totalWin - baseMultiple);
  const capScale = result.uncappedTotalWin === 0 ? 1 : result.totalWin / result.uncappedTotalWin;
  const maximumBaseTumbleDepth = result.tumbleRounds.length;
  const maximumFreeGameTumbleDepth = Math.max(
    0,
    ...(result.feature?.spins.map((spin) => spin.tumbleRounds.length) ?? []),
  );
  const roundOutcomes = (
    rounds: readonly TumbleRound[],
    phase: WinOutcome['phase'],
    freeGameIndex?: number,
  ): WinOutcome[] =>
    rounds.flatMap((round) =>
      round.winningSymbols.map((win) => ({
        phase,
        ...(freeGameIndex === undefined ? {} : { freeGameIndex }),
        tumbleIndex: round.index,
        symbolId: win.symbol,
        symbolCount: win.count,
        basePayoutMultiple: win.payout,
        multiplierApplied: round.effectiveMultiplier,
        creditedPayoutMultiple: win.payout * round.effectiveMultiplier * capScale,
      })),
    );
  const winOutcomes = [
    ...roundOutcomes(result.tumbleRounds, 'base'),
    ...(result.feature?.spins.flatMap((spin) =>
      roundOutcomes(spin.tumbleRounds, 'free', spin.index),
    ) ?? []),
  ];
  return {
    sessionId: context.sessionId,
    sessionSeed: context.sessionSeed,
    spinNumber: context.spinNumber,
    spinIndex: context.spinNumber - 1,
    timestamp: context.timestamp,
    configurationId: config.configurationId,
    configurationVersion: config.metadata.version,
    profileName: config.metadata.profileName,
    bet: context.bet,
    baseWin: scaleNormalizedWin(baseMultiple, context.bet),
    featureWin: scaleNormalizedWin(featureMultiple, context.bet),
    baseRegularWin: scaleNormalizedWin(result.components.baseGameRegularPayout, context.bet),
    baseScatterWin: scaleNormalizedWin(result.components.baseGameScatterPayout, context.bet),
    baseMultiplierUplift: scaleNormalizedWin(
      result.components.baseGameMultiplierUplift,
      context.bet,
    ),
    featureRegularWin: scaleNormalizedWin(result.components.freeGameRegularPayout, context.bet),
    featureScatterWin: scaleNormalizedWin(result.components.freeGameScatterPayout, context.bet),
    featureMultiplierUplift: scaleNormalizedWin(
      result.components.freeGameMultiplierUplift,
      context.bet,
    ),
    totalWin: scaleNormalizedWin(result.totalWin, context.bet),
    winMultiple: result.totalWin,
    winning: result.totalWin > 0,
    winOutcomes,
    totalTumbleRounds: allRounds.length,
    totalTumbleTriggers: tumbleChains.filter((rounds) => rounds.length > 0).length,
    baseTumbleRounds: result.tumbleRounds.length,
    freeGameTumbleRounds: freeRounds.length,
    freeGameTumbleTriggers:
      result.feature?.spins.filter((spin) => spin.tumbleRounds.length > 0).length ?? 0,
    maximumTumbleDepth: Math.max(maximumBaseTumbleDepth, maximumFreeGameTumbleDepth),
    maximumBaseTumbleDepth,
    maximumFreeGameTumbleDepth,
    bathalaActivations: allRounds.filter((round) => round.bathala?.occurred).length,
    bathalaSymbolsRemoved: allRounds.reduce(
      (sum, round) => sum + (round.bathala?.removedPositions.length ?? 0),
      0,
    ),
    bathalaNextWinConversions: allRounds.filter(
      (round) => round.bathala?.occurred && round.bathala.resultedInNextWin,
    ).length,
    multiplierAppeared: multipliers.length > 0,
    multiplierValues: multipliers,
    summedMultiplier: allRounds.reduce(
      (maximum, round) => Math.max(maximum, round.effectiveMultiplier),
      0,
    ),
    multipliedTumbleRounds: multipliedRounds.length,
    summedEffectiveMultipliers: multipliedRounds.reduce(
      (sum, round) => sum + round.effectiveMultiplier,
      0,
    ),
    scatterCount: result.scatterCount,
    featureTriggered: result.feature !== null,
    freeGamesAwarded: result.freeGamesAwarded,
    freeGamesPlayed: result.feature?.totalSpinsPlayed ?? 0,
    retriggerCount: result.feature?.retriggerCount ?? 0,
    ...(result.feature ? { endingFreeGameMultiplier: result.feature.endingMultiplier } : {}),
    maximumWinApplied: result.maximumWinApplied,
  };
}
