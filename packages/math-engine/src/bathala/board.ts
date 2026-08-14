import type {
  ActiveGameConfig,
  Board,
  BoardCell,
  GameMode,
  Position,
  SymbolCell,
  WeightedMultiplier,
  WeightedSymbol,
} from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';

export interface GenerationState {
  nextId: number;
}

export function cloneBoard(board: Board): Board {
  return board.map((column) => column.map((cell) => (cell === null ? null : { ...cell })));
}

export function weightedPick<T extends { readonly weight: number }>(
  values: readonly T[],
  rng: RandomSource,
): T {
  const total = values.reduce((sum, value) => sum + value.weight, 0);
  if (!(total > 0)) throw new RangeError('Weighted collection must have positive total weight');
  const target = rng.nextFloat() * total;
  let cursor = 0;
  for (const value of values) {
    cursor += value.weight;
    if (target < cursor) return value;
  }
  return values.at(-1) as T;
}

export function generateCell(
  weights: readonly WeightedSymbol[],
  multipliers: readonly WeightedMultiplier[],
  rng: RandomSource,
  state: GenerationState,
): SymbolCell {
  const symbol = weightedPick(weights, rng).symbol;
  const id = `cell-${state.nextId++}`;
  return symbol === 'MULTIPLIER'
    ? {
        id,
        symbol,
        multiplierValue: weightedPick(multipliers, rng).value,
        collectedIntoFreeGamePool: false,
      }
    : { id, symbol };
}

export function generateBoard(
  config: ActiveGameConfig,
  mode: GameMode,
  rng: RandomSource,
  state: GenerationState,
): Board {
  const weights = mode === 'base' ? config.baseSymbolWeights : config.freegameSymbolWeights;
  return Array.from({ length: config.columns }, () =>
    Array.from({ length: config.rows }, () =>
      generateCell(weights, config.multiplierValues, rng, state),
    ),
  );
}

export function removePositions(board: Board, positions: readonly Position[]): void {
  for (const { column, row } of positions) board[column]![row] = null;
}

export function collapseBoard(board: Board): Board {
  return board.map((column) => {
    const survivors = column.filter((cell): cell is SymbolCell => cell !== null);
    return [...Array<BoardCell>(column.length - survivors.length).fill(null), ...survivors];
  });
}

export function refillBoard(
  board: Board,
  config: ActiveGameConfig,
  mode: GameMode,
  rng: RandomSource,
  state: GenerationState,
): Board {
  const weights = mode === 'base' ? config.baseSymbolWeights : config.freegameSymbolWeights;
  return board.map((column) =>
    column.map((cell) => cell ?? generateCell(weights, config.multiplierValues, rng, state)),
  );
}

export function occupiedCellCount(board: Board): number {
  return board.reduce((total, column) => total + column.filter(Boolean).length, 0);
}
