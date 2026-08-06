import type { RuntimeGameConfig, SpinResult } from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { aggregateWins, countScatters, enforceMaximumWin, evaluatePaylines } from './evaluate.js';
import { resolveBonusAward, resolveFreeSpinFeature } from './bonus.js';
import { buildVisibleWindow, selectReelStops } from './reels.js';

export function resolveSpin(config: RuntimeGameConfig, rng: RandomSource): SpinResult {
  const stops = selectReelStops(config.reelStrips, rng);
  const window = buildVisibleWindow(config.reelStrips, stops, config.visibleRows);
  const lineWins = evaluatePaylines(window, config);
  const scatterCount = countScatters(window, config.bonus.triggerSymbolId);
  const uncappedBaseLineWinCredits = aggregateWins(lineWins);
  const uncappedBaseScatterWinCredits = 0;
  const uncappedBaseWinCredits = uncappedBaseLineWinCredits + uncappedBaseScatterWinCredits;
  const initialAward = resolveBonusAward(config.bonus, scatterCount);
  const feature = initialAward > 0 ? resolveFreeSpinFeature(config, rng, initialAward) : null;
  const uncappedFeatureWinCredits = feature?.totalWinCredits ?? 0;
  const uncappedTotalWinCredits = uncappedBaseWinCredits + uncappedFeatureWinCredits;
  const capped = enforceMaximumWin(uncappedTotalWinCredits, config.maximumWinCredits);
  return {
    stops,
    window,
    lineWins,
    scatterCount,
    uncappedBaseLineWinCredits,
    uncappedBaseScatterWinCredits,
    uncappedBaseWinCredits,
    uncappedFeatureWinCredits,
    uncappedTotalWinCredits,
    totalWinCredits: capped.winCredits,
    capReductionCredits: capped.capReductionCredits,
    featureTriggered: feature !== null,
    feature,
    maximumWinApplied: capped.capped,
  };
}
