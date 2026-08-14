import { describe, expect, it } from 'vitest';
import type {
  ActiveGameConfig,
  BathalaSymbolId,
  Board,
  SymbolCell,
  WinComponents,
} from '@lucky/shared-types';
import type { RandomSource } from '../src/index.js';
import {
  applyBathalaSkill,
  collapseBoard,
  evaluateCountWins,
  occupiedCellCount,
  refillBoard,
  removePositions,
  resolveBaseFreeGameAward,
  resolveFreeGameFeature,
  resolveFreeGameRetrigger,
  resolveScatterPayout,
  resolveSpin,
  resolveTumbleChain,
  SeededRandom,
  validateConfig,
} from '../src/index.js';

const regular = ['L1', 'L2', 'L3', 'L4', 'L5', 'H1', 'H2', 'H3', 'H4'] as const;
const requiredMultipliers = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500];
function fixture(overrides: Partial<ActiveGameConfig> = {}): ActiveGameConfig {
  const symbols = [...regular, 'SCATTER', 'MULTIPLIER'] as const;
  return {
    schemaVersion: '2.0.0',
    gameId: 'lucky888',
    gameName: 'Lucky888',
    gameVersion: '2.0.0',
    configurationId: 'test',
    model: 'bathala-count-pay-tumble',
    columns: 6,
    rows: 5,
    minimumWinCount: 8,
    totalBet: 1,
    maximumTumbleRounds: 100,
    freeGameMultiplierCollectionTrigger: 'winning_round',
    symbols,
    regularSymbols: regular,
    lowSymbols: regular.slice(0, 5),
    baseSymbolWeights: symbols.map((symbol) => ({
      symbol,
      weight: symbol === 'SCATTER' || symbol === 'MULTIPLIER' ? 0.001 : 1,
    })),
    freegameSymbolWeights: symbols.map((symbol) => ({
      symbol,
      weight: symbol === 'SCATTER' || symbol === 'MULTIPLIER' ? 0.001 : 1,
    })),
    multiplierValues: requiredMultipliers.map((value) => ({ value, weight: 1 })),
    paytable: regular.map((symbol, index) => ({
      symbol,
      minCount: 8,
      maxCount: 30,
      payout: index + 1,
    })),
    bathala: {
      enabled: true,
      trigger: 'after_scoring_elimination',
      eligibleSymbols: regular.slice(0, 5),
      selectionMode: 'random_symbol_type',
      removeMode: 'all_instances',
      allowNoEligibleTarget: true,
      awardsDirectPayout: false,
    },
    scatter: {
      evaluationTiming: 'final_board',
      payouts: { '4': 3, '5': 5, '6': 100 },
      baseGameTrigger: { minimumScatters: 4, freeGamesAwarded: 15 },
      freeGameRetrigger: { minimumScatters: 3, additionalFreeGames: 5 },
    },
    ...overrides,
  };
}

function cell(symbol: BathalaSymbolId, id: string, value?: number): SymbolCell {
  return symbol === 'MULTIPLIER'
    ? { id, symbol, multiplierValue: value ?? 2, collectedIntoFreeGamePool: false }
    : { id, symbol };
}
function board(symbols: readonly (BathalaSymbolId | [BathalaSymbolId, number])[]): Board {
  if (symbols.length !== 30) throw new Error('board requires 30 cells');
  return Array.from({ length: 6 }, (_, column) =>
    Array.from({ length: 5 }, (_, row) => {
      const value = symbols[column * 5 + row]!;
      return Array.isArray(value)
        ? cell(value[0], `c-${column}-${row}`, value[1])
        : cell(value, `c-${column}-${row}`);
    }),
  );
}
function filler(
  prefix: BathalaSymbolId[] = ['L2', 'L3', 'L4', 'L5', 'H1', 'H2', 'H3', 'H4'],
): BathalaSymbolId[] {
  return Array.from({ length: 30 }, (_, index) => prefix[index % prefix.length]!);
}
function componentTotal(components: WinComponents): number {
  return (
    components.baseGameRegularPayout +
    components.baseGameScatterPayout +
    components.baseGameMultiplierUplift +
    components.freeGameRegularPayout +
    components.freeGameScatterPayout +
    components.freeGameMultiplierUplift
  );
}
class FloatSequence implements RandomSource {
  private index = 0;
  constructor(private readonly values: readonly number[] = []) {}
  nextFloat(): number {
    return this.values[this.index++] ?? (this.index * 0.61803398875) % 1;
  }
  nextUint32(): number {
    return Math.floor(this.nextFloat() * 0x1_0000_0000) >>> 0;
  }
  nextInt(maximum: number): number {
    return Math.min(maximum - 1, Math.floor(this.nextFloat() * maximum));
  }
}

