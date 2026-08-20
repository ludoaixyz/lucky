import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runSimulation, SeededRandom, validateConfig } from '@lucky/math-engine';
import {
  loadSourceConfig,
  MATH_PROFILES_DIRECTORY,
  MATH_SOURCE_FILES,
  requireProfileId,
  simulationReportName,
} from '../lib/source-loader.js';

const temporaryProfiles: string[] = [];

async function temporaryProfile(): Promise<{ id: string; directory: string }> {
  const directory = await mkdtemp(resolve(MATH_PROFILES_DIRECTORY, 'test-profile-'));
  temporaryProfiles.push(directory);
  await cp(resolve(MATH_PROFILES_DIRECTORY, 'lucky888-bathala-aligned-v3'), directory, {
    recursive: true,
  });
  return { id: basename(directory), directory };
}

afterEach(async () => {
  await Promise.all(
    temporaryProfiles.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Bathala source authority', () => {
  it('loads only the seven calibration files and validates the generated model', async () => {
    expect(MATH_SOURCE_FILES).not.toContain('paylines.csv');
    expect(MATH_SOURCE_FILES).not.toContain('reel-strips.csv');
    const { config } = await loadSourceConfig('lucky888-bathala-aligned-v3');
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

  it('loads the separate tumble-balanced profile with its zero-weight tail rows', async () => {
    const { config } = await loadSourceConfig('bathala-tumble-balanced-v1');
    expect(config).toMatchObject({
      configurationId: 'bathala-tumble-balanced-v1',
      metadata: { profileName: 'Tumble Balanced', volatilityProfile: 'balanced' },
      baseSymbolWeights: [
        { symbol: 'L1', weight: 210 },
        { symbol: 'L2', weight: 195 },
        { symbol: 'L3', weight: 170 },
        { symbol: 'L4', weight: 145 },
        { symbol: 'L5', weight: 120 },
        { symbol: 'H1', weight: 80 },
        { symbol: 'H2', weight: 65 },
        { symbol: 'H3', weight: 50 },
        { symbol: 'H4', weight: 35 },
        { symbol: 'SCATTER', weight: 21 },
        { symbol: 'MULTIPLIER', weight: 3 },
      ],
    });
    expect(config.multiplierValues.slice(-3)).toEqual([
      { value: 100, weight: 0 },
      { value: 250, weight: 0 },
      { value: 500, weight: 0 },
    ]);
    expect(validateConfig(config)).toEqual([]);
  });

  it('requires an explicit profile and supports both conventional CLI forms', () => {
    expect(() => requireProfileId([])).toThrow(/Missing required --profile argument/u);
    expect(requireProfileId(['--profile', 'bathala-tumble-balanced-v1'])).toBe(
      'bathala-tumble-balanced-v1',
    );
    expect(requireProfileId(['--profile=bathala-tumble-balanced-v1'])).toBe(
      'bathala-tumble-balanced-v1',
    );
  });

  it('rejects traversal and reports missing profiles clearly', async () => {
    expect(() => requireProfileId(['--profile', '../source'])).toThrow(/paths are not allowed/u);
    await expect(loadSourceConfig('profile-that-does-not-exist')).rejects.toThrow(
      /was not found[\s\S]*math\/profiles\/profile-that-does-not-exist\//u,
    );
  });

  it('rejects a directory/configuration mismatch', async () => {
    const profile = await temporaryProfile();
    const gameConfigPath = resolve(profile.directory, 'game-config.json');
    const game = JSON.parse(await readFile(gameConfigPath, 'utf8')) as Record<string, unknown>;
    await writeFile(
      gameConfigPath,
      `${JSON.stringify({ ...game, configurationId: 'bar' }, null, 2)}\n`,
    );
    await expect(loadSourceConfig(profile.id)).rejects.toThrow(
      /Profile directory\/configuration mismatch[\s\S]*game-config\.json configurationId:\nbar/u,
    );
  });

  it('rejects a profile missing one required source file', async () => {
    const profile = await temporaryProfile();
    await rm(resolve(profile.directory, 'cluster-paytable.csv'));
    await expect(loadSourceConfig(profile.id)).rejects.toThrow(
      /Missing:\n- cluster-paytable\.csv/u,
    );
  });

  it('uses profile-specific report names', () => {
    expect(simulationReportName('bathala-tumble-balanced-v1', 2026, 1_000_000)).toBe(
      'bathala-tumble-balanced-v1-simulation-2026-1000000.json',
    );
  });

  it('is deterministic and keeps profile inputs isolated', async () => {
    const balancedBefore = await loadSourceConfig('bathala-tumble-balanced-v1');
    const first = runSimulation(
      balancedBefore.config,
      { spins: 100, seed: 2026 },
      new SeededRandom(2026),
    );
    const second = runSimulation(
      balancedBefore.config,
      { spins: 100, seed: 2026 },
      new SeededRandom(2026),
    );
    expect(second).toEqual(first);

    const aligned = await loadSourceConfig('lucky888-bathala-aligned-v3');
    const balancedAfter = await loadSourceConfig('bathala-tumble-balanced-v1');
    expect(aligned.config.configurationId).toBe('lucky888-bathala-aligned-v3');
    expect(balancedAfter.config.configurationId).toBe('bathala-tumble-balanced-v1');
    expect(balancedAfter.sourceHash).toBe(balancedBefore.sourceHash);
    expect(aligned.sourceHash).not.toBe(balancedAfter.sourceHash);
  });
});
