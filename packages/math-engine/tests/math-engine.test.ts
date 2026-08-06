import { describe, expect, it } from 'vitest';
import type { RuntimeGameConfig, SpinResult } from '@lucky/shared-types';
import {
  assertFiniteReport,
  buildVisibleWindow,
  countScatters,
  enforceMaximumWin,
  evaluatePaylines,
  SeededRandom,
  SimulationAccumulator,
  validateConfig,
} from '../src/index.js';
import { fixtureConfig } from './fixtures.js';

describe('deterministic random source', () => {
  it('repeats a sequence for the same seed', () => {
    const first = new SeededRandom(42);
    const second = new SeededRandom(42);
    expect(Array.from({ length: 8 }, () => first.nextUint32())).toEqual(
      Array.from({ length: 8 }, () => second.nextUint32()),
    );
  });
  it('ordinarily differs for different seeds', () => {
    expect(new SeededRandom(1).nextUint32()).not.toBe(new SeededRandom(2).nextUint32());
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

describe('evaluation', () => {
  it('evaluates a manually verifiable payout', () => {
    const config = fixtureConfig();
    expect(evaluatePaylines([['A'], ['A'], ['A']], config.paylines, config.paytable, 'W')).toEqual([
      { paylineId: 'L1', symbolId: 'A', count: 3, awardCredits: 10 },
    ]);
  });
  it('counts scatter symbols anywhere in the window', () => {
    expect(
      countScatters(
        [
          ['S', 'A'],
          ['B', 'S'],
          ['S', 'S'],
        ],
        'S',
      ),
    ).toBe(4);
  });
  it('builds only valid cyclic reel positions', () => {
    expect(buildVisibleWindow([['A', 'B']], [1], 3)).toEqual([['B', 'A', 'B']]);
  });
  it('enforces the maximum deterministically', () => {
    expect(enforceMaximumWin(75, 50)).toEqual({ winCredits: 50, capped: true });
    expect(enforceMaximumWin(50, 50)).toEqual({ winCredits: 50, capped: false });
  });
});

describe('validation', () => {
  const changed = (change: (config: RuntimeGameConfig) => RuntimeGameConfig): RuntimeGameConfig =>
    change(fixtureConfig());
  it('rejects invalid symbol references', () => {
    expect(
      validateConfig(
        changed((config) => ({
          ...config,
          reelStrips: [['UNKNOWN'], ...config.reelStrips.slice(1)],
        })),
      ),
    ).toContainEqual(expect.objectContaining({ field: 'symbolId', value: 'UNKNOWN' }));
  });
  it('rejects invalid reel counts and empty strips', () => {
    expect(
      validateConfig(
        changed((config) => ({
          ...config,
          reelStrips: [[], config.reelStrips[1] ?? [], config.reelStrips[2] ?? [], ['A']],
        })),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'reelStrips' }),
        expect.objectContaining({ field: 'symbols' }),
      ]),
    );
  });
  it('rejects negative awards', () => {
    expect(
      validateConfig(
        changed((config) => ({
          ...config,
          paytable: [{ symbolId: 'A', count: 3, awardCredits: -1 }],
        })),
      ),
    ).toContainEqual(expect.objectContaining({ field: 'awardCredits', value: -1 }));
  });
});

describe('simulation accounting', () => {
  const result = (winCredits: number, featureTriggered = false): SpinResult => ({
    stops: [0, 0, 0],
    window: [['A'], ['A'], ['A']],
    lineWins: [],
    scatterCount: 0,
    featureTriggered,
    rawWinCredits: winCredits,
    winCredits,
    capped: false,
  });
  it('reconciles totals and event counts', () => {
    const accumulator = new SimulationAccumulator({ spins: 3, seed: 1, betCredits: 2 });
    accumulator.record(result(0));
    accumulator.record(result(4, true));
    accumulator.record(result(2));
    const report = accumulator.report(fixtureConfig());
    expect(report).toMatchObject({
      spinCount: 3,
      totalWagerCredits: 6,
      totalPayoutCredits: 6,
      winningSpinCount: 2,
      featureTriggerCount: 1,
    });
    expect(report.payoutDistribution.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(3);
  });
  it('rejects NaN, Infinity, and negative rate output', () => {
    const accumulator = new SimulationAccumulator({ spins: 1, seed: 1, betCredits: 1 });
    accumulator.record(result(0));
    const report = accumulator.report(fixtureConfig());
    expect(() => assertFiniteReport({ ...report, rtp: Number.NaN })).toThrow();
    expect(() => assertFiniteReport({ ...report, variance: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => assertFiniteReport({ ...report, hitFrequency: -0.1 })).toThrow();
  });
});
