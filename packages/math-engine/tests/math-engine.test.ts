import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIMULATION_CHECKPOINTS,
  type RuntimeGameConfig,
  type SpinResult,
} from '@lucky/shared-types';
import type { RandomSource } from '../src/index.js';
import {
  assertFiniteReport,
  buildVisibleWindow,
  collapseAndRefill,
  countScatters,
  enforceMaximumWin,
  enumerateExact,
  evaluatePaylines,
  extractWinningCoordinates,
  maximumReachableScatterCount,
  resolveBonusAward,
  resolveCascadeSequence,
  resolveFreeSpin,
  resolveFreeSpinFeature,
  resolveRetriggerAward,
  resolveSpin,
  runSimulationCheckpoints,
  SeededRandom,
  SimulationAccumulator,
  validateConfig,
} from '../src/index.js';
import { fixtureConfig } from './fixtures.js';

class SequenceRandom implements RandomSource {
  private index = 0;
  constructor(private readonly values: readonly number[]) {}
  nextUint32(): number {
    const value = this.values[this.index] ?? 0;
    this.index += 1;
    return value >>> 0;
  }
  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }
  nextInt(exclusiveMaximum: number): number {
    return this.nextUint32() % exclusiveMaximum;
  }
}

describe('cumulative simulation checkpoints', () => {
  it('uses the exact canonical seven default checkpoints', () => {
    expect(DEFAULT_SIMULATION_CHECKPOINTS).toEqual([
      100, 1_000, 10_000, 100_000, 250_000, 500_000, 1_000_000,
    ]);
  });

  it('returns ordered immutable cumulative snapshots and a matching final report', () => {
    const config = fixtureConfig();
    const series = runSimulationCheckpoints(
      config,
      { seed: 77, betCredits: config.totalBetCredits, checkpoints: [2, 5, 10] },
      new SeededRandom(77),
      0.95,
    );
    expect(series.checkpoints.map((checkpoint) => checkpoint.bets)).toEqual([2, 5, 10]);
    expect(series.checkpoints.map((checkpoint) => checkpoint.totalWageredCredits)).toEqual([
      2, 5, 10,
    ]);
    expect(series.checkpoints.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(series.checkpoints)).toBe(true);
    expect(series.checkpoints.at(-1)?.simulatedRtp).toBe(series.finalReport.creditedTotalRtp);
    expect(series.checkpoints.at(-1)?.totalReturnedCredits).toBe(
      series.finalReport.creditedTotalPayoutCredits,
    );
    expect(series.checkpoints.every((checkpoint) => checkpoint.theoreticalRtp === 0.95)).toBe(true);
  });

  it('is reproducible from the same seed and leaves earlier snapshots unchanged', () => {
    const config = fixtureConfig();
    const run = () =>
      runSimulationCheckpoints(
        config,
        { seed: 19, betCredits: config.totalBetCredits, checkpoints: [1, 4, 12] },
        new SeededRandom(19),
        0.95,
      );
    const first = run();
    const firstSnapshot = JSON.stringify(first.checkpoints[0]);
    expect(run().checkpoints).toEqual(first.checkpoints);
    expect(JSON.stringify(first.checkpoints[0])).toBe(firstSnapshot);
  });
});

describe('deterministic random source', () => {
  it('repeats complete feature results for the same seed', () => {
    expect(resolveSpin(fixtureConfig(), new SeededRandom(42))).toEqual(
      resolveSpin(fixtureConfig(), new SeededRandom(42)),
    );
  });
  it('ordinarily differs for different seeds', () => {
    expect(resolveSpin(fixtureConfig(), new SeededRandom(1))).not.toEqual(
      resolveSpin(fixtureConfig(), new SeededRandom(2)),
    );
  });
  it('keeps selected values within bounds', () => {
    const rng = new SeededRandom(7);
    for (let index = 0; index < 500; index += 1) {
      const value = rng.nextInt(12);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(12);
    }
  });
});

