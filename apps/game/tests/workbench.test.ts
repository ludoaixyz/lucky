import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ActiveGameConfig, BathalaSpinResult, SpinRecord } from '@lucky/shared-types';
import { serializeSpinHistoryCsv, SPIN_HISTORY_HEADERS } from '../src/workbench/csv.js';
import { deriveSessionStats, HistoryStore } from '../src/workbench/history.js';
import {
  MathConfigManager,
  parseMathConfig,
  serializeMathConfig,
} from '../src/workbench/math-config.js';
import { createSpinRecord, scaleNormalizedWin } from '../src/workbench/spin-record.js';

async function baseline(): Promise<ActiveGameConfig> {
  const text = await readFile(resolve(process.cwd(), 'math/generated/runtime-config.json'), 'utf8');
  return (JSON.parse(text) as { config: ActiveGameConfig }).config;
}

const record = (spinNumber: number, overrides: Partial<SpinRecord> = {}): SpinRecord => ({
  sessionId: 'session-a',
  sessionSeed: 2026,
  spinNumber,
  spinIndex: spinNumber - 1,
  timestamp: `2026-08-15T04:18:${String(spinNumber).padStart(2, '0')}.000Z`,
  configurationId: 'config,a',
  configurationVersion: '1.0.0',
  profileName: 'Baseline, Prototype',
  bet: 1,
  baseWin: 0,
  featureWin: 0,
  totalWin: 0,
  winMultiple: 0,
  winning: false,
  baseTumbleRounds: 0,
  freeGameTumbleRounds: 0,
  maximumTumbleDepth: 0,
  bathalaActivations: 0,
  bathalaSymbolsRemoved: 0,
  multiplierAppeared: false,
  multiplierValues: [],
  summedMultiplier: 0,
  scatterCount: 0,
  featureTriggered: false,
  freeGamesAwarded: 0,
  freeGamesPlayed: 0,
  retriggerCount: 0,
  maximumWinApplied: false,
  ...overrides,
});

describe('math configuration lifecycle', () => {
  it('keeps draft changes isolated, validates, applies, and round-trips JSON', async () => {
    const config = await baseline();
    const manager = new MathConfigManager(config);
    manager.replaceDraft({ ...manager.draft(), configurationId: 'draft-v2' });
    expect(manager.active().configurationId).toBe(config.configurationId);
    expect(manager.isDirty()).toBe(true);
    expect(manager.apply().configurationId).toBe('draft-v2');
    expect(parseMathConfig(serializeMathConfig(manager.active()))).toEqual(manager.active());
  });

  it('rejects invalid symbol weights and does not promote the draft', async () => {
    const manager = new MathConfigManager(await baseline());
    manager.replaceDraft({
      ...manager.draft(),
      baseSymbolWeights: manager
        .draft()
        .baseSymbolWeights.map((entry) => ({ ...entry, weight: 0 })),
    });
    expect(manager.validateDraft().some((issue) => issue.path === 'baseSymbolWeights')).toBe(true);
    expect(() => manager.apply()).toThrow('At least one symbol');
  });
});

describe('normalized bet scaling and paid-spin telemetry', () => {
  it('scales credits while preserving the normalized multiple', () => {
    expect(scaleNormalizedWin(5, 1)).toBe(5);
    expect(scaleNormalizedWin(5, 2)).toBe(10);
  });

  it('keeps a complete feature attached to one paid spin', async () => {
    const config = await baseline();
    const result = {
      finalBoard: [],
      tumbleRounds: [],
      baseGameWin: 2.5,
      scatterCount: 4,
      scatterPayout: 3,
      freeGamesAwarded: 15,
      components: {
        baseGameRegularPayout: 0,
        baseGameScatterPayout: 0,
        baseGameMultiplierUplift: 0,
        freeGameRegularPayout: 0,
        freeGameScatterPayout: 0,
        freeGameMultiplierUplift: 0,
      },
      feature: {
        initialAward: 15,
        totalSpinsPlayed: 20,
        retriggerCount: 1,
        startingMultiplier: 0,
        endingMultiplier: 7,
        spins: [],
        totalWin: 12,
      },
      totalWin: 14.5,
      uncappedTotalWin: 14.5,
      maximumWinApplied: false,
    } as BathalaSpinResult;
    const spin = createSpinRecord(config, result, {
      sessionId: 's',
      sessionSeed: 1,
      spinNumber: 1,
      timestamp: '2026-08-15T00:00:00.000Z',
      bet: 2,
    });
    expect(spin).toMatchObject({
      bet: 2,
      baseWin: 5,
      featureWin: 24,
      totalWin: 29,
      winMultiple: 14.5,
      featureTriggered: true,
      freeGamesPlayed: 20,
      retriggerCount: 1,
    });
  });
});

describe('history, statistics, and CSV', () => {
  it('retains all records and supplies the latest ten newest-first', () => {
    const store = new HistoryStore();
    for (let spin = 1; spin <= 11; spin += 1) store.appendSpin(record(spin));
    expect(store.getAllSessionSpins().map((entry) => entry.spinNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(store.getRecentSpins().map((entry) => entry.spinNumber)).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2,
    ]);
  });

  it('allows session RTP above 100% and reports zero features as not observed', () => {
    const stats = deriveSessionStats([
      record(1),
      record(2, { totalWin: 3, winMultiple: 3, winning: true }),
    ]);
    expect(stats.totalWagered).toBe(2);
    expect(stats.totalWon).toBe(3);
    expect(stats.sessionRtp).toBe(1.5);
    expect(stats.featureEntrySpins).toBeNull();
  });

  it('serializes deterministic analysis-ready CSV with quoted comma fields and pipe arrays', () => {
    const csv = serializeSpinHistoryCsv([
      record(1, { multiplierAppeared: true, multiplierValues: [2, 5, 10] }),
    ]);
    expect(csv.split('\r\n')[0]).toBe(SPIN_HISTORY_HEADERS.join(','));
    expect(csv).toContain('"config,a"');
    expect(csv).toContain('"Baseline, Prototype"');
    expect(csv).toContain('2|5|10');
    expect(csv.trim().split('\r\n')).toHaveLength(2);
  });
});
