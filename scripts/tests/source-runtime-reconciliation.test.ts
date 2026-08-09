import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RuntimeGameConfig } from '@lucky/shared-types';
import { loadSourceConfig, MATH_SOURCE_FILES } from '../lib/source-loader.js';
import { assertProductionProfile, assertRuntimeMatchesSource } from '../lib/production-profile.js';

interface RuntimeArtifact {
  readonly metadata: {
    readonly sourceHash: string;
    readonly structuralHash: string;
    readonly payoutHash: string;
  };
  readonly config: RuntimeGameConfig;
}

async function artifact(path: string): Promise<RuntimeArtifact> {
  return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8')) as RuntimeArtifact;
}

describe('math source-to-runtime reconciliation', () => {
  it('uses exactly the eight canonical human-edited CSV/JSON source files', () => {
    expect(MATH_SOURCE_FILES).toEqual([
      'symbols.csv',
      'paytable.csv',
      'paylines.csv',
      'reel-strips.csv',
      'free-spin-reel-strips.csv',
      'game-config.json',
      'rules-config.json',
      'bonus-config.json',
    ]);
  });

  it('matches every compiled symbol, payline, reel stop, paytable row, and JSON value', async () => {
    const source = await loadSourceConfig();
    assertProductionProfile(source.config);
    for (const path of [
      'math/generated/runtime-config.json',
      'apps/game/public/data/runtime-config.json',
    ]) {
      const runtime = await artifact(path);
      expect(runtime.metadata).toMatchObject({
        sourceHash: source.sourceHash,
        structuralHash: source.structuralHash,
        payoutHash: source.payoutHash,
      });
      expect(() => assertRuntimeMatchesSource(runtime.config, source.config, path)).not.toThrow();
    }
  });

  it.each([
    ['symbol', 'symbols'],
    ['payline', 'paylines'],
    ['base reel stop', 'reelStrips'],
    ['free-spin reel stop', 'freeSpinReelStrips'],
    ['paytable award', 'paytable'],
  ] as const)('rejects a generated-runtime %s mismatch', async (_label, field) => {
    const { config } = await loadSourceConfig();
    const changed = structuredClone(config) as RuntimeGameConfig & Record<string, unknown>;
    if (field === 'symbols') Object.assign(changed, { symbols: config.symbols.slice(1) });
    if (field === 'paylines') {
      Object.assign(changed, {
        paylines: [{ ...config.paylines[0]!, rows: [2, 2, 2, 2, 2] }, ...config.paylines.slice(1)],
      });
    }
    if (field === 'reelStrips') {
      Object.assign(changed, {
        reelStrips: [['SCATTER', ...config.reelStrips[0]!.slice(1)], ...config.reelStrips.slice(1)],
      });
    }
    if (field === 'freeSpinReelStrips') {
      Object.assign(changed, {
        freeSpinReelStrips: [
          ['SCATTER', ...config.freeSpinReelStrips[0]!.slice(1)],
          ...config.freeSpinReelStrips.slice(1),
        ],
      });
    }
    if (field === 'paytable') {
      Object.assign(changed, {
        paytable: [
          { ...config.paytable[0]!, awardCredits: config.paytable[0]!.awardCredits + 1 },
          ...config.paytable.slice(1),
        ],
      });
    }
    expect(() => assertRuntimeMatchesSource(changed, config)).toThrow(/differs from canonical/u);
  });
});