describe('cascading tiles', () => {
  const enabled = (overrides: Partial<RuntimeGameConfig> = {}): RuntimeGameConfig => ({
    ...fixtureConfig(),
    reelStrips: [
      ['A', 'B'],
      ['A', 'B'],
      ['A', 'B'],
    ],
    freeSpinReelStrips: [
      ['A', 'B'],
      ['A', 'B'],
      ['A', 'B'],
    ],
    cascades: { enabled: true, scatterEvaluation: 'initial-grid-only' },
    bonus: { ...fixtureConfig().bonus, enabled: false },
    ...overrides,
  });

  it('leaves the legacy seeded result byte-for-byte unchanged when disabled or omitted', () => {
    const legacy = fixtureConfig();
    expect(resolveSpin({ ...legacy, cascades: { enabled: false } }, new SeededRandom(42))).toEqual(
      resolveSpin(legacy, new SeededRandom(42)),
    );
  });

  it('resolves one additional board inside one paid spin and aggregates its payout once', () => {
    const result = resolveSpin(enabled(), new SequenceRandom([0, 0, 0, 1, 0, 1]));
    expect(result).toMatchObject({
      cascadeCount: 1,
      uncappedBaseLineWinCredits: 10,
      uncappedTotalWinCredits: 10,
    });
    expect(result.cascades).toHaveLength(2);
    expect(result.cascades?.map((stage) => stage.payoutCredits)).toEqual([10, 0]);
  });

  it('resolves multiple wins without double counting evaluated stages', () => {
    const result = resolveSpin(enabled(), new SequenceRandom([0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1]));
    expect(result.cascadeCount).toBe(3);
    expect(result.cascades?.map((stage) => stage.payoutCredits)).toEqual([10, 5, 10, 0]);
    expect(result.uncappedBaseLineWinCredits).toBe(25);
    expect(result.cascadePayoutCredits).toBe(15);
  });

  it('collapses downward, preserves survivor order, and refills only removed cells', () => {
    expect(
      collapseAndRefill(
        [['A', 'B', 'A', 'B', 'A']],
        [
          { reel: 0, row: 2 },
          { reel: 0, row: 4 },
        ],
        [['A', 'B']],
        new SequenceRandom([1, 0]),
      ),
    ).toEqual([['B', 'A', 'A', 'B', 'B']]);
  });

  it('deduplicates overlapping paylines and includes participating Wild positions', () => {
    const config: RuntimeGameConfig = {
      ...fixtureConfig(),
      visibleRows: 2,
      paylines: [
        { id: 'L1', rows: [0, 0, 0] },
        { id: 'L2', rows: [0, 0, 1] },
      ],
      rules: {
        ...fixtureConfig().rules,
        lineAwardRules: { ...fixtureConfig().rules.lineAwardRules, activePaylines: 2 },
      },
    };
    const window = [
      ['W', 'B'],
      ['A', 'B'],
      ['A', 'A'],
    ];
    const wins = evaluatePaylines(window, config);
    expect(wins).toHaveLength(2);
    expect(extractWinningCoordinates(wins, config)).toEqual([
      { reel: 0, row: 0 },
      { reel: 1, row: 0 },
      { reel: 2, row: 0 },
      { reel: 2, row: 1 },
    ]);
  });

  it('evaluates feature scatters only on the initial grid', () => {
    const config = enabled({
      visibleRows: 2,
      reelStrips: [
        ['A', 'S', 'B'],
        ['A', 'S', 'B'],
        ['A', 'B', 'S'],
      ],
      bonus: fixtureConfig().bonus,
    });
    const result = resolveSpin(config, new SequenceRandom([0, 0, 0, 2, 2, 2]));
    expect(result.scatterCount).toBe(2);
    expect(result.cascades?.[1]?.window.flat().filter((symbol) => symbol === 'S')).toHaveLength(3);
    expect(result.featureTriggered).toBe(false);
  });

  it('still triggers a feature from three Scatters on the initial grid', () => {
    const config = enabled({
      reelStrips: [['S'], ['S'], ['S']],
      freeSpinReelStrips: [['S'], ['S'], ['S']],
      bonus: {
        ...fixtureConfig().bonus,
        retriggerEnabled: false,
        retriggerAwards: [],
      },
    });
    const result = resolveSpin(config, new SequenceRandom([]));
    expect(result).toMatchObject({ scatterCount: 3, featureTriggered: true });
    expect(result.feature?.totalPlayedSpins).toBe(2);
  });

  it('allows five cascades in one free spin without consuming more free spins', () => {
    const config = enabled({
      bonus: {
        ...fixtureConfig().bonus,
        retriggerEnabled: false,
        retriggerAwards: [],
        maximumFeatureSpins: 1,
      },
    });
    const feature = resolveFreeSpinFeature(
      config,
      new SequenceRandom([0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1]),
      1,
    );
    expect(feature.totalPlayedSpins).toBe(1);
    expect(feature.freeSpins[0]?.cascadeCount).toBe(5);
  });

  it('applies the free-spin multiplier to cascade contribution reporting', () => {
    const config = enabled({
      maximumWinCredits: 100,
      bonus: {
        ...fixtureConfig().bonus,
        enabled: false,
        freeSpinMultiplier: 2,
        retriggerEnabled: false,
        retriggerAwards: [],
      },
    });
    const freeSpin = resolveFreeSpin(config, new SequenceRandom([0, 0, 0, 1, 1, 1, 1, 0, 1]), 1);
    expect(freeSpin).toMatchObject({
      rawWinCredits: 15,
      winCredits: 30,
      cascadePayoutCredits: 5,
    });
    const template = result(30, true);
    const paidResult: SpinResult = {
      ...template,
      feature: {
        ...(template.feature as NonNullable<SpinResult['feature']>),
        totalPlayedSpins: 1,
        totalWinCredits: 30,
        freeSpins: [freeSpin],
      },
    };
    const accumulator = new SimulationAccumulator({ spins: 1, seed: 1, betCredits: 1 });
    accumulator.record(paidResult);
    expect(accumulator.report(config).freeSpinCascadePayoutCredits).toBe(10);
  });

  it('applies the maximum-win cap once after aggregating cascade payouts', () => {
    const config = enabled({
      maximumWinCredits: 5_000,
      paytable: [
        { symbolId: 'A', count: 3, awardCredits: 3_000 },
        { symbolId: 'B', count: 3, awardCredits: 3_000 },
      ],
    });
    expect(resolveSpin(config, new SequenceRandom([0, 0, 0, 1, 1, 1, 1, 0, 1]))).toMatchObject({
      uncappedBaseWinCredits: 6_000,
      uncappedTotalWinCredits: 6_000,
      totalWinCredits: 5_000,
      capReductionCredits: 1_000,
      maximumWinApplied: true,
    });
  });

  it('reconciles base and multiplied free-spin cascade metrics and maximum depth', () => {
    const config = enabled({
      maximumWinCredits: 100,
      bonus: {
        ...fixtureConfig().bonus,
        enabled: false,
        freeSpinMultiplier: 2,
        retriggerEnabled: false,
        retriggerAwards: [],
      },
    });
    const base = resolveSpin(config, new SequenceRandom([0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1]));
    const freeSpin = resolveFreeSpin(config, new SequenceRandom([0, 0, 0, 1, 1, 1, 1, 0, 1]), 1);
    const combined: SpinResult = {
      ...base,
      uncappedFeatureWinCredits: freeSpin.winCredits,
      uncappedTotalWinCredits: base.uncappedBaseWinCredits + freeSpin.winCredits,
      totalWinCredits: base.uncappedBaseWinCredits + freeSpin.winCredits,
      featureTriggered: true,
      feature: {
        triggered: true,
        initialAwardedSpins: 1,
        totalPlayedSpins: 1,
        totalRetriggeredSpins: 0,
        retriggerCount: 0,
        totalWinCredits: freeSpin.winCredits,
        freeSpins: [freeSpin],
        limitReached: false,
      },
    };
    const accumulator = new SimulationAccumulator({ spins: 1, seed: 1, betCredits: 1 });
    accumulator.record(combined);
    expect(accumulator.report(config)).toMatchObject({
      baseGameCascadeSteps: 3,
      freeSpinCascadeSteps: 2,
      totalCascadeSteps: 5,
      baseGameCascadePayoutCredits: 15,
      freeSpinCascadePayoutCredits: 10,
      cascadePayoutCredits: 25,
      baseGameSpinsWithCascade: 1,
      freeSpinSpinsWithCascade: 1,
      spinsWithCascade: 2,
      maxCascadeDepthObserved: 3,
      paidSpins: 1,
      totalWageredCredits: 1,
    });
  });

  it('is seeded-reproducible and never adds wagers for cascade evaluations', () => {
    const config = enabled();
    expect(resolveSpin(config, new SeededRandom(7))).toEqual(
      resolveSpin(config, new SeededRandom(7)),
    );
    const accumulator = new SimulationAccumulator({ spins: 1, seed: 1, betCredits: 1 });
    accumulator.record(resolveSpin(config, new SequenceRandom([0, 0, 0, 1, 0, 1])));
    const report = accumulator.report(config);
    expect(report).toMatchObject({
      paidSpins: 1,
      totalWageredCredits: 1,
      totalCascadeSteps: 1,
      spinsWithCascade: 1,
    });
  });

  it('throws explicitly at the configured runaway guard', () => {
    const config = enabled({
      reelStrips: [['A'], ['A'], ['A']],
      cascades: { enabled: true, maximumCascadesPerSpin: 1 },
    });
    expect(() =>
      resolveCascadeSequence(
        [['A'], ['A'], ['A']],
        config.reelStrips,
        config,
        new SequenceRandom([]),
      ),
    ).toThrow('Cascade safety limit reached');
  });
});

