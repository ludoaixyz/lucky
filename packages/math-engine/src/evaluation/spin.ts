import type { RuntimeGameConfig, SpinResult } from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { aggregateWins, countScatters, enforceMaximumWin, evaluatePaylines } from './evaluate.js';
import { resolveBonusAward, resolveFreeSpinFeature } from './bonus.js';
import { buildVisibleWindow, selectReelStops } from './reels.js';

export function resolveSpin(config: RuntimeGameConfig, rng: RandomSource): SpinResult {
  const stops = selectReelStops(config.reelStrips, rng);
  const window = buildVisibleWindow(config.reelStrips, stops, config.visibleRows);
  const wildId = config.symbols.find((symbol) => symbol.category === 'wild')?.id;
  const lineWins = evaluatePaylines(window, config.paylines, config.paytable, wildId);
  const scatterCount = countScatters(window, config.bonus.triggerSymbolId);
  const baseLineWinCredits = aggregateWins(lineWins);
  const baseScatterWinCredits = 0;
  const baseWinCredits = baseLineWinCredits + baseScatterWinCredits;
  const initialAward = resolveBonusAward(config.bonus, scatterCount);
  const feature = initialAward > 0 ? resolveFreeSpinFeature(config, rng, initialAward) : null;
  const featureWinCredits = feature?.totalWinCredits ?? 0;
  const uncappedTotalWinCredits = baseWinCredits + featureWinCredits;
  const capped = enforceMaximumWin(uncappedTotalWinCredits, config.maximumWinCredits);
  return {
    stops,
    window,
    lineWins,
    scatterCount,
    baseLineWinCredits,
    baseScatterWinCredits,
    baseWinCredits,
    featureWinCredits,
    uncappedTotalWinCredits,
    totalWinCredits: capped.winCredits,
    featureTriggered: feature !== null,
    feature,
    maximumWinApplied: capped.capped,
  };
}
