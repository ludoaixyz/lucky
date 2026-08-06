import type {
  BonusAward,
  BonusConfig,
  FeatureResult,
  FreeSpinResult,
  RuntimeGameConfig,
} from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { aggregateWins, countScatters, evaluatePaylines } from './evaluate.js';
import { buildVisibleWindow, selectReelStops } from './reels.js';

function awardForCount(awards: readonly BonusAward[], scatterCount: number): number {
  let freeSpins = 0;
  for (const award of awards) {
    if (scatterCount >= award.count) freeSpins = award.freeSpins;
    else break;
  }
  return freeSpins;
}

export function resolveBonusAward(config: BonusConfig, scatterCount: number): number {
  if (!config.enabled || scatterCount < config.minimumCount) return 0;
  return awardForCount(config.awards, scatterCount);
}

export function resolveRetriggerAward(config: BonusConfig, scatterCount: number): number {
  if (!config.enabled || !config.retriggerEnabled || scatterCount < config.minimumCount) return 0;
  return awardForCount(config.retriggerAwards, scatterCount);
}

export function resolveFreeSpin(
  config: RuntimeGameConfig,
  rng: RandomSource,
  spinIndex: number,
): FreeSpinResult {
  const strips = config.freeSpinReelStrips;
  const stops = selectReelStops(strips, rng);
  const window = buildVisibleWindow(strips, stops, config.visibleRows);
  const lineWins = evaluatePaylines(window, config);
  const scatterCount = countScatters(window, config.bonus.triggerSymbolId);
  const rawWinCredits = aggregateWins(lineWins);
  const winCredits = rawWinCredits * config.bonus.freeSpinMultiplier;
  if (!Number.isSafeInteger(winCredits))
    throw new RangeError('Free-spin win exceeds safe integer range');
  return {
    spinIndex,
    stops,
    window,
    lineWins,
    scatterCount,
    retriggeredFreeSpins: resolveRetriggerAward(config.bonus, scatterCount),
    rawWinCredits,
    multiplier: config.bonus.freeSpinMultiplier,
    winCredits,
  };
}

export function resolveFreeSpinFeature(
  config: RuntimeGameConfig,
  rng: RandomSource,
  initialAward: number,
): FeatureResult {
  if (!Number.isSafeInteger(initialAward) || initialAward <= 0) {
    throw new RangeError('initialAward must be a positive safe integer');
  }
  const freeSpins: FreeSpinResult[] = [];
  const initialAwardedSpins = Math.min(initialAward, config.bonus.maximumFeatureSpins);
  let remainingFreeSpins = initialAwardedSpins;
  let playedFreeSpins = 0;
  let totalRetriggeredSpins = 0;
  let retriggerCount = 0;
  let totalWinCredits = 0;
  let limitReached = initialAwardedSpins < initialAward;

  while (remainingFreeSpins > 0 && playedFreeSpins < config.bonus.maximumFeatureSpins) {
    remainingFreeSpins -= 1;
    playedFreeSpins += 1;
    const resolved = resolveFreeSpin(config, rng, playedFreeSpins);
    let allowedRetriggerSpins = 0;
    if (resolved.retriggeredFreeSpins > 0) {
      if (retriggerCount < config.bonus.maximumRetriggers) {
        const availableCapacity =
          config.bonus.maximumFeatureSpins - (playedFreeSpins + remainingFreeSpins);
        allowedRetriggerSpins = Math.min(resolved.retriggeredFreeSpins, availableCapacity);
        if (allowedRetriggerSpins > 0) retriggerCount += 1;
        if (allowedRetriggerSpins < resolved.retriggeredFreeSpins) limitReached = true;
      } else {
        limitReached = true;
      }
    }
    remainingFreeSpins += allowedRetriggerSpins;
    totalRetriggeredSpins += allowedRetriggerSpins;
    totalWinCredits += resolved.winCredits;
    if (!Number.isSafeInteger(totalWinCredits))
      throw new RangeError('Feature win exceeds safe integer range');
    freeSpins.push({ ...resolved, retriggeredFreeSpins: allowedRetriggerSpins });
  }
  if (remainingFreeSpins > 0) limitReached = true;

  return {
    triggered: true,
    initialAwardedSpins,
    totalPlayedSpins: playedFreeSpins,
    totalRetriggeredSpins,
    retriggerCount,
    totalWinCredits,
    freeSpins,
    limitReached,
  };
}