describe('scatter and line evaluation', () => {
  it('evaluates a manually verifiable payout', () => {
    const config = fixtureConfig();
    expect(evaluatePaylines([['A'], ['A'], ['A']], config)).toEqual([
      { paylineId: 'L1', symbolId: 'A', count: 3, awardCredits: 10 },
    ]);
  });
  it('counts scatter anywhere, without counting Wild', () => {
    expect(
      countScatters(
        [
          ['S', 'A'],
          ['B', 'S'],
          ['S', 'W'],
        ],
        'S',
      ),
    ).toBe(3);
  });
  it('does not let Scatter substitute on paylines', () => {
    const config = fixtureConfig();
    expect(evaluatePaylines([['A'], ['S'], ['A']], config)).toEqual([]);
  });
  it('maps zero through five Scatters to the configured awards', () => {
    const bonus = {
      ...fixtureConfig().bonus,
      awards: [
        { count: 3, freeSpins: 8 },
        { count: 4, freeSpins: 10 },
        { count: 5, freeSpins: 12 },
      ],
      retriggerAwards: [
        { count: 3, freeSpins: 5 },
        { count: 4, freeSpins: 8 },
        { count: 5, freeSpins: 10 },
      ],
    };
    expect([0, 1, 2].map((count) => resolveBonusAward(bonus, count))).toEqual([0, 0, 0]);
    expect([3, 4, 5].map((count) => resolveBonusAward(bonus, count))).toEqual([8, 10, 12]);
    expect([3, 4, 5].map((count) => resolveRetriggerAward(bonus, count))).toEqual([5, 8, 10]);
  });
  it('builds only valid cyclic reel positions', () => {
    expect(buildVisibleWindow([['A', 'B']], [1], 3)).toEqual([['B', 'A', 'B']]);
  });
});

