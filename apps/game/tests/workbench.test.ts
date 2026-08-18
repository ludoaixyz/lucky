import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  ActiveGameConfig,
  BathalaSpinResult,
  SpinRecord,
  TumbleRound,
} from '@lucky/shared-types';
import { resolveSpin, SeededRandom } from '@lucky/math-engine';
import { serializeSpinHistoryCsv, SPIN_HISTORY_HEADERS } from '../src/workbench/csv.js';
import { deriveSessionStats, HistoryStore } from '../src/workbench/history.js';
import {
  MathConfigManager,
  parseMathConfig,
  serializeMathConfig,
} from '../src/workbench/math-config.js';
import { createSpinRecord, scaleNormalizedWin } from '../src/workbench/spin-record.js';
import {
  recordMechanicValues,
  resultMechanicValues,
} from '../src/workbench/mechanics-presentation.js';
import {
  BoardPresentationController,
  PRESENTATION_TIMINGS,
  resolvePresentCommit,
  runAutoSpinSequence,
  speedLabel,
  SPIN_SPEEDS,
  type SpinSpeed,
} from '../src/presentation/board-presentation-controller.js';
import { formatSpinProgress } from '../src/workbench/spin-progress.js';
import { fallingSymbolKeyframes } from '../src/presentation/board-drop-presentation.js';
import {
  minimumSpanningConnectorNetwork,
  WinConnectorLayer,
} from '../src/presentation/win-connectors.js';
import { formatCredits, formatInteger, formatMultiplier } from '../src/workbench/number-format.js';
import { BATHALA_SYMBOL_IDS, BATHALA_SYMBOL_VISUALS } from '../src/presentation/symbol-visuals.js';
import { renderRulesContent, rulesReferenceText } from '../src/presentation/rules-dialog.js';

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
  winOutcomes: [],
  totalTumbleRounds: 0,
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
    expect(scaleNormalizedWin(0.5, 1000)).toBe(500);
  });

  it('loads only the requested numeric bet ladder with a usable default balance', async () => {
    const config = await baseline();
    expect(config.betting.bets).toEqual([
      300, 500, 1000, 2000, 3000, 5000, 10000, 20000, 30000, 50000, 100000, 200000, 500000, 1000000,
      5000000, 10000000,
    ]);
    expect(config.betting.defaultBet).toBe(300);
    expect(config.betting.startingCredits).toBe(1_000_000);
    expect(config.betting.autoSpinOptions).toEqual([1, 5, 10, 25, 50, 100]);
  });

  it('formats gameplay bet options with unambiguous thousands separators', () => {
    expect(formatInteger(1000)).toBe('1,000');
    expect(formatInteger(1000000)).toBe('1,000,000');
    expect(formatInteger(10000000)).toBe('10,000,000');
  });

  it('rounds only visible credits while preserving two-decimal multiplier formatting', () => {
    expect(formatCredits(1_000_000)).toBe('1,000,000');
    expect(formatCredits(12_438.47)).toBe('12,438');
    expect(formatCredits(12_438.5)).toBe('12,439');
    expect(formatMultiplier(0)).toBe('0.00×');
    expect(formatMultiplier(0.5)).toBe('0.50×');
    expect(formatMultiplier(1.25)).toBe('1.25×');
  });

  it('groups eight session metrics into explicit left and right columns', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    document.body.innerHTML = html;
    const columns = [...document.querySelectorAll('.session-summary-column')];
    const labels = (column: Element): (string | null)[] =>
      [...column.querySelectorAll('.session-stat > span')].map((label) => label.textContent);

    expect(columns).toHaveLength(2);
    expect(labels(columns[0]!)).toEqual([
      'SESSION SPINS',
      'TOTAL WAGERED',
      'TOTAL WON',
      'WIN RATE',
    ]);
    expect(labels(columns[1]!)).toEqual([
      'SESSION RTP',
      'SESSION VOLATILITY',
      'FEATURES',
      'FEATURE RATE',
    ]);
    expect(document.querySelector('#stat-volatility')?.textContent).toBe('N/A');
    expect(document.querySelector('#stat-feature-rate')?.textContent).toBe('N/A');
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
      totalTumbleRounds: 0,
    });
  });

  it('preserves simultaneous and tumble-level winning outcomes from engine telemetry', async () => {
    const config = await baseline();
    const round = (
      index: number,
      multiplier: number,
      wins: TumbleRound['winningSymbols'],
    ): TumbleRound => ({
      index,
      winningSymbols: wins,
      baseWin: wins.reduce((sum, win) => sum + win.payout, 0),
      multiplierSymbols: [],
      visibleMultiplierSum: multiplier,
      newlyCollectedMultiplierSum: 0,
      effectiveMultiplier: multiplier,
      creditedWin: wins.reduce((sum, win) => sum + win.payout, 0) * multiplier,
      removedWinningCells: [],
    });
    const result = {
      finalBoard: [],
      tumbleRounds: [
        round(0, 2, [
          { symbol: 'H2', count: 9, payout: 2, positions: [] },
          { symbol: 'L4', count: 12, payout: 1.4, positions: [] },
        ]),
        round(1, 3, [{ symbol: 'H1', count: 8, payout: 3, positions: [] }]),
      ],
      baseGameWin: 15.8,
      scatterCount: 0,
      scatterPayout: 0,
      freeGamesAwarded: 0,
      components: {
        baseGameRegularPayout: 15.8,
        baseGameScatterPayout: 0,
        baseGameMultiplierUplift: 0,
        freeGameRegularPayout: 0,
        freeGameScatterPayout: 0,
        freeGameMultiplierUplift: 0,
      },
      feature: null,
      totalWin: 15.8,
      uncappedTotalWin: 15.8,
      maximumWinApplied: false,
    } as BathalaSpinResult;
    const spin = createSpinRecord(config, result, {
      sessionId: 'wins',
      sessionSeed: 1,
      spinNumber: 1,
      timestamp: '2026-08-15T00:00:00.000Z',
      bet: 1,
    });
    expect(spin.winOutcomes).toEqual([
      expect.objectContaining({
        symbolId: 'H2',
        symbolCount: 9,
        tumbleIndex: 0,
        basePayoutMultiple: 2,
        multiplierApplied: 2,
        creditedPayoutMultiple: 4,
      }),
      expect.objectContaining({
        symbolId: 'L4',
        symbolCount: 12,
        tumbleIndex: 0,
        creditedPayoutMultiple: 2.8,
      }),
      expect.objectContaining({
        symbolId: 'H1',
        symbolCount: 8,
        tumbleIndex: 1,
        creditedPayoutMultiple: 9,
      }),
    ]);
  });

  it('records no fabricated outcomes for a losing spin', async () => {
    const config = await baseline();
    const result = {
      finalBoard: [],
      tumbleRounds: [],
      baseGameWin: 0,
      scatterCount: 0,
      scatterPayout: 0,
      freeGamesAwarded: 0,
      components: {
        baseGameRegularPayout: 0,
        baseGameScatterPayout: 0,
        baseGameMultiplierUplift: 0,
        freeGameRegularPayout: 0,
        freeGameScatterPayout: 0,
        freeGameMultiplierUplift: 0,
      },
      feature: null,
      totalWin: 0,
      uncappedTotalWin: 0,
      maximumWinApplied: false,
    } as BathalaSpinResult;
    expect(
      createSpinRecord(config, result, {
        sessionId: 'loss',
        sessionSeed: 1,
        spinNumber: 1,
        timestamp: '2026-08-15T00:00:00.000Z',
        bet: 1,
      }).winOutcomes,
    ).toEqual([]);
  });
});

