import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  matchedPaylineCenters,
  paylineColor,
  RetainedPaylinePresentation,
} from '../src/game/payline-presentation.js';
import { SYMBOL_VISUALS, symbolVisual } from '../src/game/symbol-visuals.js';
import {
  MINIMUM_VISIBLE_DURATION_MS,
  PRESENTATION_SPEED_OPTIONS,
  PRESENTATION_SPEED_MULTIPLIER,
  scaledDelay,
  scaledDuration,
} from '../src/game/presentation-timing.js';

describe('prototype presentation timing', () => {
  it('uses one five-times multiplier while preserving a visible frame', () => {
    expect(PRESENTATION_SPEED_OPTIONS).toEqual([0.5, 1, 2, 3]);
    expect(PRESENTATION_SPEED_MULTIPLIER).toBe(5);
    expect(scaledDuration(1000)).toBe(200);
    expect(scaledDuration(1000, 0.5)).toBe(400);
    expect(scaledDuration(1000, 2)).toBe(100);
    expect(scaledDuration(1000, 3)).toBe(67);
    expect(scaledDelay(10)).toBe(MINIMUM_VISIBLE_DURATION_MS);
    expect(scaledDuration(0)).toBe(0);
  });
});

describe('payline presentation geometry', () => {
  it('supports horizontal, V, and inverted V paths through matched reels only', () => {
    const horizontal = matchedPaylineCenters(
      { id: 'L1', rows: [1, 1, 1, 1, 1] },
      3,
      5,
      3,
      800,
      480,
    );
    const vee = matchedPaylineCenters({ id: 'L4', rows: [0, 1, 2, 1, 0] }, 5, 5, 3, 800, 480);
    const inverted = matchedPaylineCenters({ id: 'L5', rows: [2, 1, 0, 1, 2] }, 5, 5, 3, 800, 480);

    expect(horizontal).toHaveLength(3);
    expect(horizontal.map((point) => point.y)).toEqual([240, 240, 240]);
    expect(vee.map((point) => point.y)).toEqual([80, 240, 400, 240, 80]);
    expect(inverted.map((point) => point.y)).toEqual([400, 240, 80, 240, 400]);
  });

  it('selects readable colors deterministically by payline id', () => {
    expect(paylineColor('L4')).toBe(paylineColor('L4'));
    expect(paylineColor('L4')).not.toBe(paylineColor('L5'));
  });
});

describe('retained payline lifecycle', () => {
  const win = (paylineId: string) => ({ paylineId, symbolId: 'A', count: 3, awardCredits: 5 });
  const window = (symbol: string) => [[symbol], [symbol], [symbol]];
  const remember = (
    state: RetainedPaylinePresentation,
    stageIndex: number,
    symbol: string,
    paylineIds: readonly string[],
  ) =>
    state.rememberWinningStage({
      stageIndex,
      window: window(symbol),
      lineWins: paylineIds.map(win),
    });

  it('retains an ordinary multi-line win through every timer interval', () => {
    vi.useFakeTimers();
    const state = new RetainedPaylinePresentation();
    remember(state, 0, 'A', ['L1', 'L2']);
    for (const milliseconds of [1_000, 10_000, 60_000]) {
      vi.advanceTimersByTime(milliseconds);
      expect(state.current()?.lineWins.map(({ paylineId }) => paylineId)).toEqual(['L1', 'L2']);
    }
    vi.useRealTimers();
  });

  it('clears only when the next accepted spin begins', () => {
    const state = new RetainedPaylinePresentation();
    remember(state, 0, 'A', ['L1']);
    state.beginSpin();
    expect(state.current()).toBeUndefined();
  });

  it('keeps the latest winning cascade when a terminal cascade has no wins', () => {
    const state = new RetainedPaylinePresentation();
    remember(state, 0, 'INITIAL', ['L1']);
    remember(state, 1, 'CASCADE_1', ['L4', 'L7']);
    remember(state, 2, 'TERMINAL', []);
    expect(state.current()).toMatchObject({
      stageIndex: 1,
      window: window('CASCADE_1'),
      lineWins: [
        expect.objectContaining({ paylineId: 'L4' }),
        expect.objectContaining({ paylineId: 'L7' }),
      ],
    });
  });

  it('retains the complete final winning set across multiple winning cascades', () => {
    const state = new RetainedPaylinePresentation();
    remember(state, 0, 'INITIAL', ['L1']);
    remember(state, 1, 'CASCADE_1', ['L3']);
    remember(state, 2, 'CASCADE_2', ['L8', 'L9']);
    remember(state, 3, 'TERMINAL', []);
    expect(state.current()?.stageIndex).toBe(2);
    expect(state.current()?.window).toEqual(window('CASCADE_2'));
    expect(state.current()?.lineWins.map(({ paylineId }) => paylineId)).toEqual(['L8', 'L9']);
  });

  it('leaves a no-win spin empty and never resurrects a prior losing-spin win', () => {
    const state = new RetainedPaylinePresentation();
    remember(state, 0, 'WIN', ['L1']);
    state.beginSpin();
    remember(state, 0, 'LOSS', []);
    expect(state.current()).toBeUndefined();
  });

  it('clears retained state safely on shutdown', () => {
    const state = new RetainedPaylinePresentation();
    remember(state, 0, 'WIN', ['L1']);
    state.shutdown();
    expect(state.current()).toBeUndefined();
  });
});

describe('symbol visual differentiation', () => {
  const artifact = JSON.parse(
    readFileSync(resolve(process.cwd(), 'apps/game/public/data/runtime-config.json'), 'utf8'),
  ) as { config: { symbols: { id: string; category: string; display: string }[] } };

  it('provides a distinct visual family for every configured stable symbol id', () => {
    const symbols = artifact.config.symbols;
    expect(Object.keys(SYMBOL_VISUALS).sort()).toEqual(symbols.map((symbol) => symbol.id).sort());
    expect(new Set(symbols.map((symbol) => symbolVisual(symbol.id).family)).size).toBe(
      symbols.length,
    );
    expect(new Set(symbols.map((symbol) => symbolVisual(symbol.id).mid)).size).toBe(symbols.length);
  });

  it('retains iconography and wild/scatter mathematical identities', () => {
    expect(artifact.config.symbols.find((symbol) => symbol.id === 'WILD')).toMatchObject({
      category: 'wild',
      display: '★',
    });
    expect(artifact.config.symbols.find((symbol) => symbol.id === 'SCATTER')).toMatchObject({
      category: 'scatter',
      display: '●',
    });
    expect(symbolVisual('WILD').family).not.toBe(symbolVisual('SCATTER').family);
  });
});