describe('explicit Wild and line-award contracts', () => {
  const fiveReelConfig = (): RuntimeGameConfig => ({
    ...fixtureConfig(),
    reelCount: 5,
    reelStrips: [['A'], ['A'], ['A'], ['A'], ['A']],
    freeSpinReelStrips: [['A'], ['A'], ['A'], ['A'], ['A']],
    paylines: [{ id: 'L1', rows: [0, 0, 0, 0, 0] }],
    paytable: [
      { symbolId: 'A', count: 3, awardCredits: 3 },
      { symbolId: 'A', count: 4, awardCredits: 7 },
      { symbolId: 'A', count: 5, awardCredits: 12 },
      { symbolId: 'B', count: 3, awardCredits: 2 },
    ],
  });
  const award = (symbols: readonly string[]): number =>
    evaluatePaylines(
      symbols.map((symbol) => [symbol]),
      fiveReelConfig(),
    ).reduce((total, win) => total + win.awardCredits, 0);

  it('substitutes only for configured regular symbols and selects one highest award', () => {
    expect(award(['W', 'W', 'A', 'A', 'A'])).toBe(12);
    expect(award(['W', 'A', 'A', 'A', 'B'])).toBe(7);
    expect(award(['A', 'W', 'A', 'A', 'A'])).toBe(12);
  });
  it('never substitutes for Scatter and Scatter breaks a line', () => {
    expect(award(['W', 'S', 'A', 'A', 'A'])).toBe(0);
    expect(award(['S', 'A', 'A', 'A', 'A'])).toBe(0);
  });
  it('applies the configured all-Wild no-pay rule', () => {
    expect(award(['W', 'W', 'W', 'W', 'W'])).toBe(0);
  });
});

