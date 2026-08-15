import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Lucky888 Bathala debug client', () => {
  it('declares the 6x5 count-anywhere board and presents engine-owned feature state', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    expect(html).toContain('6 × 5 · COUNT ANYWHERE');
    expect(html).toContain('id="multiplier-state"');
    expect(html).toContain('id="history-list"');
    expect(html).toContain('id="math-lab"');
    expect(html).not.toContain('payline');
  });
});
