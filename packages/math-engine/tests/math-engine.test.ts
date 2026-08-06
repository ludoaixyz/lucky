import { describe, expect, it } from 'vitest';
import type { RuntimeGameConfig, SpinResult } from '@lucky/shared-types';
import type { RandomSource } from '../src/index.js';
import {
  assertFiniteReport,
  buildVisibleWindow,
  countScatters,
  enforceMaximumWin,
  enumerateExact,
  evaluatePaylines,
  resolveBonusAward,
  resolveFreeSpin,
  resolveFreeSpinFeature,
  resolveRetriggerAward,
  resolveSpin,
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

describe('scatter and line evaluation', () => {
  it('evaluates a manually verifiable payout', () => {
    const config = fixtureConfig();
    expect(evaluatePaylines([['A'], ['A'], ['A']], config.paylines, config.paytable, 'W')).toEqual([
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
    expect(evaluatePaylines([['A'], ['S'], ['A']], config.paylines, config.paytable, 'W')).toEqual(
      [],
    );
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

describe('free-spin execution', () => {
  it('applies the multiplier exactly once and records every free spin', () => {
    const config: RuntimeGameConfig = {
      ...fixtureConfig(),
      reelStrips: [['A'], ['A'], ['A']],
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
      baseWinCredits: 0,
      featureWinCredits: 20,
      uncappedTotalWinCredits: 20,
      totalWinCredits: 15,
      maximumWinApplied: true,
    });
  });
  it('enforces standalone maxima deterministically', () => {
    expect(enforceMaximumWin(75, 50)).toEqual({ winCredits: 50, capped: true });
    expect(enforceMaximumWin(50, 50)).toEqual({ winCredits: 50, capped: false });
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
});

function result(totalWinCredits: number, featureTriggered = false): SpinResult {
  return {
    stops: [0, 0, 0],
    window: [['A'], ['A'], ['A']],
    lineWins: [],
    scatterCount: featureTriggered ? 3 : 0,
    baseLineWinCredits: featureTriggered ? 0 : totalWinCredits,
    baseScatterWinCredits: 0,
    baseWinCredits: featureTriggered ? 0 : totalWinCredits,
    featureWinCredits: featureTriggered ? totalWinCredits : 0,
    uncappedTotalWinCredits: totalWinCredits,
    totalWinCredits,
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
    expect(report.baseLineRtp).toBeCloseTo(5 / 9, 12);
    expect(report.featureRtp).toBe(0);
    expect(report.totalRtp).toBeCloseTo(report.baseLineRtp + report.featureRtp, 12);
    expect(report.triggerFrequency).toBe(0);
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
      basePayoutCredits: 2,
      featurePayoutCredits: 4,
      totalPayoutCredits: 6,
    });
    expect(report.basePayoutCredits + report.featurePayoutCredits).toBe(report.totalPayoutCredits);
    expect(report.payoutDistribution.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(3);
  });
  it('rejects non-finite or negative report rates and orders confidence bounds', () => {
    const accumulator = new SimulationAccumulator({ spins: 1, seed: 1, betCredits: 1 });
    accumulator.record(result(0));
    const report = accumulator.report(fixtureConfig());
    expect(report.confidenceInterval95[0]).toBeLessThanOrEqual(report.confidenceInterval95[1]);
    expect(() => assertFiniteReport({ ...report, totalRtp: Number.NaN })).toThrow();
    expect(() => assertFiniteReport({ ...report, variance: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => assertFiniteReport({ ...report, baseHitFrequency: -0.1 })).toThrow();
  });
});