describe('free-spin execution', () => {
  it('applies the multiplier exactly once and records every free spin', () => {
    const config: RuntimeGameConfig = {
      ...fixtureConfig(),
      reelStrips: [['A'], ['A'], ['A']],
      freeSpinReelStrips: [['A'], ['A'], ['A']],
      bonus: {
        ...fixtureConfig().bonus,
        freeSpinMultiplier: 2,
        retriggerEnabled: false,
        retriggerAwards: [],
      },
    };
    const single = resolveFreeSpin(config, new SequenceRandom([0, 0, 0]), 1);
    expect(single).toMatchObject({ rawWinCredits: 10, multiplier: 2, winCredits: 20 });
    const feature = resolveFreeSpinFeature(config, new SequenceRandom([]), 2);
    expect(feature.totalPlayedSpins).toBe(2);
    expect(feature.freeSpins).toHaveLength(2);
    expect(feature.totalWinCredits).toBe(40);
  });
  it('adds retriggers and enforces both retrigger and spin limits without recursion', () => {
    const config: RuntimeGameConfig = {
      ...fixtureConfig(),
      reelStrips: [['S'], ['S'], ['S']],
      freeSpinReelStrips: [['S'], ['S'], ['S']],
      bonus: {
        ...fixtureConfig().bonus,
        maximumFeatureSpins: 4,
        maximumRetriggers: 20,
      },
    };
    const feature = resolveFreeSpinFeature(config, new SequenceRandom([]), 2);
    expect(feature).toMatchObject({
      initialAwardedSpins: 2,
      totalPlayedSpins: 4,
      totalRetriggeredSpins: 2,
      retriggerCount: 2,
      limitReached: true,
    });
  });
  it('caps base plus feature once at the paid-spin boundary', () => {
    const config: RuntimeGameConfig = { ...fixtureConfig(), maximumWinCredits: 15 };
    const result = resolveSpin(config, new SequenceRandom([2, 2, 2, 0, 0, 0, 0, 0, 0]));
    expect(result.feature?.totalPlayedSpins).toBe(2);
    expect(result).toMatchObject({
      uncappedBaseWinCredits: 0,
      uncappedFeatureWinCredits: 20,
      uncappedTotalWinCredits: 20,
      totalWinCredits: 15,
      maximumWinApplied: true,
      capReductionCredits: 5,
    });
  });
  it('reconciles no-cap, base-only, and combined cap cases', () => {
    const baseOnly: RuntimeGameConfig = {
      ...fixtureConfig(),
      maximumWinCredits: 5,
      reelStrips: [['A'], ['A'], ['A']],
      freeSpinReelStrips: [['A'], ['A'], ['A']],
      bonus: { ...fixtureConfig().bonus, enabled: false },
    };
    expect(resolveSpin(baseOnly, new SequenceRandom([]))).toMatchObject({
      uncappedBaseWinCredits: 10,
      uncappedFeatureWinCredits: 0,
      uncappedTotalWinCredits: 10,
      totalWinCredits: 5,
      capReductionCredits: 5,
    });

    const combined: RuntimeGameConfig = {
      ...fixtureConfig(),
      visibleRows: 2,
      maximumWinCredits: 15,
      reelStrips: [
        ['A', 'S'],
        ['A', 'S'],
        ['A', 'S'],
      ],
      freeSpinReelStrips: [['A'], ['A'], ['A']],
    };
    expect(resolveSpin(combined, new SequenceRandom([]))).toMatchObject({
      uncappedBaseWinCredits: 10,
      uncappedFeatureWinCredits: 20,
      uncappedTotalWinCredits: 30,
      totalWinCredits: 15,
      capReductionCredits: 15,
      maximumWinApplied: true,
    });
  });
  it('enforces standalone maxima deterministically', () => {
    expect(enforceMaximumWin(75, 50)).toEqual({
      winCredits: 50,
      capReductionCredits: 25,
      capped: true,
    });
    expect(enforceMaximumWin(50, 50)).toEqual({
      winCredits: 50,
      capReductionCredits: 0,
      capped: false,
    });
  });
});

