import type { BathalaSymbolId, Board, SymbolCell } from '@lucky/shared-types';

type DefaultCell = BathalaSymbolId | number;

const DEFAULT_BOARD_ROWS: readonly (readonly DefaultCell[])[] = [
  ['L1', 'L1', 'L1', 'L1', 'L1', 'L1'],
  ['L2', 'L2', 'L2', 'L2', 'L2', 'L2'],
  [5, 10, 20, 50, 100, 500],
  ['H4', 'H4', 'H4', 'H4', 'H4', 'H4'],
  ['SCATTER', 'SCATTER', 'SCATTER', 'SCATTER', 'SCATTER', 'SCATTER'],
] as const;

export function createDefaultBoard(): Board {
  return Array.from({ length: 6 }, (_, column) =>
    DEFAULT_BOARD_ROWS.map((values, row): SymbolCell => {
      const value = values[column]!;
      return typeof value === 'number'
        ? {
            id: `default-${column}-${row}`,
            symbol: 'MULTIPLIER',
            multiplierValue: value,
            collectedIntoFreeGamePool: false,
          }
        : { id: `default-${column}-${row}`, symbol: value };
    }),
  );
}
