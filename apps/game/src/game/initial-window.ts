import { buildVisibleWindow } from '@lucky/math-engine';
import type { RuntimeGameConfig, SymbolId } from '@lucky/shared-types';
import { symbolVisual } from './symbol-visuals.js';

export function initialReelWindow(config: RuntimeGameConfig): readonly (readonly SymbolId[])[] {
  if (
    config.configurationId === 'lucky888-production-20line-v1' &&
    (config.reelCount !== 5 || config.visibleRows !== 3)
  )
    throw new Error(
      `Playable production grid must be 5×3; received ${config.reelCount}×${config.visibleRows}`,
    );
  for (const symbol of config.symbols) symbolVisual(symbol.id);
  const window = buildVisibleWindow(
    config.reelStrips,
    config.reelStrips.map(() => 0),
    config.visibleRows,
  );
  if (
    window.length !== config.reelCount ||
    window.some((column) => column.length !== config.visibleRows)
  )
    throw new Error(
      `Initial reel window did not resolve to exactly ${config.reelCount}×${config.visibleRows} cells`,
    );
  const configured = new Set(config.symbols.map((symbol) => symbol.id));
  window.flat().forEach((symbol) => {
    if (!configured.has(symbol))
      throw new Error(`Initial reel window contains undefined symbol '${symbol}'`);
  });
  return window;
}
