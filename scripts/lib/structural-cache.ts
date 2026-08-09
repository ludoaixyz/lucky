import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { evaluatePaylines } from '@lucky/math-engine';
import type { RuntimeGameConfig, SymbolId } from '@lucky/shared-types';

export interface StructuralCache {
  readonly schemaVersion: '1.0.0';
  readonly structuralHash: string;
  readonly symbols: readonly SymbolId[];
  readonly baseReelProbabilities: readonly Readonly<Record<string, number>>[];
  readonly freeReelProbabilities: readonly Readonly<Record<string, number>>[];
  readonly baseScatterCountProbability: Readonly<Record<string, number>>;
}

export interface StructuralTiming {
  readonly cacheStatus: 'rebuilt' | 'reused';
  readonly structuralMilliseconds: number;
  readonly payoutMilliseconds: number;
}

const CACHE_PATH = resolve(process.cwd(), 'math/generated/structural-cache.json');

function probabilities(
  strips: readonly (readonly SymbolId[])[],
): Readonly<Record<string, number>>[] {
  return strips.map((strip) => {
    const counts: Record<string, number> = {};
    for (const symbol of strip) counts[symbol] = (counts[symbol] ?? 0) + 1;
    return Object.fromEntries(
      Object.entries(counts).map(([symbol, count]) => [symbol, count / strip.length]),
    );
  });
}

function scatterDistribution(config: RuntimeGameConfig): Readonly<Record<string, number>> {
  let combined = [1];
  for (const strip of config.reelStrips) {
    const reel = Array<number>(config.visibleRows + 1).fill(0);
    for (let stop = 0; stop < strip.length; stop += 1) {
      let count = 0;
      for (let row = 0; row < config.visibleRows; row += 1)
        if (strip[(stop + row) % strip.length] === config.rules.scatter.symbolId) count += 1;
      reel[count] = (reel[count] ?? 0) + 1 / strip.length;
    }
    const next = Array<number>(combined.length + reel.length - 1).fill(0);
    combined.forEach((left, a) =>
      reel.forEach((right, b) => {
        next[a + b] = (next[a + b] ?? 0) + left * right;
      }),
    );
    combined = next;
  }
  return Object.fromEntries(combined.map((value, count) => [String(count), value]));
}

export async function loadOrBuildStructuralCache(
  config: RuntimeGameConfig,
  structuralHash: string,
  forceRebuild = false,
): Promise<{
  readonly cache: StructuralCache;
  readonly status: 'rebuilt' | 'reused';
  readonly milliseconds: number;
}> {
  const started = performance.now();
  try {
    const cached = JSON.parse(await readFile(CACHE_PATH, 'utf8')) as StructuralCache;
    if (!forceRebuild && cached.structuralHash === structuralHash)
      return { cache: cached, status: 'reused', milliseconds: performance.now() - started };
  } catch {
    /* cold cache */
  }
  const cache: StructuralCache = {
    schemaVersion: '1.0.0',
    structuralHash,
    symbols: config.symbols.map((symbol) => symbol.id),
    baseReelProbabilities: probabilities(config.reelStrips),
    freeReelProbabilities: probabilities(config.freeSpinReelStrips),
    baseScatterCountProbability: scatterDistribution(config),
  };
  await mkdir(resolve(process.cwd(), 'math/generated'), { recursive: true });
  await writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
  return { cache, status: 'rebuilt', milliseconds: performance.now() - started };
}

export function priceInitialBoardRtp(
  config: RuntimeGameConfig,
  cache: StructuralCache,
): { readonly rtp: number; readonly milliseconds: number } {
  const started = performance.now();
  const entries = cache.baseReelProbabilities.map((reel) => Object.entries(reel));
  const oneLine = { ...config, paylines: [{ id: 'EXACT', rows: [0, 0, 0, 0, 0] }] };
  let expectedOneLine = 0;
  for (const [s1, p1] of entries[0] ?? [])
    for (const [s2, p2] of entries[1] ?? [])
      for (const [s3, p3] of entries[2] ?? [])
        for (const [s4, p4] of entries[3] ?? [])
          for (const [s5, p5] of entries[4] ?? []) {
            const award =
              evaluatePaylines([[s1], [s2], [s3], [s4], [s5]], oneLine)[0]?.awardCredits ?? 0;
            expectedOneLine += p1 * p2 * p3 * p4 * p5 * award;
          }
  return {
    rtp: (expectedOneLine * config.paylines.length) / config.totalBetCredits,
    milliseconds: performance.now() - started,
  };
}
