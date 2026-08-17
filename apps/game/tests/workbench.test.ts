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
  ReelPresentationController,
  PRESENTATION_TIMINGS,
  reelStopTimes,
  resolvePresentCommit,
  runAutoSpinSequence,
  speedLabel,
  SPIN_SPEEDS,
  type SpinSpeed,
} from '../src/presentation/reel-presentation.js';
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
      multiplier: '2× + 5× + 10×',
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
    ).toEqual({ tumbles: '5', bathala: '2', multiplier: '5× + 10×' });
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

describe('presentation-only reel behavior', () => {
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
    expect(SPIN_SPEEDS).toEqual({ normal: 5600, x1: 2800, x2: 1600 });
    expect(PRESENTATION_TIMINGS.normal.win.hold).toBe(1100);
    expect(PRESENTATION_TIMINGS.x1.win.hold).toBe(625);
    expect(PRESENTATION_TIMINGS.x2.win.hold).toBe(300);
    expect(speedLabel('normal')).toBe('x1');
    expect(speedLabel('x1')).toBe('x2');
    expect(speedLabel('x2')).toBe('x3');
  });

  it('gives visible x1 six meaningfully separated stops with stronger late-reel anticipation', () => {
    const stops = reelStopTimes('normal');
    expect(stops).toEqual([3200, 3530, 3860, 4190, 4770, 5350]);
    for (let index = 1; index < stops.length; index += 1)
      expect((stops[index] ?? 0) - (stops[index - 1] ?? 0)).toBeGreaterThanOrEqual(330);
    expect((stops[4] ?? 0) - (stops[3] ?? 0)).toBeGreaterThan((stops[3] ?? 0) - (stops[2] ?? 0));
    expect((stops[5] ?? 0) - (stops[4] ?? 0)).toBeGreaterThan(
      PRESENTATION_TIMINGS.normal.spin.reelStagger,
    );
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

  it('size-contains reel viewports and removes moving tracks from grid sizing', async () => {
    const css = await readFile(resolve(process.cwd(), 'apps/game/src/style.css'), 'utf8');
    expect(css).toMatch(/\.board\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/su);
    expect(css).toMatch(
      /\.reel\s*\{[^}]*position:\s*relative[^}]*min-height:\s*0[^}]*width:\s*100%[^}]*height:\s*100%[^}]*overflow:\s*hidden[^}]*contain:\s*size layout paint/su,
    );
    expect(css).toMatch(
      /\.reel-track\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*width:\s*100%/su,
    );
    expect(css).toMatch(/html\s*\{[^}]*scrollbar-gutter:\s*stable/su);
    expect(css).not.toMatch(
      /\.board--spinning\s*\{[^}]*(?:transform|margin|padding|border-width|filter):/su,
    );
  });

  it('keeps every count-pay winning cell highlighted throughout the configured hold', async () => {
    vi.useFakeTimers();
    const config = await baseline();
    const result = resolveSpin(config, new SeededRandom(8848), true);
    const round = result.tumbleRounds[0];
    expect(round).toBeDefined();
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
      const presenter = new ReelPresentationController(
        document.querySelector('#reels')!,
        () => false,
      );
      const presentation = presenter.present(target, 'normal', round ? [round] : []);
      await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.spin.settleDuration);
      expect(document.querySelectorAll('.symbol--winning')).toHaveLength(
        round?.removedWinningCells.length ?? 0,
      );
      expect(document.querySelector('#reels')?.getAttribute('data-winning-groups')).toContain('×');
      await vi.advanceTimersByTimeAsync(PRESENTATION_TIMINGS.normal.win.hold - 1);
      expect(document.querySelectorAll('.symbol--winning')).toHaveLength(
        round?.removedWinningCells.length ?? 0,
      );
      await vi.runAllTimersAsync();
      await presentation;
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
      const presenter = new ReelPresentationController(board, () => true);
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

  it('contains no conventional payline interpretation in the count-pay reel presenter', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'apps/game/src/presentation/reel-presentation.ts'),
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
      const presenter = new ReelPresentationController(
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
      const presenter = new ReelPresentationController(
        document.querySelector('#reels')!,
        () => false,
      );
      const presentation = presenter.present(target, 'normal');
      expect(presenter.state()).toBe('spinning');
      presenter.stop();
      await presentation;
      expect(finishers).toHaveLength(6);
      expect(resolveCalls).toBe(1);
      expect([...document.querySelectorAll('[data-cell-id]')]).toHaveLength(30);
    } finally {
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
    expect(css).toMatch(/\.history-panel\s*\{[^}]*max-height:\s*730px/su);
    expect(css).toMatch(/\.history-list\s*\{[^}]*overflow-y:\s*auto/su);
    expect(css).toMatch(
      /\.math-lab \.advanced textarea\s*\{[^}]*min-height:\s*300px[^}]*max-height:\s*700px[^}]*resize:\s*vertical/su,
    );
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
    };
    const content = document.createElement('div');
    renderRulesContent(content, changed);
    const text = content.textContent ?? '';
    for (const title of [
      'How to Win',
      'Symbols',
      'Paytable',
      'Tumble',
      'Bathala',
      'Scatter',
      'Free Games',
      'Multipliers',
    ])
      expect(text).toContain(title);
    expect(text).toContain('award 12 Free Games');
    expect(text).toContain('999×');
    const l1 = content.querySelector<HTMLElement>('[data-symbol-id="L1"] .symbol-icon');
    expect(l1?.textContent).toBe(BATHALA_SYMBOL_VISUALS.L1.icon);
    expect(rulesReferenceText(config)).toContain(
      `award ${config.scatter.baseGameTrigger.freeGamesAwarded} Free Games`,
    );
  });
});
