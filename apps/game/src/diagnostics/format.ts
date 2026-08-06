import type { LineWin, SymbolId } from '@lucky/shared-types';

export function formatVisibleWindow(window: readonly (readonly SymbolId[])[]): string {
  return window.map((reel) => reel.join('|')).join(' / ');
}

export function formatLineWins(lineWins: readonly LineWin[]): string {
  if (lineWins.length === 0) return '—';
  return lineWins
    .map((win) => `${win.paylineId}:${win.symbolId}×${win.count}=${win.awardCredits}`)
    .join(' | ');
}
