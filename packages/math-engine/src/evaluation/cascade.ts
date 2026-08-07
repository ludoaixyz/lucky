import type {
  CascadeStage,
  GridCoordinate,
  LineWin,
  RuntimeGameConfig,
  SymbolId,
} from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { aggregateWins, evaluatePaylines } from './evaluate.js';

export const DEFAULT_MAXIMUM_CASCADES_PER_SPIN = 100;

export interface CascadeSequence {
  readonly stages: readonly CascadeStage[];
  readonly cascadeCount: number;
  readonly totalPayoutCredits: number;
  readonly cascadePayoutCredits: number;
}

export function extractWinningCoordinates(
  lineWins: readonly LineWin[],
  config: RuntimeGameConfig,
): GridCoordinate[] {
  const positions = new Map<string, GridCoordinate>();
  const paylines = new Map(config.paylines.map((payline) => [payline.id, payline]));
  for (const win of lineWins) {
    const payline = paylines.get(win.paylineId);
    if (!payline) throw new Error(`Unknown winning payline '${win.paylineId}'`);
    for (let reel = 0; reel < win.count; reel += 1) {
      const row = payline.rows[reel];
      if (row === undefined)
        throw new Error(`Payline '${win.paylineId}' has no row for reel ${reel}`);
      positions.set(`${reel}:${row}`, { reel, row });
    }
  }
  return [...positions.values()].sort(
    (left, right) => left.reel - right.reel || left.row - right.row,
  );
}

export function collapseAndRefill(
  window: readonly (readonly SymbolId[])[],
  removedCoordinates: readonly GridCoordinate[],
  reelStrips: readonly (readonly SymbolId[])[],
  rng: RandomSource,
): SymbolId[][] {
  const removedByReel = new Map<number, Set<number>>();
  for (const position of removedCoordinates) {
    const rows = removedByReel.get(position.reel) ?? new Set<number>();
    rows.add(position.row);
    removedByReel.set(position.reel, rows);
  }
  return window.map((column, reel) => {
    const strip = reelStrips[reel];
    if (!strip || strip.length === 0)
      throw new RangeError(`Cannot refill from empty reel ${reel + 1}`);
    const removedRows = removedByReel.get(reel) ?? new Set<number>();
    const survivors = column.filter((_, row) => !removedRows.has(row));
    const replacements = Array.from(
      { length: column.length - survivors.length },
      () => strip[rng.nextInt(strip.length)] as SymbolId,
    );
    return [...replacements, ...survivors];
  });
}

export function resolveCascadeSequence(
  initialWindow: readonly (readonly SymbolId[])[],
  reelStrips: readonly (readonly SymbolId[])[],
  config: RuntimeGameConfig,
  rng: RandomSource,
): CascadeSequence {
  const maximum = config.cascades?.maximumCascadesPerSpin ?? DEFAULT_MAXIMUM_CASCADES_PER_SPIN;
  const stages: CascadeStage[] = [];
  let window = initialWindow.map((column) => [...column]);
  let cascadeCount = 0;
  let totalPayoutCredits = 0;
  let cascadePayoutCredits = 0;

  while (true) {
    const lineWins = evaluatePaylines(window, config);
    const payoutCredits = aggregateWins(lineWins);
    const removedCoordinates = extractWinningCoordinates(lineWins, config);
    stages.push({
      index: cascadeCount,
      window,
      lineWins,
      payoutCredits,
      multiplier: 1,
      removedCoordinates,
    });
    totalPayoutCredits += payoutCredits;
    if (cascadeCount > 0) cascadePayoutCredits += payoutCredits;
    if (removedCoordinates.length === 0) break;
    if (cascadeCount >= maximum) {
      throw new Error(`Cascade safety limit reached after ${maximum} additional boards`);
    }
    window = collapseAndRefill(window, removedCoordinates, reelStrips, rng);
    cascadeCount += 1;
  }
  return { stages, cascadeCount, totalPayoutCredits, cascadePayoutCredits };
}
