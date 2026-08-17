import { describe, expect, it } from 'vitest';
import { validateConfig } from '@lucky/math-engine';
import { loadSourceConfig, MATH_SOURCE_FILES } from '../lib/source-loader.js';

describe('Bathala source authority', () => {
  it('loads only the seven calibration files and validates the generated model', async () => {
    expect(MATH_SOURCE_FILES).not.toContain('paylines.csv');
    expect(MATH_SOURCE_FILES).not.toContain('reel-strips.csv');
    const { config } = await loadSourceConfig();
    expect(config).toMatchObject({
      columns: 6,
      rows: 5,
      minimumWinCount: 8,
      model: 'bathala-count-pay-tumble',
    });
    expect(config.symbols).not.toContain('WILD');
    expect(config.configurationId).toBe('lucky888-bathala-aligned-v3');
    expect(config.references.targetRtp).toBeGreaterThanOrEqual(0.9);
    expect(config.references.targetRtp).toBeLessThanOrEqual(0.95);
    expect(config.references.featureEntrySpins).toBeGreaterThanOrEqual(100);
    expect(config.references.featureEntrySpins).toBeLessThanOrEqual(150);
    expect(config.scatter.baseGameTrigger.freeGamesAwarded).toBe(15);
    expect(config.scatter.freeGameRetrigger.additionalFreeGames).toBe(5);
    expect(config.limits.maximumWinMultiple).toBe(10_000);
    const expectedPayouts = {
      L1: [0.25, 0.75, 2],
      L2: [0.4, 0.9, 4],
      L3: [0.5, 1, 5],
      L4: [0.8, 1.2, 8],
      L5: [1, 1.5, 10],
      H1: [1.5, 2, 12],
      H2: [2, 5, 15],
      H3: [2.5, 10, 25],
      H4: [10, 25, 50],
    } as const;
    for (const symbol of config.regularSymbols) {
      const entries = config.paytable.filter((award) => award.symbol === symbol);
      expect(entries.map(({ minCount, maxCount }) => [minCount, maxCount])).toEqual([
        [8, 9],
        [10, 11],
        [12, 30],
      ]);
      expect(entries.map(({ payout }) => payout)).toEqual(expectedPayouts[symbol]);
      for (let count = 8; count <= 30; count += 1)
        expect(
          entries.filter((award) => count >= award.minCount && count <= award.maxCount),
        ).toHaveLength(1);
    }
    expect(validateConfig(config)).toEqual([]);
  });
});
