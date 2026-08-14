import type {
  ActiveGameConfig,
  Board,
  GameMode,
  TumbleChainResult,
  TumbleRound,
} from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { applyBathalaSkill } from './skill.js';
import {
  cloneBoard,
  collapseBoard,
  generateBoard,
  refillBoard,
  removePositions,
  type GenerationState,
} from './board.js';
import { countSymbol, evaluateCountWins } from './count-evaluator.js';

export interface TumbleOptions {
  readonly initialBoard?: Board;
  readonly trace?: boolean;
  readonly accumulatedMultiplier?: number;
  readonly generationState?: GenerationState;
}

export function resolveTumbleChain(
  config: ActiveGameConfig,
  rng: RandomSource,
  mode: GameMode,
  options: TumbleOptions = {},
): TumbleChainResult {
  const generationState = options.generationState ?? { nextId: 1 };
  let board = options.initialBoard
    ? cloneBoard(options.initialBoard)
    : generateBoard(config, mode, rng, generationState);
  const initialBoard = options.trace ? cloneBoard(board) : undefined;
  const rounds: TumbleRound[] = [];
  let accumulatedMultiplier = options.accumulatedMultiplier ?? 0;
  let totalWin = 0;
  for (let index = 0; ; index += 1) {
    const wins = evaluateCountWins(board, config);
    if (wins.length === 0) break;
    if (index >= config.maximumTumbleRounds)
      throw new Error(`Tumble safety limit reached at ${config.maximumTumbleRounds}`);
    const boardBefore = options.trace ? cloneBoard(board) : undefined;
    const baseWin = wins.reduce((sum, win) => sum + win.payout, 0);
    const multiplierCells = board.flat().filter((cell) => cell?.symbol === 'MULTIPLIER');
    const visibleMultiplierSum = multiplierCells.reduce(
      (sum, cell) => sum + (cell?.multiplierValue ?? 0),
      0,
    );
    let newlyCollectedMultiplierSum = 0;
    const multiplierSymbols = multiplierCells.map((cell) => {
      const newlyCollected = mode === 'freegame' && cell?.collectedIntoFreeGamePool !== true;
      if (newlyCollected && cell) {
        newlyCollectedMultiplierSum += cell.multiplierValue ?? 0;
        cell.collectedIntoFreeGamePool = true;
      }
      return { id: cell!.id, value: cell!.multiplierValue ?? 0, newlyCollected };
    });
    if (mode === 'freegame') accumulatedMultiplier += newlyCollectedMultiplierSum;
    const effectiveMultiplier =
      mode === 'freegame' ? Math.max(1, accumulatedMultiplier) : Math.max(1, visibleMultiplierSum);
    const creditedWin = baseWin * effectiveMultiplier;
    const removedWinningCells = wins.flatMap((win) => win.positions);
    removePositions(board, removedWinningCells);
    const bathala = applyBathalaSkill(board, config, rng);
    const boardAfterRemoval = options.trace ? cloneBoard(board) : undefined;
    board = collapseBoard(board);
    const boardAfterCollapse = options.trace ? cloneBoard(board) : undefined;
    board = refillBoard(board, config, mode, rng, generationState);
    bathala.resultedInNextWin = evaluateCountWins(board, config).length > 0;
    totalWin += creditedWin;
    rounds.push({
      index,
      winningSymbols: wins,
      baseWin,
      multiplierSymbols,
      visibleMultiplierSum,
      newlyCollectedMultiplierSum,
      effectiveMultiplier,
      creditedWin,
      removedWinningCells,
      bathala,
      ...(boardBefore ? { boardBefore } : {}),
      ...(boardAfterRemoval ? { boardAfterRemoval } : {}),
      ...(boardAfterCollapse ? { boardAfterCollapse } : {}),
      ...(options.trace ? { boardAfterRefill: cloneBoard(board) } : {}),
    });
  }
  const scatterCount = countSymbol(board, 'SCATTER');
  const scatterPayout = Number(config.scatter.payouts[String(scatterCount)] ?? 0);
  return {
    ...(initialBoard ? { initialBoard } : {}),
    finalBoard: board,
    rounds,
    totalWin,
    accumulatedMultiplierAfter: accumulatedMultiplier,
    scatterCount,
    scatterPayout,
  };
}
