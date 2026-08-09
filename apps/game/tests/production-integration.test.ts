import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  aggregateWins,
  evaluatePaylines,
  resolveCascadeSequence,
  resolveFreeSpinFeature,
  resolveSpin,
  SeededRandom,
  validateConfig,
} from '@lucky/math-engine';
import type { RuntimeGameConfig } from '@lucky/shared-types';
import { initialReelWindow } from '../src/game/initial-window.js';
import {
  hasSymbolVisual,
  SYMBOL_VISUALS,
  symbolTextureKey,
  symbolVisual,
} from '../src/game/symbol-visuals.js';
import { BET_OPTIONS, scaleConfigForBet } from '../src/ui/controller.js';

const artifact = JSON.parse(
  readFileSync(resolve(process.cwd(), 'apps/game/public/data/runtime-config.json'), 'utf8'),
) as { config: RuntimeGameConfig };
const config = artifact.config;

describe('production 20-line playable integration', () => {
  it('loads a valid normalized 20-line wager without legacy five-line assumptions', () => {
    expect(validateConfig(config)).toEqual([]);
    expect(config.paylines).toHaveLength(20);
    expect(config.rules.lineAwardRules.activePaylines).toBe(20);
    expect(config.lineBetCredits).toBe(0.25);
    expect(config.totalBetCredits).toBe(5);
    expect(config.rules.lineAwardRules.activePaylines * config.lineBetCredits).toBe(
      config.totalBetCredits,
    );
    expect(BET_OPTIONS[0]).toBe(config.totalBetCredits);
    expect(scaleConfigForBet(config, 5).lineBetCredits).toBe(0.25);
    expect(scaleConfigForBet(config, 10).lineBetCredits).toBe(0.5);
  });

  it('maps all ten symbols and renders a defined initial 5×3 window', () => {
    expect(config.symbols).toHaveLength(10);
    expect(Object.keys(SYMBOL_VISUALS)).toHaveLength(10);
    for (const symbol of config.symbols) {
      expect(hasSymbolVisual(symbol.id)).toBe(true);
      expect(symbolVisual(symbol.id).family).not.toBe('unmapped-development-fallback');
      expect(symbolTextureKey(symbol.id)).toBe(`symbol-frame-${symbol.id}`);
    }
    for (const symbol of ['COIN', 'DRAGON', 'EIGHT']) expect(hasSymbolVisual(symbol)).toBe(true);
    const window = initialReelWindow(config);
    expect(window).toHaveLength(5);
    expect(window.every((column) => column.length === 3)).toBe(true);
    expect(window.flat().every((id) => config.symbols.some((symbol) => symbol.id === id))).toBe(
      true,
    );
  });

  it('uses a visible development fallback for an unmapped presentation symbol', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(symbolVisual('UNMAPPED_TEST').family).toBe('unmapped-development-fallback');
    expect(symbolTextureKey('UNMAPPED_TEST')).toBe('symbol-frame-UNMAPPED_TEST');
    expect(error).toHaveBeenCalledWith(
      'Unable to render symbol: missing presentation mapping for UNMAPPED_TEST',
    );
    error.mockRestore();
  });

  it('starts and resolves normal, cascade, and free-spin outcomes', () => {
    const normal = resolveSpin(config, new SeededRandom(2026));
    expect(normal.window).toHaveLength(5);
    expect(normal.window.every((column) => column.length === 3)).toBe(true);

    const cascade = resolveCascadeSequence(
      Array.from({ length: 5 }, () => ['J', 'J', 'J']),
      config.reelStrips,
      config,
      new SeededRandom(7),
    );
    expect(cascade.cascadeCount).toBeGreaterThan(0);
    expect(cascade.stages[0]?.lineWins.length).toBeGreaterThan(0);

    const feature = resolveFreeSpinFeature(config, new SeededRandom(11), 9);
    expect(feature.triggered).toBe(true);
    expect(feature.totalPlayedSpins).toBeGreaterThanOrEqual(9);
    expect(feature.freeSpins.every((spin) => spin.window.length === 5)).toBe(true);
  });

  it('scales twenty-line awards and paid-credit accounting consistently', () => {
    const window = Array.from({ length: 5 }, () => ['EIGHT', 'EIGHT', 'EIGHT']);
    const baseWins = aggregateWins(evaluatePaylines(window, scaleConfigForBet(config, 5)));
    const doubledWins = aggregateWins(evaluatePaylines(window, scaleConfigForBet(config, 10)));
    expect(baseWins).toBeGreaterThan(0);
    expect(doubledWins).toBe(baseWins * 2);
    const startingCredits = 1_000;
    expect(startingCredits - config.totalBetCredits + baseWins).toBe(995 + baseWins);
  });
});
