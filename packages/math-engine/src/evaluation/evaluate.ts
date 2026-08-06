import type { Credits, LineWin, PayAward, Payline, SymbolId } from '@lucky/shared-types';

export function countScatters(
  window: readonly (readonly SymbolId[])[],
  scatterId: SymbolId,
): number {
  return window.reduce(
    (total, reel) => total + reel.filter((symbol) => symbol === scatterId).length,
    0,
  );
}

export function evaluatePaylines(
  window: readonly (readonly SymbolId[])[],
  paylines: readonly Payline[],
  paytable: readonly PayAward[],
  wildId?: SymbolId,
): LineWin[] {
  const wins: LineWin[] = [];
  for (const payline of paylines) {
    const line = payline.rows.map((row, reel) => window[reel]?.[row]);
    const firstRegular = line.find((symbol) => symbol !== undefined && symbol !== wildId);
    if (firstRegular === undefined) continue;
    let count = 0;
    for (const symbol of line) {
      if (symbol === firstRegular || symbol === wildId) count += 1;
      else break;
    }
    const award = paytable.find(
      (entry) => entry.symbolId === firstRegular && entry.count === count,
    );
    if (award && award.awardCredits > 0) {
      wins.push({
        paylineId: payline.id,
        symbolId: firstRegular,
        count,
        awardCredits: award.awardCredits,
      });
    }
  }
  return wins;
}

export function aggregateWins(lineWins: readonly LineWin[], scatterAward: Credits = 0): Credits {
  return lineWins.reduce((total, win) => total + win.awardCredits, scatterAward);
}

export function enforceMaximumWin(
  rawWin: Credits,
  maximumWin: Credits,
): { winCredits: Credits; capped: boolean } {
  if (
    !Number.isSafeInteger(rawWin) ||
    rawWin < 0 ||
    !Number.isSafeInteger(maximumWin) ||
    maximumWin < 0
  ) {
    throw new RangeError('Wins and caps must be non-negative safe integers');
  }
  return { winCredits: Math.min(rawWin, maximumWin), capped: rawWin > maximumWin };
}
