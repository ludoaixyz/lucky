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
  const baseMultiple = Math.min(result.baseGameWin, result.totalWin);
  const featureMultiple = Math.max(0, result.totalWin - baseMultiple);
  const capScale = result.uncappedTotalWin === 0 ? 1 : result.totalWin / result.uncappedTotalWin;
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
    totalWin: scaleNormalizedWin(result.totalWin, context.bet),
    winMultiple: result.totalWin,
    winning: result.totalWin > 0,
    winOutcomes,
    totalTumbleRounds: allRounds.length,
    baseTumbleRounds: result.tumbleRounds.length,
    freeGameTumbleRounds: freeRounds.length,
    maximumTumbleDepth: Math.max(
      result.tumbleRounds.length,
      ...(result.feature?.spins.map((spin) => spin.tumbleRounds.length) ?? [0]),
    ),
    bathalaActivations: allRounds.filter((round) => round.bathala?.occurred).length,
    bathalaSymbolsRemoved: allRounds.reduce(
      (sum, round) => sum + (round.bathala?.removedPositions.length ?? 0),
      0,
    ),
    multiplierAppeared: multipliers.length > 0,
    multiplierValues: multipliers,
    summedMultiplier: allRounds.reduce(
      (maximum, round) => Math.max(maximum, round.effectiveMultiplier),
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