describe('validation', () => {
  const changed = (change: (config: RuntimeGameConfig) => RuntimeGameConfig): RuntimeGameConfig =>
    change(fixtureConfig());
  it('rejects invalid symbols, awards, and trigger symbols', () => {
    const config = changed((value) => ({
      ...value,
      reelStrips: [['UNKNOWN'], ...value.reelStrips.slice(1)],
      paytable: [{ symbolId: 'A', count: 3, awardCredits: -1 }],
      bonus: { ...value.bonus, triggerSymbolId: 'UNKNOWN' },
    }));
    const issues = validateConfig(config);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'symbolId', value: 'UNKNOWN' }),
        expect.objectContaining({ field: 'awardCredits', value: -1 }),
        expect.objectContaining({ field: 'triggerSymbolId', value: 'UNKNOWN' }),
      ]),
    );
  });
  it('rejects duplicate, non-increasing, impossible, and non-positive bonus awards', () => {
    const config = changed((value) => ({
      ...value,
      bonus: {
        ...value.bonus,
        awards: [
          { count: 3, freeSpins: 2 },
          { count: 3, freeSpins: 0 },
          { count: 4, freeSpins: 2 },
        ],
      },
    }));
    expect(validateConfig(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'count' }),
        expect.objectContaining({ field: 'freeSpins' }),
      ]),
    );
  });
  it('derives the practical Scatter maximum from cyclic visible windows', () => {
    const config = fixtureConfig();
    expect(
      maximumReachableScatterCount(
        config.reelStrips,
        config.visibleRows,
        config.rules.scatter.symbolId,
      ),
    ).toBe(3);
    expect(
      validateConfig({
        ...config,
        bonus: { ...config.bonus, awards: [{ count: 4, freeSpins: 2 }] },
      }),
    ).toContainEqual(expect.objectContaining({ field: 'count', value: 4 }));
  });
  it('rejects a total bet that does not reconcile to active lines and line bet', () => {
    const config = changed((value) => ({
      ...value,
      totalBetCredits: 2,
      rules: {
        ...value.rules,
        lineAwardRules: { ...value.rules.lineAwardRules, totalBetCredits: 2 },
      },
    }));
    expect(validateConfig(config)).toContainEqual(
      expect.objectContaining({
        record: 'lineAwardRules',
        field: 'totalBetCredits',
        rule: 'must equal activePaylines multiplied by lineBetCredits',
      }),
    );
  });
  it('rejects invalid cascade flags, scatter modes, and safety limits', () => {
    const config = {
      ...fixtureConfig(),
      cascades: {
        enabled: 'yes',
        scatterEvaluation: 'each-cascade',
        maximumCascadesPerSpin: 0,
      },
    } as unknown as RuntimeGameConfig;
    expect(validateConfig(config)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ record: 'cascades', field: 'enabled' }),
        expect.objectContaining({ record: 'cascades', field: 'scatterEvaluation' }),
        expect.objectContaining({ record: 'cascades', field: 'maximumCascadesPerSpin' }),
      ]),
    );
  });
  it('validates optional volatility classifications and probability envelopes', () => {
    const valid = {
      ...fixtureConfig(),
      volatilityTarget: {
        classification: 'medium-high' as const,
        provisional: true as const,
        standardDeviationMultiple: { minimum: 3, maximum: 5 },
        tailTargets: {
          '20xPlusProbability': { minimum: 0.001, maximum: 0.01 },
          '50xPlusProbability': { minimum: 0, maximum: 0.005 },
          '100xPlusProbability': { minimum: 0, maximum: 0.001 },
          '250xPlusProbability': { minimum: 0, maximum: 0.0001 },
        },
      },
    };
    expect(validateConfig(valid)).toEqual([]);
    const invalid = structuredClone(valid) as unknown as RuntimeGameConfig & {
      volatilityTarget: NonNullable<RuntimeGameConfig['volatilityTarget']>;
    };
    Object.assign(invalid.volatilityTarget, { classification: 'extreme' });
    Object.assign(invalid.volatilityTarget.tailTargets['20xPlusProbability'], {
      minimum: -0.1,
      maximum: 1.1,
    });
    Object.assign(invalid.volatilityTarget.tailTargets['50xPlusProbability'], {
      minimum: 0.2,
      maximum: 0.1,
    });
    expect(validateConfig(invalid)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'classification' }),
        expect.objectContaining({ field: '20xPlusProbability' }),
        expect.objectContaining({ field: '50xPlusProbability' }),
      ]),
    );
  });
});

