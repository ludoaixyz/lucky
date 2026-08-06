import type { Credits, LineWin, RuntimeGameConfig, SymbolId } from '@lucky/shared-types';

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
  config: RuntimeGameConfig,
): LineWin[] {
  const wins: LineWin[] = [];
  const wild = config.rules.wild;
  for (const payline of config.paylines) {
    const line = payline.rows.map((row, reel) => window[reel]?.[row]);
    if (line.every((symbol) => symbol === wild.symbolId)) {
      if (wild.allWildCombinationRule === 'no-pay') continue;
    }
    let best: LineWin | undefined;
    for (const candidate of wild.substitutesFor) {
      let matchCount = 0;
      let usedWild = false;
      for (const symbol of line) {
        const isWild = wild.enabled && symbol === wild.symbolId;
        if (symbol === candidate || isWild) {
          matchCount += 1;
          usedWild ||= isWild;
        } else {
          break;
        }
      }
      const award = config.paytable
        .filter((entry) => entry.symbolId === candidate && entry.count <= matchCount)
        .sort((left, right) => right.awardCredits - left.awardCredits)[0];
      if (!award || award.awardCredits <= 0) continue;
      const wildMultiplier = usedWild ? wild.multiplier : 1;
      const awardCredits =
        award.awardCredits * config.rules.lineAwardRules.lineBetCredits * wildMultiplier;
      const resolved: LineWin = {
        paylineId: payline.id,
        symbolId: candidate,
        count: award.count,
        awardCredits,
      };
      if (!best || resolved.awardCredits > best.awardCredits) best = resolved;
    }
    if (best) wins.push(best);
  }
  return wins;
}

export function aggregateWins(lineWins: readonly LineWin[], scatterAward: Credits = 0): Credits {
  return lineWins.reduce((total, win) => total + win.awardCredits, scatterAward);
}

export function enforceMaximumWin(
  rawWin: Credits,
  maximumWin: Credits,
): { winCredits: Credits; capReductionCredits: Credits; capped: boolean } {
  if (
    !Number.isSafeInteger(rawWin) ||
    rawWin < 0 ||
    !Number.isSafeInteger(maximumWin) ||
    maximumWin < 0
  ) {
    throw new RangeError('Wins and caps must be non-negative safe integers');
  }
  const winCredits = Math.min(rawWin, maximumWin);
  return {
    winCredits,
    capReductionCredits: rawWin - winCredits,
    capped: rawWin > maximumWin,
  };
}