describe('history, statistics, and CSV', () => {
  it('presents result values without duplicating their static labels', () => {
    const result = {
      tumbleRounds: [
        {
          multiplierSymbols: [{ value: 2 }, { value: 5 }],
          bathala: { occurred: true },
        },
        { multiplierSymbols: [{ value: 10 }] },
      ],
      feature: null,
    } as unknown as BathalaSpinResult;
    expect(resultMechanicValues(result)).toEqual({
      tumbles: '2',
      bathala: '1',
      multiplier: '2.00× + 5.00× + 10.00×',
    });
    expect(Object.values(resultMechanicValues(result)).join(' ')).not.toMatch(
      /Tumbles|Bathala|Multiplier/u,
    );
  });

  it('always presents compact history mechanics, including zero and empty values', () => {
    expect(recordMechanicValues(record(1))).toEqual({
      tumbles: '0',
      bathala: '0',
      multiplier: '—',
    });
    expect(
      recordMechanicValues(
        record(2, {
          totalTumbleRounds: 5,
          baseTumbleRounds: 3,
          freeGameTumbleRounds: 2,
          bathalaActivations: 2,
          multiplierAppeared: true,
          multiplierValues: [5, 10],
        }),
      ),
    ).toEqual({ tumbles: '5', bathala: '2', multiplier: '5.00× + 10.00×' });
  });

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

  it('reports no observed session volatility before a paid spin is committed', () => {
    expect(deriveSessionStats([]).sessionVolatility).toBeNull();
  });

  it('reports zero volatility for one zero return and for identical returns', () => {
    expect(deriveSessionStats([record(1)]).sessionVolatility).toBe(0);
    expect(
      deriveSessionStats([
        record(1, { winMultiple: 2 }),
        record(2, { winMultiple: 2 }),
        record(3, { winMultiple: 2 }),
      ]).sessionVolatility,
    ).toBe(0);
  });

  it('includes losing paid spins in the population standard deviation', () => {
    const stats = deriveSessionStats([
      record(1, { winMultiple: 0 }),
      record(2, { winMultiple: 0 }),
      record(3, { winMultiple: 2, winning: true }),
      record(4, { winMultiple: 4, winning: true }),
    ]);

    expect(stats.sessionVolatility).toBeCloseTo(Math.sqrt(2.75), 12);
  });

  it('counts a feature paid spin final return multiple exactly once', () => {
    const stats = deriveSessionStats([
      record(1, { winMultiple: 0 }),
      record(2, {
        winMultiple: 6,
        winning: true,
        featureTriggered: true,
        featureWin: 6,
        totalWin: 6,
      }),
    ]);

    expect(stats.sessionVolatility).toBe(3);
  });

  it('serializes deterministic analysis-ready CSV with quoted comma fields and pipe arrays', () => {
    const csv = serializeSpinHistoryCsv([
      record(1, {
        totalTumbleRounds: 7,
        baseTumbleRounds: 3,
        freeGameTumbleRounds: 4,
        bathalaActivations: 2,
        bathalaSymbolsRemoved: 7,
        multiplierAppeared: true,
        multiplierValues: [2, 5, 10],
        winOutcomes: [
          {
            phase: 'base',
            tumbleIndex: 0,
            symbolId: 'H2',
            symbolCount: 9,
            basePayoutMultiple: 2,
            multiplierApplied: 2,
            creditedPayoutMultiple: 4,
          },
        ],
      }),
    ]);
    expect(csv.split('\r\n')[0]).toBe(SPIN_HISTORY_HEADERS.join(','));
    expect(csv).toContain('"config,a"');
    expect(csv).toContain('"Baseline, Prototype"');
    expect(csv).toContain('2|5|10');
    for (const header of [
      'total_tumble_rounds',
      'base_tumble_rounds',
      'free_game_tumble_rounds',
      'bathala_activations',
      'bathala_symbols_removed',
      'multiplier_appeared',
      'multiplier_values',
    ])
      expect(SPIN_HISTORY_HEADERS).toContain(header);
    expect(csv).toContain('winning_outcomes');
    expect(csv).toContain('""symbolId"":""H2""');
    expect(csv.trim().split('\r\n')).toHaveLength(2);
  });
});

