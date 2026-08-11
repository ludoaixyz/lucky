import { describe, expect, it } from 'vitest';
import {
  CASCADE_PRESENTATION_PHASES,
  cascadePresentationTiming,
  CascadePresentationStateMachine,
  planCascadeMotion,
} from '../src/game/cascade-presentation.js';
import { SUPPORTED_LOCALES, TRANSLATIONS } from '../src/i18n/index.js';

describe('cascade presentation state machine', () => {
  const advanceStage = (state: CascadePresentationStateMachine): void => {
    for (const phase of CASCADE_PRESENTATION_PHASES.slice(1)) state.advance(phase);
  };

  it('runs a single cascade through every semantic phase', () => {
    const state = new CascadePresentationStateMachine();
    state.beginStage(1);
    expect(state.snapshot().phase).toBe('WIN_HOLD');
    for (const phase of CASCADE_PRESENTATION_PHASES.slice(1)) {
      state.advance(phase);
      expect(state.snapshot().phase).toBe(phase);
    }
    expect(state.creditResolvedStage({ index: 1, payoutCredits: 12 })).toBe(12);
    state.finish();
    expect(state.snapshot()).toEqual({
      active: false,
      phase: null,
      additionalBoardIndex: 0,
      cumulativeWinCredits: 0,
    });
  });

  it('progresses counters exactly once and never double-counts the initial board or a stage', () => {
    const state = new CascadePresentationStateMachine();
    state.beginStage(1);
    advanceStage(state);
    expect(state.creditResolvedStage({ index: 1, payoutCredits: 11 })).toBe(11);
    expect(state.creditResolvedStage({ index: 1, payoutCredits: 11 })).toBe(11);
    state.beginStage(2);
    advanceStage(state);
    expect(state.creditResolvedStage({ index: 2, payoutCredits: 17 })).toBe(28);
    state.beginStage(3);
    advanceStage(state);
    expect(state.creditResolvedStage({ index: 3, payoutCredits: 0 })).toBe(28);
    expect(state.snapshot()).toMatchObject({ additionalBoardIndex: 3, cumulativeWinCredits: 28 });
  });

  it('rejects duplicate/out-of-order stage advancement', () => {
    const state = new CascadePresentationStateMachine();
    state.beginStage(1);
    expect(() => state.beginStage(1)).toThrow('advance exactly once');
    expect(() => state.advance('REMOVE_WINNERS')).toThrow('expected CASCADE_CALLOUT');
  });

  it('cleans up a maximum-depth chain without retained counters or phase state', () => {
    const state = new CascadePresentationStateMachine();
    for (let index = 1; index <= 100; index += 1) {
      state.beginStage(index);
      advanceStage(state);
      state.creditResolvedStage({ index, payoutCredits: 1 });
    }
    expect(state.snapshot().cumulativeWinCredits).toBe(100);
    state.finish();
    expect(state.snapshot().active).toBe(false);
    expect(state.snapshot().cumulativeWinCredits).toBe(0);
  });

  it('leaves no-cascade presentation inactive', () => {
    expect(new CascadePresentationStateMachine().snapshot().active).toBe(false);
  });
});

describe('resolved cascade motion planning', () => {
  it('removes only authoritative coordinates, drops survivors, and refills exact symbols', () => {
    const plan = planCascadeMotion(
      [
        ['A', 'B', 'C'],
        ['D', 'E', 'F'],
      ],
      [
        ['X', 'A', 'C'],
        ['Y', 'Z', 'F'],
      ],
      [
        { reel: 0, row: 1 },
        { reel: 1, row: 0 },
        { reel: 1, row: 1 },
      ],
    );
    expect(plan.removedCoordinates).toEqual([
      { reel: 0, row: 1 },
      { reel: 1, row: 0 },
      { reel: 1, row: 1 },
    ]);
    expect(plan.survivorMoves).toEqual([
      { reel: 0, fromRow: 0, toRow: 1, symbolId: 'A' },
      { reel: 0, fromRow: 2, toRow: 2, symbolId: 'C' },
      { reel: 1, fromRow: 2, toRow: 2, symbolId: 'F' },
    ]);
    expect(plan.refillEntries).toEqual([
      { reel: 0, row: 0, symbolId: 'X' },
      { reel: 1, row: 0, symbolId: 'Y' },
      { reel: 1, row: 1, symbolId: 'Z' },
    ]);
  });

  it('rejects presentation data that does not match the pre-resolved survivor layout', () => {
    expect(() =>
      planCascadeMotion([['A', 'B', 'C']], [['X', 'C', 'A']], [{ reel: 0, row: 1 }]),
    ).toThrow('survivor mismatch');
  });
});

describe('cascade timing and localization', () => {
  it('scales every timing with animation speed and slightly accelerates deep chains', () => {
    const normal = cascadePresentationTiming(1, 1);
    const fast = cascadePresentationTiming(3, 1);
    const deep = cascadePresentationTiming(1, 3);
    const reduced = cascadePresentationTiming(1, 1, true);
    for (const key of Object.keys(normal) as (keyof typeof normal)[]) {
      expect(fast[key]).toBeLessThan(normal[key]);
      expect(deep[key]).toBeLessThan(normal[key]);
      expect(reduced[key]).toBeLessThanOrEqual(normal[key]);
    }
    const durations = [
      normal.winHold,
      normal.callout,
      normal.removeWinners,
      normal.emptyBeat,
      normal.collapse,
      normal.refill,
      normal.land,
      normal.preEvaluation,
    ];
    expect(durations.reduce((sum, value) => sum + value, 0)).toBe(1_540);
  });

  it('renders semantic Cascade and Cascade Win labels in all four locales', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en-US', 'pt-BR', 'zh-CN', 'fil-PH']);
    for (const locale of SUPPORTED_LOCALES) {
      expect(TRANSLATIONS[locale].presentation.cascade(3)).toContain('3');
      expect(TRANSLATIONS[locale].presentation.cascadeWin(41)).toContain('41');
    }
    expect(TRANSLATIONS['en-US'].presentation.cascade(2)).toBe('CASCADE ×2');
    expect(TRANSLATIONS['pt-BR'].presentation.cascade(2)).toBe('CASCATA ×2');
    expect(TRANSLATIONS['zh-CN'].presentation.cascade(2)).toBe('连消 ×2');
    expect(TRANSLATIONS['fil-PH'].presentation.cascade(2)).toBe('CASCADE ×2');
  });

  it('uses the same resolved motion grammar for paid and free-spin cascade contexts', () => {
    const paid = planCascadeMotion([['A', 'B', 'C']], [['X', 'A', 'C']], [{ reel: 0, row: 1 }]);
    const freeSpin = planCascadeMotion([['A', 'B', 'C']], [['X', 'A', 'C']], [{ reel: 0, row: 1 }]);
    expect(freeSpin).toEqual(paid);
  });
});
