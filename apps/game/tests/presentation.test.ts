import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchedPaylineCenters, paylineColor } from '../src/game/payline-presentation.js';
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