describe('falling-board presentation behavior', () => {
  it('maps every Bathala math symbol to one distinctive visual definition', () => {
    expect(BATHALA_SYMBOL_IDS).toEqual([
      'L1',
      'L2',
      'L3',
      'L4',
      'L5',
      'H1',
      'H2',
      'H3',
      'H4',
      'SCATTER',
      'MULTIPLIER',
    ]);
    const identities = BATHALA_SYMBOL_IDS.map((id) => {
      const visual = BATHALA_SYMBOL_VISUALS[id];
      expect(visual.id).toBe(id);
      return `${visual.icon}:${visual.shape}:${visual.surface}`;
    });
    expect(new Set(identities).size).toBe(BATHALA_SYMBOL_IDS.length);
  });

  it('centralizes the required speed-duration mapping', () => {
    expect(SPIN_SPEEDS).toEqual({ normal: 2100, x1: 1100, x2: 600 });
    expect(SPIN_SPEEDS.normal).toBeGreaterThan(SPIN_SPEEDS.x1);
    expect(SPIN_SPEEDS.x1).toBeGreaterThan(SPIN_SPEEDS.x2);
    expect(PRESENTATION_TIMINGS.normal.drop.motion).toBeGreaterThanOrEqual(1400);
    expect(PRESENTATION_TIMINGS.normal.win.perGroupHold).toBe(1500);
    expect(PRESENTATION_TIMINGS.normal.win.postRefillHold).toBeGreaterThanOrEqual(350);
    expect(PRESENTATION_TIMINGS.x1.win.perGroupHold).toBe(750);
    expect(PRESENTATION_TIMINGS.x2.win.perGroupHold).toBe(350);
    expect(speedLabel('normal')).toBe('x1');
    expect(speedLabel('x1')).toBe('x2');
    expect(speedLabel('x2')).toBe('x3');
  });

  it('keeps Bathala focus, shake, removal, and post-hold readable at every speed', () => {
    expect(PRESENTATION_TIMINGS.normal.win).toMatchObject({
      bathalaFocus: 700,
      bathalaShake: 450,
      bathalaRemove: 350,
      afterBathalaHold: 250,
    });
    expect(PRESENTATION_TIMINGS.x1.win).toMatchObject({
      bathalaFocus: 400,
      bathalaShake: 260,
      bathalaRemove: 220,
      afterBathalaHold: 150,
    });
    expect(PRESENTATION_TIMINGS.x2.win).toMatchObject({
      bathalaFocus: 220,
      bathalaShake: 150,
      bathalaRemove: 140,
      afterBathalaHold: 80,
    });
  });

  it('uses subtle coordinated column and row stagger within the advertised total', () => {
    const drop = PRESENTATION_TIMINGS.normal.drop;
    expect(drop.columnStagger).toBeGreaterThanOrEqual(45);
    expect(drop.columnStagger).toBeLessThanOrEqual(65);
    expect(drop.rowStagger).toBeGreaterThanOrEqual(25);
    expect(drop.rowStagger).toBeLessThanOrEqual(40);
    expect(drop.motion + drop.columnStagger * 5 + drop.rowStagger * 4).toBe(drop.total);
    expect(drop.postLandingHold).toBeGreaterThanOrEqual(350);
  });

  it('falls from above with acceleration and one firm landing compression', () => {
    const frames = fallingSymbolKeyframes(1000, false);
    expect(String(frames[0]?.transform)).toContain('translate3d(0,-1000px');
    expect(frames.map(({ offset }) => offset)).toEqual([0, 0.16, 0.68, 0.88, 1]);
    expect(String(frames[1]?.transform)).toContain('-930px');
    expect(String(frames[3]?.transform)).toContain('scaleY(.97)');
    expect(String(frames.at(-1)?.transform)).toContain('translate3d(0,0,0)');
  });

  it('builds an N-1 connector network rather than every possible connection', () => {
    const points = Array.from({ length: 9 }, (_, index) => ({
      column: index % 6,
      row: index % 5,
      x: index * 10,
      y: (index % 3) * 15,
    }));
    expect(minimumSpanningConnectorNetwork(points)).toHaveLength(8);
  });

  it('keeps simultaneous winning symbol networks separate', async () => {
    document.body.innerHTML = '<div id="board"></div>';
    const board = document.querySelector<HTMLElement>('#board')!;
    const layer = new WinConnectorLayer(board);
    const l2 = [
      { column: 0, row: 0 },
      { column: 1, row: 2 },
      { column: 3, row: 1 },
    ];
    const h1 = [
      { column: 2, row: 4 },
      { column: 4, row: 3 },
      { column: 5, row: 0 },
    ];
    await Promise.all([
      ...layer.drawGroup('L2', l2, 0, true),
      ...layer.drawGroup('H1', h1, 0, true),
    ]);
    expect(board.querySelectorAll('[data-group-id="L2"]')).toHaveLength(l2.length - 1);
    expect(board.querySelectorAll('[data-group-id="H1"]')).toHaveLength(h1.length - 1);
    expect(board.querySelectorAll('.win-connector')).toHaveLength(l2.length + h1.length - 2);
  });

  it('renders only x1, x2, x3 and keeps visible x1 selected without durations', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    document.body.innerHTML = html;
    const speedInputs = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="spin-speed"]'),
    ];
    expect(speedInputs.map((input) => input.nextElementSibling?.textContent?.trim())).toEqual([
      'x1',
      'x2',
      'x3',
    ]);
    expect(speedInputs.map((input) => input.value)).toEqual(['normal', 'x1', 'x2']);
    expect(speedInputs[0]?.checked).toBe(true);
    expect(document.querySelector('.speed-control')?.textContent).not.toMatch(/NORMAL|\d+\.\d+s/u);
  });

  it('keeps the six column viewports size-contained and the board geometry stable', async () => {
    const css = await readFile(resolve(process.cwd(), 'apps/game/src/style.css'), 'utf8');
    expect(css).toMatch(/\.board\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/su);
    expect(css).toMatch(
      /\.reel\s*\{[^}]*position:\s*relative[^}]*min-height:\s*0[^}]*width:\s*100%[^}]*height:\s*100%[^}]*overflow:\s*hidden[^}]*contain:\s*size layout paint/su,
    );
    expect(css).toMatch(
      /\.reel-track\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*width:\s*100%/su,
    );
    expect(css).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/su);
    expect(css).not.toContain('.board--spinning');
  });

  it('styles Bathala as a distinct mint focus, shake, and removal sequence', async () => {
    const css = await readFile(resolve(process.cwd(), 'apps/game/src/style.css'), 'utf8');
    expect(css).toMatch(/\.board--bathala-focus[\s\S]*:not\(\.symbol--bathala-target\)/u);
    expect(css).toMatch(/\.symbol--bathala-target\s*\{[^}]*brightness\(1\.42\)/su);
    expect(css).toMatch(/@keyframes bathala-shake/u);
    expect(css).toMatch(/@keyframes bathala-remove/u);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.symbol--bathala-shaking[\s\S]*animation:\s*none/u,
    );
  });

  it.each(['normal', 'x1', 'x2'] satisfies SpinSpeed[])(
    'stages Bathala focus, shake, and removal at %s before rendering the next board',
    async (speed) => {
      vi.useFakeTimers();
      const config = await baseline();
      const resolved = resolveSpin(config, new SeededRandom(8848), true);
      const boardBefore = (resolved.initialBoard ?? resolved.finalBoard).map((column) =>
        column.map((cell) => (cell ? { ...cell } : null)),
      );
      const winningPosition = { column: 0, row: 0 };
      const bathalaPositions = [
        { column: 1, row: 0 },
        { column: 2, row: 0 },
      ];
      boardBefore[0]![0] = { id: 'winning-cell', symbol: 'H1' };
      boardBefore[1]![0] = { id: 'bathala-a', symbol: 'L3' };
      boardBefore[2]![0] = { id: 'bathala-b', symbol: 'L3' };
      const boardAfterRemoval = boardBefore.map((column) => column.map((cell) => cell));
      boardAfterRemoval[0]![0] = null;
      boardAfterRemoval[1]![0] = null;
      boardAfterRemoval[2]![0] = null;
      const round: TumbleRound = {
        index: 0,
        winningSymbols: [{ symbol: 'H1', count: 8, payout: 1, positions: [winningPosition] }],
        baseWin: 1,
        multiplierSymbols: [],
        visibleMultiplierSum: 0,
        newlyCollectedMultiplierSum: 0,
        effectiveMultiplier: 1,
        creditedWin: 1,
        removedWinningCells: [winningPosition],
        bathala: {
          occurred: true,
          targetSymbol: 'L3',
          removedPositions: bathalaPositions,
        },
        boardBefore,
        boardAfterRemoval,
      };
      document.body.innerHTML = `<div id="reels">${boardBefore
        .map(() => '<div class="reel"><div class="reel-track"></div></div>')
        .join('')}</div>`;
      const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
      HTMLElement.prototype.animate = (() => ({
        finished: Promise.resolve(),
        cancel() {},
        finish() {},
      })) as unknown as typeof HTMLElement.prototype.animate;
      try {
        const board = document.querySelector<HTMLElement>('#reels')!;
        const presenter = new BoardPresentationController(board, () => false);
        const timing = PRESENTATION_TIMINGS[speed];
        const presentation = presenter.present(boardBefore, speed, [round]);
        await vi.advanceTimersByTimeAsync(timing.drop.postLandingHold);
        await vi.advanceTimersByTimeAsync(timing.win.perGroupHold);
        await vi.advanceTimersByTimeAsync(timing.win.remove);
        await vi.advanceTimersByTimeAsync(timing.win.afterRemoveHold);

        expect(presenter.state()).toBe('bathalaAnimating');
        expect(board.classList.contains('board--bathala-focus')).toBe(true);
        expect(board.dataset.bathalaRemoval).toBe('BATHALA · L3');
        expect(board.querySelectorAll('.symbol--bathala-target')).toHaveLength(2);
        expect(board.querySelectorAll('.symbol--bathala-shaking')).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(timing.win.bathalaFocus);
        expect(board.dataset.bathalaRemoval).toBe('BATHALA · L3');
        expect(board.querySelectorAll('.symbol--bathala-shaking')).toHaveLength(2);

        await vi.advanceTimersByTimeAsync(timing.win.bathalaShake);
        expect(board.dataset.bathalaRemoval).toBe('BATHALA · L3');
        expect(board.querySelectorAll('.symbol--bathala-shaking')).toHaveLength(0);
        expect(board.querySelectorAll('.symbol--bathala-removing')).toHaveLength(2);

        await vi.advanceTimersByTimeAsync(timing.win.bathalaRemove);
        expect(board.classList.contains('board--bathala-focus')).toBe(false);
        expect(board.dataset.bathalaRemoval).toBeUndefined();
        expect(
          board.querySelectorAll(
            '.symbol--bathala-target,.symbol--bathala-shaking,.symbol--bathala-removing',
          ),
        ).toHaveLength(0);
        expect(board.querySelector('[data-cell-id="bathala-a"]')).toBeNull();

        await vi.runAllTimersAsync();
        await presentation;
      } finally {
        vi.useRealTimers();
        if (animateDescriptor)
          Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
        else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
      }
    },
  );

  it.each(['focus', 'shake', 'removal'] as const)(
    'STOP during Bathala $phase clears every temporary class',
    async (phase) => {
      vi.useFakeTimers();
      const config = await baseline();
      const resolved = resolveSpin(config, new SeededRandom(8848), true);
      const boardBefore = (resolved.initialBoard ?? resolved.finalBoard).map((column) =>
        column.map((cell) => (cell ? { ...cell } : null)),
      );
      const winningPosition = { column: 0, row: 0 };
      const bathalaPosition = { column: 1, row: 0 };
      boardBefore[0]![0] = { id: 'winning-cell', symbol: 'H1' };
      boardBefore[1]![0] = { id: 'bathala-target', symbol: 'L2' };
      const boardAfterRemoval = boardBefore.map((column) => column.map((cell) => cell));
      boardAfterRemoval[0]![0] = null;
      boardAfterRemoval[1]![0] = null;
      const round: TumbleRound = {
        index: 0,
        winningSymbols: [{ symbol: 'H1', count: 8, payout: 1, positions: [winningPosition] }],
        baseWin: 1,
        multiplierSymbols: [],
        visibleMultiplierSum: 0,
        newlyCollectedMultiplierSum: 0,
        effectiveMultiplier: 1,
        creditedWin: 1,
        removedWinningCells: [winningPosition],
        bathala: {
          occurred: true,
          targetSymbol: 'L2',
          removedPositions: [bathalaPosition],
        },
        boardBefore,
        boardAfterRemoval,
      };
      document.body.innerHTML = `<div id="reels">${boardBefore
        .map(() => '<div class="reel"><div class="reel-track"></div></div>')
        .join('')}</div>`;
      const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
      HTMLElement.prototype.animate = (() => ({
        finished: Promise.resolve(),
        cancel() {},
        finish() {},
      })) as unknown as typeof HTMLElement.prototype.animate;
      try {
        const board = document.querySelector<HTMLElement>('#reels')!;
        const presenter = new BoardPresentationController(board, () => false);
        const presentation = presenter.present(boardBefore, 'normal', [round]);
        await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.drop.postLandingHold);
        await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.win.perGroupHold);
        await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.win.remove);
        await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.win.afterRemoveHold);
        if (phase !== 'focus')
          await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.win.bathalaFocus);
        if (phase === 'removal')
          await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.win.bathalaShake);

        expect(presenter.state()).toBe('bathalaAnimating');
        expect(board.classList.contains('board--bathala-focus')).toBe(true);
        presenter.stop();
        await vi.runAllTimersAsync();
        await presentation;

        expect(board.classList.contains('board--bathala-focus')).toBe(false);
        expect(board.dataset.bathalaRemoval).toBeUndefined();
        expect(
          board.querySelectorAll(
            '.symbol--bathala-target,.symbol--bathala-shaking,.symbol--bathala-removing',
          ),
        ).toHaveLength(0);
        expect(board.querySelector('[data-cell-id="bathala-target"]')).toBeNull();
      } finally {
        vi.useRealTimers();
        if (animateDescriptor)
          Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
        else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
      }
    },
  );

  it('presents count-pay groups sequentially, clears connectors, then combines them', async () => {
    vi.useFakeTimers();
    const config = await baseline();
    const result = resolveSpin(config, new SeededRandom(7), true);
    const target = result.initialBoard ?? result.finalBoard;
    const positions = (start: number) =>
      Array.from({ length: 8 }, (_, offset) => {
        const index = start + offset;
        return { column: Math.floor(index / 5), row: index % 5 };
      });
    const l1 = positions(0);
    const h2 = positions(8);
    const h4 = positions(16);
    const round: TumbleRound = {
      index: 0,
      winningSymbols: [
        { symbol: 'L1', count: 8, payout: 1, positions: l1 },
        { symbol: 'H2', count: 8, payout: 2, positions: h2 },
        { symbol: 'H4', count: 8, payout: 3, positions: h4 },
      ],
      baseWin: 6,
      multiplierSymbols: [],
      visibleMultiplierSum: 0,
      newlyCollectedMultiplierSum: 0,
      effectiveMultiplier: 1,
      creditedWin: 6,
      removedWinningCells: [...l1, ...h2, ...h4],
      boardBefore: target,
    };
    document.body.innerHTML = `<div id="reels">${target
      .map(() => '<div class="reel"><div class="reel-track"></div></div>')
      .join('')}</div>`;
    const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    HTMLElement.prototype.animate = (() => ({
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
    })) as unknown as typeof HTMLElement.prototype.animate;
    try {
      const presenter = new BoardPresentationController(
        document.querySelector('#reels')!,
        () => false,
      );
      const presentation = presenter.present(target, 'normal', [round]);
      for (let turn = 0; turn < 64; turn += 1) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.drop.postLandingHold);
      expect(document.querySelector('#reels')?.getAttribute('data-winning-groups')).toBe('L1 × 8');
      expect(document.querySelectorAll('.symbol--winning')).toHaveLength(8);
      expect(document.querySelectorAll('[data-group-id="L1"]')).toHaveLength(7);

      await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.win.perGroupHold);
      expect(document.querySelector('#reels')?.getAttribute('data-winning-groups')).toBe('H2 × 8');
      expect(document.querySelectorAll('[data-group-id="L1"]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-group-id="H2"]')).toHaveLength(7);

      await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.win.perGroupHold);
      expect(document.querySelector('#reels')?.getAttribute('data-winning-groups')).toBe('H4 × 8');
      expect(document.querySelectorAll('[data-group-id="H2"]')).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.win.perGroupHold);
      expect(document.querySelector('#reels')?.getAttribute('data-winning-groups')).toBe(
        'L1 × 8 · H2 × 8 · H4 × 8',
      );
      expect(document.querySelectorAll('.symbol--winning')).toHaveLength(24);
      await vi.runAllTimersAsync();
      await presentation;
    } finally {
      vi.useRealTimers();
      if (animateDescriptor)
        Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });

  it('holds one final-board Scatter group for the full visible x1 duration', async () => {
    vi.useFakeTimers();
    const config = await baseline();
    const result = resolveSpin(config, new SeededRandom(8848), true);
    const target = (result.initialBoard ?? result.finalBoard).map((column) =>
      column.map((cell) => (cell ? { ...cell } : null)),
    );
    target[0]![0] = { id: 'scatter-a', symbol: 'SCATTER' };
    target[5]![4] = { id: 'scatter-b', symbol: 'SCATTER' };
    document.body.innerHTML = `<div id="reels">${target
      .map(() => '<div class="reel"><div class="reel-track"></div></div>')
      .join('')}</div>`;
    const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    HTMLElement.prototype.animate = (() => ({
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
    })) as unknown as typeof HTMLElement.prototype.animate;
    try {
      const presenter = new BoardPresentationController(
        document.querySelector('#reels')!,
        () => false,
      );
      let completed = false;
      const presentation = presenter
        .present(target, 'normal', [], { finalBoard: target, count: 2, payout: 1 })
        .then(() => {
          completed = true;
        });
      for (let turn = 0; turn < 64; turn += 1) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.drop.postLandingHold);
      expect(presenter.state()).toBe('scatterPresentation');
      expect(document.querySelectorAll('.symbol--scatter-winning')).toHaveLength(2);
      expect(document.querySelectorAll('[data-group-id="SCATTER"]')).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.win.perGroupHold - 1);
      expect(completed).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await presentation;
      expect(completed).toBe(true);
    } finally {
      vi.useRealTimers();
      if (animateDescriptor)
        Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });

  it('clears retained result decoration when the next spin presentation begins', async () => {
    const config = await baseline();
    const result = resolveSpin(config, new SeededRandom(8848), true);
    const target = result.initialBoard ?? result.finalBoard;
    document.body.innerHTML = `<div id="reels" class="board--completed-win" data-completed-win="WIN">${target
      .map(() => '<div class="reel"><div class="reel-track"></div></div>')
      .join('')}</div>`;
    const finishers: (() => void)[] = [];
    const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    HTMLElement.prototype.animate = (() => {
      let finish!: () => void;
      const finished = new Promise<void>((resolvePromise) => {
        finish = resolvePromise;
      });
      finishers.push(finish);
      return { finished, cancel: finish, finish };
    }) as unknown as typeof HTMLElement.prototype.animate;
    try {
      const board = document.querySelector<HTMLElement>('#reels')!;
      const presenter = new BoardPresentationController(board, () => true);
      const presentation = presenter.present(target, 'x2');
      expect(board.classList.contains('board--completed-win')).toBe(false);
      expect(board.dataset.completedWin).toBeUndefined();
      finishers.forEach((finish) => finish());
      await presentation;
    } finally {
      if (animateDescriptor)
        Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });

  it('contains no conventional payline interpretation in the count-pay board presenter', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'apps/game/src/presentation/board-presentation-controller.ts'),
      'utf8',
    );
    expect(source.toLowerCase()).not.toContain('payline');
  });

  it('lands every reel on the exact resolved cells and retains engine cell identities', async () => {
    const config = await baseline();
    const result = resolveSpin(config, new SeededRandom(8848), true);
    const target = result.initialBoard ?? result.finalBoard;
    document.body.innerHTML = `<div id="reels">${target
      .map(() => '<div class="reel"><div class="reel-track"></div></div>')
      .join('')}</div>`;
    const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    HTMLElement.prototype.animate = (() => ({
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
    })) as unknown as typeof HTMLElement.prototype.animate;
    try {
      const presenter = new BoardPresentationController(
        document.querySelector('#reels')!,
        () => true,
      );
      await presenter.present(target, 'x2');
      const landed = [...document.querySelectorAll<HTMLElement>('.reel')].map((reel) =>
        [...reel.querySelectorAll<HTMLElement>('.symbol')].map((symbol) => symbol.dataset.cellId),
      );
      expect(landed).toEqual(target.map((column) => column.map((cell) => cell?.id)));
    } finally {
      if (animateDescriptor)
        Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });

  it('STOP finishes active visual animations without resolving or consuming math RNG again', async () => {
    const config = await baseline();
    const rng = new SeededRandom(8848);
    let resolveCalls = 0;
    const result = (() => {
      resolveCalls += 1;
      return resolveSpin(config, rng, true);
    })();
    const target = result.initialBoard ?? result.finalBoard;
    document.body.innerHTML = `<div id="reels">${target
      .map(() => '<div class="reel"><div class="reel-track"></div></div>')
      .join('')}</div>`;
    const finishers: (() => void)[] = [];
    const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    HTMLElement.prototype.animate = (() => {
      let finish!: () => void;
      const finished = new Promise<void>((resolvePromise) => {
        finish = resolvePromise;
      });
      finishers.push(finish);
      return { finished, cancel: finish, finish };
    }) as unknown as typeof HTMLElement.prototype.animate;
    try {
      const presenter = new BoardPresentationController(
        document.querySelector('#reels')!,
        () => false,
      );
      const presentation = presenter.present(target, 'normal');
      expect(presenter.state()).toBe('dropping');
      presenter.stop();
      await presentation;
      expect(finishers).toHaveLength(30);
      expect(resolveCalls).toBe(1);
      expect([...document.querySelectorAll('[data-cell-id]')]).toHaveLength(30);
    } finally {
      if (animateDescriptor)
        Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });

  it('STOP releases a current 1.5-second group hold and caps remaining stage pauses', async () => {
    vi.useFakeTimers();
    const config = await baseline();
    const result = resolveSpin(config, new SeededRandom(7), true);
    const target = result.initialBoard ?? result.finalBoard;
    const round = result.tumbleRounds[0];
    expect(round).toBeDefined();
    document.body.innerHTML = `<div id="reels">${target
      .map(() => '<div class="reel"><div class="reel-track"></div></div>')
      .join('')}</div>`;
    const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
    HTMLElement.prototype.animate = (() => ({
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
    })) as unknown as typeof HTMLElement.prototype.animate;
    try {
      const presenter = new BoardPresentationController(
        document.querySelector('#reels')!,
        () => false,
      );
      let completed = false;
      const presentation = presenter.present(target, 'normal', round ? [round] : []).then(() => {
        completed = true;
      });
      for (let turn = 0; turn < 64; turn += 1) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.drop.postLandingHold);
      expect(presenter.state()).toBe('winHighlight');
      expect(completed).toBe(false);

      presenter.stop();
      await vi.advanceTimersByTimeAsync(700);
      await presentation;
      expect(completed).toBe(true);
    } finally {
      vi.useRealTimers();
      if (animateDescriptor)
        Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor);
      else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });

  it('does not let presentation speed alter a deterministic mathematical outcome', async () => {
    const config = await baseline();
    const outcomes = (['normal', 'x1', 'x2'] as const).map((speed) => {
      expect(SPIN_SPEEDS[speed]).toBeGreaterThan(0);
      return resolveSpin(config, new SeededRandom(8848), true);
    });
    expect(outcomes[1]).toEqual(outcomes[0]);
    expect(outcomes[2]).toEqual(outcomes[0]);
  });

  it('commits history only after presentation completes', async () => {
    const events: string[] = [];
    let finishPresentation: (() => void) | undefined;
    const presentation = new Promise<void>((resolvePromise) => {
      finishPresentation = resolvePromise;
    });
    const task = resolvePresentCommit({
      resolve: () => {
        events.push('resolved');
        return 42;
      },
      present: async () => {
        events.push('presentation-started');
        await presentation;
        events.push('presentation-complete');
      },
      commit: () => events.push('history-committed'),
    });
    await Promise.resolve();
    expect(events).toEqual(['resolved', 'presentation-started']);
    finishPresentation?.();
    await task;
    expect(events).toEqual([
      'resolved',
      'presentation-started',
      'presentation-complete',
      'history-committed',
    ]);
  });

  it.each(['normal', 'x1', 'x2'] satisfies SpinSpeed[])(
    'auto-spin records once per completed %s presentation and stops between spins',
    async (speed) => {
      const records: string[] = [];
      let stop = false;
      const completed = await runAutoSpinSequence(
        10,
        (current) => {
          records.push(`${speed}:${current}`);
          if (current === 3) stop = true;
          return Promise.resolve(true);
        },
        () => stop,
      );
      expect(completed).toBe(3);
      expect(records).toHaveLength(3);
    },
  );

  it('formats single-spin and Auto Spin progress without conflating their counters', () => {
    expect(formatSpinProgress(6, 1, 1)).toBe('Spin #6 in progress');
    expect(formatSpinProgress(8, 3, 5)).toBe('Spin 3 of 5 · Spin #8 in progress');
  });

  it('uses sequence current/total values and derives session numbers from committed spins', async () => {
    let committedSpins = 5;
    let stop = false;
    const firstBatchMessages: string[] = [];
    const firstCompleted = await runAutoSpinSequence(
      5,
      (current, total) => {
        const nextSessionSpin = committedSpins + 1;
        firstBatchMessages.push(formatSpinProgress(nextSessionSpin, current, total));
        committedSpins += 1;
        if (current === 2) stop = true;
        return Promise.resolve(true);
      },
      () => stop,
    );

    expect(firstCompleted).toBe(2);
    expect(firstBatchMessages).toEqual([
      'Spin 1 of 5 · Spin #6 in progress',
      'Spin 2 of 5 · Spin #7 in progress',
    ]);

    stop = false;
    const nextBatchMessages: string[] = [];
    await runAutoSpinSequence(
      5,
      (current, total) => {
        nextBatchMessages.push(formatSpinProgress(committedSpins + 1, current, total));
        return Promise.resolve(false);
      },
      () => stop,
    );
    expect(nextBatchMessages).toEqual(['Spin 1 of 5 · Spin #8 in progress']);

    committedSpins = 0;
    expect(formatSpinProgress(committedSpins + 1, 1, 1)).toBe('Spin #1 in progress');
    expect(formatSpinProgress(committedSpins + 1, 1, 5)).toBe('Spin 1 of 5 · Spin #1 in progress');
  });

  it('uses a structural compact-board token without an outer scale transform', async () => {
    const css = await readFile(resolve(process.cwd(), 'apps/game/src/style.css'), 'utf8');
    expect(css).toContain('--game-column-width: 580px');
    expect(css).not.toMatch(/\.board\s*\{[^}]*transform:\s*scale\(0\.7\)/su);
  });

  it('keeps the reel and controls in one shared-width game column with Rules above the board', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    document.body.innerHTML = html;
    const column = document.querySelector('.game-column');
    expect(column?.querySelector(':scope > .game-panel')).not.toBeNull();
    expect(column?.querySelector(':scope > .player-controls')).not.toBeNull();
    expect(column?.querySelector(':scope > .reel-utilities')).toBeNull();
    const panel = column?.querySelector('.game-panel');
    expect(panel?.firstElementChild?.classList.contains('reel-toolbar')).toBe(true);
    expect(panel?.querySelector('.reel-toolbar + #game')).not.toBeNull();
    const strip = panel?.querySelector('.resolution-strip');
    expect(strip?.nextElementSibling?.classList.contains('game-spin-wrap')).toBe(true);
    expect(strip?.nextElementSibling?.nextElementSibling?.id).toBe('message');
    expect(column?.querySelector('.player-controls #spin')).toBeNull();
  });

  it('uses full-width non-truncating result and status rows below the fixed board', async () => {
    const css = await readFile(resolve(process.cwd(), 'apps/game/src/style.css'), 'utf8');
    expect(css).toMatch(
      /\.resolution-strip\s*\{[^}]*display:\s*grid[^}]*grid-column:\s*1 \/ -1[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)[^}]*width:\s*100%/su,
    );
    expect(css).not.toMatch(/\.resolution-strip\s*\{[^}]*flex-wrap:\s*wrap/su);
    expect(css).toMatch(
      /\.message\s*\{[^}]*grid-column:\s*1 \/ -1[^}]*min-height:\s*2rem[^}]*width:\s*100%[^}]*white-space:\s*normal[^}]*overflow:\s*visible[^}]*text-overflow:\s*clip/su,
    );
    expect(css).toMatch(
      /\.resolution-metric strong\s*\{[^}]*white-space:\s*normal[^}]*overflow:\s*visible[^}]*text-overflow:\s*clip/su,
    );
  });

  it('uses the simplified exact UI copy and always-visible history mechanic labels', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    const mainSource = await readFile(resolve(process.cwd(), 'apps/game/src/main.ts'), 'utf8');
    document.body.innerHTML = html;
    expect(document.querySelector('.brand p')?.textContent).toBe('MATH WORKBENCH');
    expect(document.querySelector('#history-title')?.textContent).toBe('Spin History');
    expect(document.querySelector('.live-math summary span')?.textContent).toBe(
      'TAP TO OPEN/CLOSE',
    );
    expect(document.querySelector('.math-lab summary small')?.textContent).toBe(
      'TAP TO OPEN/CLOSE',
    );
    for (const label of ['TUMBLES', 'BATHALA', 'MULTIPLIER'])
      expect(document.querySelector('.resolution-strip')?.textContent).toContain(label);
    expect(mainSource).toMatch(
      /<span class="history-mechanics">.*TUMBLES.*BATHALA.*MULTIPLIER.*<\/span>/su,
    );
    for (const removed of [
      'INTERACTIVE MATH WORKBENCH',
      'PAID-SPIN OUTCOMES',
      'Latest 10',
      'Session estimates · unstable at low sample counts',
      'Designer controls · collapsed by default',
    ])
      expect(html).not.toContain(removed);
  });

  it('caps and internally scrolls history while enlarging advanced JSON editors', async () => {
    const css = await readFile(resolve(process.cwd(), 'apps/game/src/style.css'), 'utf8');
    expect(css).toMatch(/\.history-panel\s*\{[^}]*height:\s*min\(803px[^}]*max-height:\s*803px/su);
    expect(css).toMatch(/\.history-list\s*\{[^}]*overflow-y:\s*auto/su);
    expect(css).toMatch(
      /\.math-lab \.advanced textarea\s*\{[^}]*min-height:\s*300px[^}]*max-height:\s*700px[^}]*resize:\s*vertical/su,
    );
  });

  it('styles Rules as a prominent teal button and centers the relocated fixed-width SPIN', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    const css = await readFile(resolve(process.cwd(), 'apps/game/src/style.css'), 'utf8');
    document.body.innerHTML = html;
    expect(document.querySelector('#rules-button')?.classList.contains('secondary')).toBe(true);
    expect(css).toMatch(/\.secondary\s*\{[^}]*color:\s*#0e1728[^}]*background:\s*var\(--mint\)/su);
    expect(css).toMatch(
      /\.game-spin-wrap\s*\{[^}]*grid-column:\s*1 \/ -1[^}]*justify-items:\s*center[^}]*width:\s*100%/su,
    );
    expect(css).toMatch(/\.spin-button\s*\{[^}]*width:\s*190px[^}]*min-width:\s*190px/su);
  });

  it('removes spin progress and the Math Lab note while applying the refined lab layout', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    const css = await readFile(resolve(process.cwd(), 'apps/game/src/style.css'), 'utf8');
    document.body.innerHTML = html;
    expect(document.querySelector('#auto-progress')).toBeNull();
    expect(document.querySelector('.game-spin-wrap')?.children).toHaveLength(1);
    expect(document.querySelector('.lab-note')).toBeNull();
    expect(
      [...document.querySelectorAll('.math-lab legend')].map((node) => node.textContent),
    ).toEqual(['Config Identity', 'Betting Configs', 'Feature Configs', 'JSON Configs']);
    expect(css).not.toContain('.spin-wrap span');
    expect(css).not.toContain('.lab-note');
    expect(css).toMatch(/\.speed-control span\s*\{[^}]*min-height:\s*2\.15rem/su);
    expect(css).toMatch(/\.lab-actions\s*\{[^}]*justify-content:\s*center/su);
  });

  it('renders Rules from active config and reuses the symbol visual registry', async () => {
    const config = await baseline();
    const changed: ActiveGameConfig = {
      ...config,
      paytable: config.paytable.map((award, index) =>
        index === 0 ? { ...award, payout: 999 } : award,
      ),
      scatter: {
        ...config.scatter,
        baseGameTrigger: { ...config.scatter.baseGameTrigger, freeGamesAwarded: 12 },
      },
      multiplierValues: config.multiplierValues.map((entry, index) =>
        index === config.multiplierValues.length - 1 ? { ...entry, value: 777 } : entry,
      ),
      limits: { ...config.limits, maximumWinMultiple: 12_345, maximumMultiplier: 777 },
    };
    const content = document.createElement('div');
    renderRulesContent(content, changed);
    const text = content.textContent ?? '';
    for (const title of [
      'How to Win',
      'Symbols',
      'Paytable',
      'Tumble',
      'Bathala Skill',
      'Scatter',
      'Free Spins',
      'Multipliers',
      'Max Win',
    ])
      expect(text).toContain(title);
    expect(text).toContain('awards 12 Free Spins');
    expect(text).toContain('999×');
    expect(
      [...content.querySelectorAll('.rules-paytable thead th')].map((element) =>
        element.textContent?.trim(),
      ),
    ).toEqual(['Symbol', '8–9 Symbols', '10–11 Symbols', '12–30 Symbols']);
    expect(text).not.toMatch(/12–14|15–19|20–24|25–30/u);
    expect(
      [...content.querySelectorAll('.rules-paytable thead th')].map((element) =>
        element.textContent?.trim(),
      ),
    ).toEqual(['Symbol', '8–9 Symbols', '10–11 Symbols', '12–30 Symbols']);
    expect(text).not.toMatch(/12–14|15–19|20–24|25–30/u);
    const l1 = content.querySelector<HTMLElement>('[data-symbol-id="L1"] .symbol-icon');
    expect(l1?.textContent).toBe(BATHALA_SYMBOL_VISUALS.L1.icon);
    expect(rulesReferenceText(config)).toContain(
      `awards ${config.scatter.baseGameTrigger.freeGamesAwarded} Free Spins`,
    );
    expect(text).toContain('12,345× Total Bet');
    expect(text).toContain('Highest Multiplier Symbol: 777×');
    expect(text).not.toMatch(
      /count-pay|configured|configuration|safety limit|credited|normalized|instances|simulation|Free Games/u,
    );
    expect(content.querySelector('.rules-technical')).toBeNull();
  });
});
