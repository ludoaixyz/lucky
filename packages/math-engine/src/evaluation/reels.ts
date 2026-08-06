import type { ReelStop, SymbolId } from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';

export function selectReelStops(
  reels: readonly (readonly SymbolId[])[],
  rng: RandomSource,
): ReelStop[] {
  return reels.map((reel) => {
    if (reel.length === 0) throw new RangeError('Cannot select a stop on an empty reel');
    return rng.nextInt(reel.length);
  });
}

export function buildVisibleWindow(
  reels: readonly (readonly SymbolId[])[],
  stops: readonly ReelStop[],
  visibleRows: number,
): SymbolId[][] {
  if (reels.length !== stops.length) throw new RangeError('A stop is required for every reel');
  if (!Number.isSafeInteger(visibleRows) || visibleRows <= 0)
    throw new RangeError('visibleRows must be positive');
  return reels.map((reel, reelIndex) => {
    if (reel.length === 0) throw new RangeError(`Reel ${reelIndex + 1} is empty`);
    const stop = stops[reelIndex];
    if (stop === undefined || stop < 0 || stop >= reel.length)
      throw new RangeError(`Invalid stop for reel ${reelIndex + 1}`);
    return Array.from(
      { length: visibleRows },
      (_, row) => reel[(stop + row) % reel.length] as SymbolId,
    );
  });
}