function result(totalWinCredits: number, featureTriggered = false): SpinResult {
  return {
    stops: [0, 0, 0],
    window: [['A'], ['A'], ['A']],
    lineWins: [],
    scatterCount: featureTriggered ? 3 : 0,
    uncappedBaseLineWinCredits: featureTriggered ? 0 : totalWinCredits,
    uncappedBaseScatterWinCredits: 0,
    uncappedBaseWinCredits: featureTriggered ? 0 : totalWinCredits,
    uncappedFeatureWinCredits: featureTriggered ? totalWinCredits : 0,
    uncappedTotalWinCredits: totalWinCredits,
    totalWinCredits,
    capReductionCredits: 0,
    featureTriggered,
    feature: featureTriggered
      ? {
          triggered: true,
          initialAwardedSpins: 2,
          totalPlayedSpins: 2,
          totalRetriggeredSpins: 0,
          retriggerCount: 0,
          totalWinCredits,
          freeSpins: [],
          limitReached: false,
        }
      : null,
    maximumWinApplied: false,
  };
}

describe('feature-inclusive RTP and simulation accounting', () => {
  it('enumerates a manual disabled-feature fixture exactly', () => {
    const config: RuntimeGameConfig = {
      ...fixtureConfig(),
      bonus: { ...fixtureConfig().bonus, enabled: false },
    };
    const report = enumerateExact(config, 'fixture');
    expect(report.probabilityReconciliation).toBeCloseTo(1, 12);
    expect(report.uncappedBaseLineRtp).toBeCloseTo(5 / 9, 12);
    expect(report.uncappedFeatureRtp).toBe(0);
    expect(report.uncappedTotalRtp).toBeCloseTo(
      report.uncappedBaseLineRtp + report.uncappedFeatureRtp,
      12,
    );
    expect(report.triggerFrequency).toBe(0);
  });
  it('rejects cascade-enabled exact enumeration without affecting legacy exact mode', () => {
    expect(() =>
      enumerateExact({ ...fixtureConfig(), cascades: { enabled: true } }, 'fixture'),
    ).toThrow('Exact enumeration currently supports non-cascading profiles only');
    expect(() => enumerateExact(fixtureConfig(), 'fixture')).not.toThrow();
  });
  it('counts one paid wager per full feature and reconciles payout components', () => {
    const accumulator = new SimulationAccumulator({ spins: 3, seed: 1, betCredits: 2 });
    accumulator.record(result(0));
    accumulator.record(result(4, true));
    accumulator.record(result(2));
    const report = accumulator.report(fixtureConfig());
    expect(report).toMatchObject({
      paidSpins: 3,
      totalWageredCredits: 6,
      uncappedBasePayoutCredits: 2,
      uncappedFeaturePayoutCredits: 4,
      uncappedTotalPayoutCredits: 6,
      creditedTotalPayoutCredits: 6,
    });
    expect(report.uncappedBasePayoutCredits + report.uncappedFeaturePayoutCredits).toBe(
      report.uncappedTotalPayoutCredits,
    );
    expect(report.creditedTotalPayoutCredits).toBeLessThanOrEqual(
      report.uncappedTotalPayoutCredits,
    );
    expect(report.capReductionCredits).toBe(
      report.uncappedTotalPayoutCredits - report.creditedTotalPayoutCredits,
    );
    expect(report.methodology).toBe('deterministic-monte-carlo');
    expect(report.featureLengthPercentiles.p95).toBeGreaterThanOrEqual(0);
    expect(report.payoutDistribution.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(3);
  });
  it('counts cumulative tails on integer-credit boundaries and keeps paid spins as denominator', () => {
    const accumulator = new SimulationAccumulator({ spins: 4, seed: 1, betCredits: 1_000 });
    accumulator.record(result(19_999));
    accumulator.record(result(20_000));
    accumulator.record(result(50_000, true));
    accumulator.record(result(100_000));
    const report = accumulator.report(fixtureConfig());
    const tail = (threshold: number) =>
      report.tailMetrics.find((metric) => metric.thresholdMultiple === threshold);
    expect(tail(20)).toMatchObject({ count: 3, probability: 0.75 });
    expect(tail(50)).toMatchObject({ count: 2, probability: 0.5 });
    expect(tail(100)).toMatchObject({ count: 1, probability: 0.25 });
    expect(tail(250)).toMatchObject({ count: 0, probability: 0 });
    expect(report.featureTriggerFrequency).toBe(0.25);
    expect(report.paidSpinsPerFeatureTrigger).toBe(4);
  });
  it('rejects non-finite or negative report rates and orders confidence bounds', () => {
    const accumulator = new SimulationAccumulator({ spins: 1, seed: 1, betCredits: 1 });
    accumulator.record(result(0));
    const report = accumulator.report(fixtureConfig());
    expect(report.confidenceInterval95[0]).toBeLessThanOrEqual(report.confidenceInterval95[1]);
    expect(() => assertFiniteReport({ ...report, creditedTotalRtp: Number.NaN })).toThrow();
    expect(() => assertFiniteReport({ ...report, variance: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => assertFiniteReport({ ...report, baseHitFrequency: -0.1 })).toThrow();
  });
});
