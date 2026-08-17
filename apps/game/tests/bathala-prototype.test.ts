import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Lucky888 Bathala debug client', () => {
  it('keeps the 6x5 board while removing redundant technical headers', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    expect(html).not.toContain('6 × 5 · COUNT ANYWHERE');
    expect(html).not.toContain('Bathala-style prototype');
    expect(html).not.toContain('BASE GAME');
    expect(html).toContain('aria-label="Six-column by five-row Lucky888 board"');
    expect(html).toContain('id="multiplier-state"');
    expect(html).toContain('name="spin-speed"');
    expect(html).toContain('id="history-list"');
    expect(html).toContain('id="math-lab"');
    expect(html).not.toContain('payline');
  });
});
