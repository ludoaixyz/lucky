import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('LUCKY888 branding', () => {
  it('uses the uppercase browser title, heading, and local mascot asset', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    expect(html).toContain('<title>LUCKY888</title>');
    expect(html).toContain('<h1 id="game-title">LUCKY888</h1>');
    expect(html).toContain('src="/assets/images/lucky888-three-dragons.svg"');
    expect(html).not.toContain('src="http');
  });

  it('contains exactly three instances of the original dragon mark', async () => {
    const svg = await readFile(
      resolve(process.cwd(), 'apps/game/public/assets/images/lucky888-three-dragons.svg'),
      'utf8',
    );
    expect(svg.match(/<use href="#dragon"/gu)).toHaveLength(3);
    await expect(
      readFile(resolve(process.cwd(), 'apps/game/public/favicon.svg'), 'utf8'),
    ).resolves.toContain('<svg');
  });
});
