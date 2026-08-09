import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config/load-config.js';
import { startupErrorText } from '../src/startup-error.js';

const artifact = JSON.parse(
  readFileSync(resolve(process.cwd(), 'apps/game/public/data/runtime-config.json'), 'utf8'),
) as Record<string, unknown>;

afterEach(() => vi.unstubAllGlobals());

describe('runtime configuration startup integration', () => {
  it('accepts the production fractional line bet through the complete client loader', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(artifact)))),
    );
    const config = await loadConfig();
    expect(config.configurationId).toBe('lucky888-production-20line-v1');
    expect(config.rules.lineAwardRules).toMatchObject({
      activePaylines: 20,
      lineBetCredits: 0.25,
      totalBetCredits: 5,
    });
  });

  it('preserves the exact validation error for development startup diagnostics', async () => {
    const broken = structuredClone(artifact) as {
      config: { rules: { lineAwardRules: { lineBetCredits: number } }; lineBetCredits: number };
    };
    broken.config.lineBetCredits = 1;
    broken.config.rules.lineAwardRules.lineBetCredits = 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(broken)))),
    );
    let failure: unknown;
    try {
      await loadConfig();
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(
      'must equal activePaylines multiplied by lineBetCredits',
    );
    expect(startupErrorText(failure, true, 'Unable to start.')).toContain(
      'Unable to start: Invalid math configuration',
    );
    expect(startupErrorText(failure, false, 'Unable to start.')).toBe('Unable to start.');
  });
});
