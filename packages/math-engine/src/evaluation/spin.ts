import type { RuntimeGameConfig, SpinResult } from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { aggregateWins, countScatters, enforceMaximumWin, evaluatePaylines } from './evaluate.js';
import { buildVisibleWindow, selectReelStops } from './reels.js';

export function resolveSpin(config: RuntimeGameConfig, rng: RandomSource): SpinResult {
  const stops = selectReelStops(config.reelStrips, rng);
  const window = buildVisibleWindow(config.reelStrips, stops, config.visibleRows);
  const wildId = config.symbols.find((symbol) => symbol.category === 'wild')?.id;
  const lineWins = evaluatePaylines(window, config.paylines, config.paytable, wildId);
  const scatterCount = countScatters(window, config.bonus.triggerSymbolId);
  const featureTriggered = scatterCount >= config.bonus.minimumCount;
  const rawWinCredits = aggregateWins(lineWins);
  const capped = enforceMaximumWin(rawWinCredits, config.maximumWinCredits);
  return { stops, window, lineWins, scatterCount, featureTriggered, rawWinCredits, ...capped };
}
