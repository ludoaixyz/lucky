import type {
  ActiveGameConfig,
  Board,
  Position,
  RegularSymbolId,
  SymbolWin,
} from '@lucky/shared-types';

export function positionsFor(board: Board, symbol: string): Position[] {
  const result: Position[] = [];
  board.forEach((column, columnIndex) =>
    column.forEach((cell, row) => {
      if (cell?.symbol === symbol) result.push({ column: columnIndex, row });
    }),
  );
  return result;
}

export function payoutFor(
  config: ActiveGameConfig,
  symbol: RegularSymbolId,
  count: number,
): number {
  return (
    config.paytable.find(
      (award) => award.symbol === symbol && count >= award.minCount && count <= award.maxCount,
    )?.payout ?? 0
  );
}

export function evaluateCountWins(board: Board, config: ActiveGameConfig): SymbolWin[] {
  return config.regularSymbols.flatMap((symbol) => {
    const positions = positionsFor(board, symbol);
    if (positions.length < config.minimumWinCount) return [];
    const payout = payoutFor(config, symbol, positions.length);
    if (payout <= 0) throw new Error(`No count pay configured for ${symbol} x${positions.length}`);
    return [{ symbol, count: positions.length, payout, positions }];
  });
}

export function countSymbol(board: Board, symbol: string): number {
  return positionsFor(board, symbol).length;
}
