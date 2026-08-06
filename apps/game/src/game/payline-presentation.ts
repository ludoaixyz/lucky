import type { Payline } from '@lucky/shared-types';

const LINE_COLORS = [0x7de7d1, 0xffd66b, 0xff8ab3, 0x8eb8ff, 0xd19cff] as const;

export interface CellCenter {
  readonly x: number;
  readonly y: number;
  readonly reel: number;
  readonly row: number;
}

export function paylineColor(paylineId: string): number {
  let hash = 0;
  for (const character of paylineId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return LINE_COLORS[hash % LINE_COLORS.length] ?? LINE_COLORS[0];
}

export function matchedPaylineCenters(
  payline: Payline,
  matchedReels: number,
  reelCount: number,
  visibleRows: number,
  width: number,
  height: number,
): readonly CellCenter[] {
  if (!Number.isSafeInteger(matchedReels) || matchedReels < 0 || matchedReels > reelCount)
    throw new RangeError('Matched reel count is outside the configured reels');
  const cellWidth = width / reelCount;
  const cellHeight = height / visibleRows;
  return payline.rows.slice(0, matchedReels).map((row, reel) => {
    if (!Number.isSafeInteger(row) || row < 0 || row >= visibleRows)
      throw new RangeError(`Payline '${payline.id}' has invalid row ${row} on reel ${reel + 1}`);
    return {
      reel,
      row,
      x: reel * cellWidth + cellWidth / 2,
      y: row * cellHeight + cellHeight / 2,
    };
  });
}