describe('Bathala count-pay model', () => {
  it('pays exactly 8 symbols and rejects 7', () => {
    const values = filler();
    values.splice(0, 8, ...Array<BathalaSymbolId>(8).fill('L1'));
    expect(evaluateCountWins(board(values), fixture())).toMatchObject([
      { symbol: 'L1', count: 8, payout: 1 },
    ]);
    values[7] = 'H4';
    expect(evaluateCountWins(board(values), fixture()).some((win) => win.symbol === 'L1')).toBe(
      false,
    );
  });

  it('evaluates multiple simultaneous global-count wins', () => {
    const values: BathalaSymbolId[] = [
      ...Array<BathalaSymbolId>(8).fill('L1'),
      ...Array<BathalaSymbolId>(9).fill('H2'),
      ...filler(['L2', 'L3', 'L4', 'L5', 'H1', 'H3', 'H4']).slice(0, 13),
    ];
    expect(
      evaluateCountWins(board(values), fixture()).map(({ symbol, count }) => [symbol, count]),
    ).toEqual([
      ['L1', 8],
      ['H2', 9],
    ]);
  });

  it('removes every scoring cell', () => {
    const values = filler();
    values.splice(0, 8, ...Array<BathalaSymbolId>(8).fill('L1'));
    const state = board(values);
    const wins = evaluateCountWins(state, fixture());
    removePositions(
      state,
      wins.flatMap((win) => win.positions),
    );
    expect(state.flat().filter((entry) => entry?.symbol === 'L1')).toHaveLength(0);
  });

  it('Bathala removes the configured low type without paying and skips when none are eligible', () => {
    const config = fixture({ bathala: { ...fixture().bathala, eligibleSymbols: ['L3'] } });
    const values = filler();
    const state = board(values);
    const result = applyBathalaSkill(state, config, new FloatSequence([0]));
    expect(result).toMatchObject({ occurred: true, targetSymbol: 'L3' });
    expect(state.flat().some((entry) => entry?.symbol === 'L3')).toBe(false);
    const highs = board(filler(['H1', 'H2', 'H3', 'H4', 'SCATTER', 'MULTIPLIER']));
    expect(applyBathalaSkill(highs, config, new FloatSequence())).toEqual({
      occurred: false,
      removedPositions: [],
    });
  });

  it('collapses downward and refills every empty cell from weighted generation', () => {
    const state = board(filler());
    state[0]![1] = null;
    state[0]![3] = null;
    const collapsed = collapseBoard(state);
    expect(collapsed[0]!.slice(0, 2)).toEqual([null, null]);
    const refilled = refillBoard(
      collapsed,
      fixture({ baseSymbolWeights: [{ symbol: 'H4', weight: 1 }] }),
      'base',
      new FloatSequence(),
      { nextId: 1 },
    );
    expect(refilled[0]!.slice(0, 2).every((entry) => entry?.symbol === 'H4')).toBe(true);
    expect(occupiedCellCount(refilled)).toBe(30);
  });

  it('continues a tumble chain and never recollects a persistent Free Game multiplier', () => {
    const initial = board([
      ...Array<BathalaSymbolId>(8).fill('L1'),
      ['MULTIPLIER', 10],
      ...Array<BathalaSymbolId>(7).fill('L2'),
      ...Array<BathalaSymbolId>(7).fill('L3'),
      ...Array<BathalaSymbolId>(7).fill('L4'),
    ]);
    const weights = regular.map((symbol) => ({ symbol, weight: 1 }));
    const h1 = 5.5 / 9;
    const safe = [6.5 / 9, 7.5 / 9, 8.5 / 9, 4.5 / 9];
    const rng = new FloatSequence([
      ...Array<number>(8).fill(h1),
      ...Array.from({ length: 8 }, (_, index) => safe[index % safe.length]!),
    ]);
    const result = resolveTumbleChain(
      fixture({
        bathala: { ...fixture().bathala, enabled: false },
        freegameSymbolWeights: weights,
      }),
      rng,
      'freegame',
      { initialBoard: initial },
    );
    expect(result.rounds).toHaveLength(2);
    expect(result.rounds.map((round) => round.newlyCollectedMultiplierSum)).toEqual([10, 0]);
    expect(result.accumulatedMultiplierAfter).toBe(10);
  });

  it('adds Base Game multipliers and uses one when none exist', () => {
    const values: (BathalaSymbolId | [BathalaSymbolId, number])[] = [
      ...Array<BathalaSymbolId>(8).fill('L1'),
      ['MULTIPLIER', 3],
      ['MULTIPLIER', 5],
      ['MULTIPLIER', 10],
      ...filler().slice(0, 19),
    ];
    const result = resolveTumbleChain(
      fixture({ bathala: { ...fixture().bathala, enabled: false } }),
      new FloatSequence(),
      'base',
      { initialBoard: board(values) },
    );
    expect(result.rounds[0]).toMatchObject({
      visibleMultiplierSum: 18,
      effectiveMultiplier: 18,
      creditedWin: 18,
    });
    const noMultiplier = board([...Array<BathalaSymbolId>(8).fill('L1'), ...filler().slice(0, 22)]);
    expect(
      resolveTumbleChain(
        fixture({ bathala: { ...fixture().bathala, enabled: false } }),
        new FloatSequence(),
        'base',
        { initialBoard: noMultiplier },
      ).rounds[0]?.effectiveMultiplier,
    ).toBe(1);
  });

  it('resolves Scatter pays, base triggers, and Free Game retriggers independently', () => {
    const config = fixture();
    expect([4, 5, 6].map((count) => resolveScatterPayout(config, count))).toEqual([3, 5, 100]);
    expect(resolveBaseFreeGameAward(config, 4)).toBe(15);
    expect(resolveFreeGameRetrigger(config, 3)).toBe(5);
  });

  it('consumes one Free Game per initial board and adds retriggers without a cap', () => {
    const weights = [...regular, 'SCATTER' as const].map((symbol) => ({ symbol, weight: 1 }));
    const first = [
      9.5 / 10,
      9.5 / 10,
      9.5 / 10,
      ...Array.from({ length: 27 }, (_, i) => ((i % 9) + 0.5) / 10),
    ];
    const remaining = Array.from({ length: 5 * 30 }, (_, i) => ((i % 9) + 0.5) / 10);
    const result = resolveFreeGameFeature(
      fixture({
        freegameSymbolWeights: weights,
        bathala: { ...fixture().bathala, enabled: false },
      }),
      new FloatSequence([...first, ...remaining]),
      1,
    );
    expect(result.totalSpinsPlayed).toBe(6);
    expect(result.retriggerCount).toBe(1);
    expect(result.spins[0]?.retriggeredSpins).toBe(5);
  });

  it('persists and increases the Free Game multiplier, while independent chains reset it', () => {
    const first = board([
      ...Array<BathalaSymbolId>(8).fill('L1'),
      ['MULTIPLIER', 3],
      ['MULTIPLIER', 5],
      ...filler().slice(0, 20),
    ]);
    const config = fixture({ bathala: { ...fixture().bathala, enabled: false } });
    const one = resolveTumbleChain(config, new FloatSequence(), 'freegame', {
      initialBoard: first,
    });
    expect(one.accumulatedMultiplierAfter).toBe(8);
    const second = board([
      ...Array<BathalaSymbolId>(8).fill('L1'),
      ['MULTIPLIER', 10],
      ...filler().slice(0, 21),
    ]);
    const two = resolveTumbleChain(config, new FloatSequence(), 'freegame', {
      initialBoard: second,
      accumulatedMultiplier: one.accumulatedMultiplierAfter,
    });
    expect(two.accumulatedMultiplierAfter).toBe(18);
    expect(
      resolveTumbleChain(config, new FloatSequence(), 'freegame', {
        initialBoard: board([...Array<BathalaSymbolId>(8).fill('L1'), ...filler().slice(0, 22)]),
      }).rounds[0]?.effectiveMultiplier,
    ).toBe(1);
  });

  it('is deterministic and preserves core invariants', () => {
    const config = fixture();
    expect(validateConfig(config)).toEqual([]);
    expect(resolveSpin(config, new SeededRandom(947233), true)).toEqual(
      resolveSpin(config, new SeededRandom(947233), true),
    );
    const rng = new SeededRandom(2026);
    for (let index = 0; index < 100; index += 1) {
      const result = resolveSpin(config, rng);
      expect(occupiedCellCount(result.finalBoard)).toBe(30);
      expect(result.totalWin).toBeGreaterThanOrEqual(0);
      expect(componentTotal(result.components)).toBeCloseTo(result.totalWin, 10);
      result.feature?.spins.reduce((previous, spin) => {
        expect(spin.accumulatedMultiplierAfter).toBeGreaterThanOrEqual(previous);
        return spin.accumulatedMultiplierAfter;
      }, 0);
    }
  });
});
