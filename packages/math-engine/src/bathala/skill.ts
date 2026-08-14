import type {
  ActiveGameConfig,
  BathalaSkillResult,
  Board,
  Position,
  RegularSymbolId,
} from '@lucky/shared-types';
import type { RandomSource } from '../rng/random-source.js';
import { positionsFor } from './count-evaluator.js';
import { removePositions, weightedPick } from './board.js';

export function applyBathalaSkill(
  board: Board,
  config: ActiveGameConfig,
  rng: RandomSource,
): BathalaSkillResult {
  const rule = config.bathala;
  if (!rule.enabled) return { occurred: false, removedPositions: [] };
  const eligible = rule.eligibleSymbols.filter((symbol) => positionsFor(board, symbol).length > 0);
  if (eligible.length === 0) {
    if (!rule.allowNoEligibleTarget) throw new Error('Bathala requires an eligible low symbol');
    return { occurred: false, removedPositions: [] };
  }
  const target: RegularSymbolId =
    rule.selectionMode === 'weighted_symbol_type'
      ? weightedPick(
          eligible.map((symbol) => ({ symbol, weight: rule.selectionWeights?.[symbol] ?? 1 })),
          rng,
        ).symbol
      : eligible[rng.nextInt(eligible.length)]!;
  const positions = positionsFor(board, target);
  let removed: Position[];
  if (rule.removeMode === 'all_instances') removed = positions;
  else {
    const minimum = Math.min(rule.randomCount?.minimum ?? 1, positions.length);
    const maximum = Math.min(rule.randomCount?.maximum ?? positions.length, positions.length);
    const count = minimum + rng.nextInt(maximum - minimum + 1);
    const pool = [...positions];
    removed = [];
    while (removed.length < count) removed.push(pool.splice(rng.nextInt(pool.length), 1)[0]!);
  }
  removePositions(board, removed);
  return { occurred: true, targetSymbol: target, removedPositions: removed };
}
