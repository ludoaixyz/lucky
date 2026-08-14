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
    expect(validateConfig(config)).toEqual([]);
  });
});
