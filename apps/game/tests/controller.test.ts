// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RandomSource } from '@lucky/math-engine';
import type { RuntimeGameConfig } from '@lucky/shared-types';
import type { SpinDiagnosticsRecorder } from '../src/diagnostics/types.js';
import type { SlotScene } from '../src/game/scenes/SlotScene.js';
import {
  attachController,
  BET_OPTIONS,
  scaleConfigForBet,
  SPIN_COUNT_OPTIONS,
} from '../src/ui/controller.js';
import { Localization } from '../src/i18n/index.js';

class SequenceRandom implements RandomSource {
  private index = 0;
  constructor(private readonly values: readonly number[]) {}
  nextUint32(): number {
    const value = this.values[this.index] ?? 0;
    this.index += 1;
    return value >>> 0;
  }
  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }
  nextInt(exclusiveMaximum: number): number {
    return this.nextUint32() % exclusiveMaximum;
  }
}

const config: RuntimeGameConfig = {
  schemaVersion: '1.0.0',
  gameId: 'lucky888',
  gameName: 'LUCKY888',
  gameVersion: '1.0.0',
  configurationId: 'controller-test-v1',
  selectedRtpProfile: 'controller-test-v1',
  payModel: 'fixed-paylines-left-to-right',
  reelCount: 3,
  visibleRows: 1,
  lineBetCredits: 1,
  totalBetCredits: 5,
  maximumWinCredits: 100,
  maximumWinScope: 'paid-spin-including-feature',
  symbols: [
    { id: 'A', name: 'A', category: 'regular', display: 'A' },
    { id: 'S', name: 'Scatter', category: 'scatter', display: 'S' },
    { id: 'W', name: 'Wild', category: 'wild', display: 'W' },
  ],
  reelStrips: [
    ['A', 'S'],
    ['A', 'S'],
    ['A', 'S'],
  ],
  freeSpinReelStrips: [
    ['A', 'S'],
    ['A', 'S'],
    ['A', 'S'],
  ],
  paylines: [{ id: 'L1', rows: [0, 0, 0] }],
  paytable: [{ symbolId: 'A', count: 3, awardCredits: 10 }],
  bonus: {
    schemaVersion: '1.1.0',
    enabled: true,
    triggerSymbolId: 'S',
    triggerEvaluation: 'anywhere',
    minimumCount: 3,
    awards: [{ count: 3, freeSpins: 2 }],
    freeSpinMultiplier: 1,
    retriggerEnabled: false,
    retriggerAwards: [],
    maximumFeatureSpins: 10,
    maximumRetriggers: 0,
    scatterPaysCredits: false,
    useAlternateReelStrips: false,
    useAlternatePaytable: false,
  },
  rules: {
    schemaVersion: '1.0.0',
    wild: {
      symbolId: 'W',
      enabled: true,
      substitutesFor: ['A'],
      substitutesForWild: true,
      substitutesForScatter: false,
      hasOwnLinePay: false,
      multiplier: 1,
      allWildCombinationRule: 'no-pay',
    },
    lineAwardRules: {
      direction: 'left-to-right',
      activePaylines: 1,
      lineBetCredits: 1,
      totalBetCredits: 5,
      awardScaling: 'award-credits-per-line-bet',
      matchRule: 'consecutive-from-leftmost-reel',
      winSelection: 'highest-award-per-payline',
      multiplePaylinesAccumulate: true,
      nestedAwardsAccumulate: false,
      scatterBreaksLineMatch: true,
    },
    scatter: {
      symbolId: 'S',
      enabled: true,
      evaluation: 'anywhere',
      countMode: 'visible-symbols',
      maximumCountMode: 'one-visible-scatter-per-reel',
      substitutesOnLines: false,
      wildSubstitutesForScatter: false,
      scatterSubstitutesForRegular: false,
      directCreditPaysEnabled: false,
      triggersFeature: true,
    },
  },
};

const settle = async (): Promise<void> => {
  for (let turn = 0; turn < 256; turn += 1) await Promise.resolve();
};

beforeEach(() => {
  document.body.innerHTML = `
    <strong id="credits">1000</strong><strong id="bet">5</strong>
    <strong id="win">0</strong><p id="message"></p><button id="spin">Spin</button>
    <input id="speed-control" value="1"><output id="speed-value"></output>
    <input id="bet-control" value="0"><output id="bet-value"></output>
    <input id="spins-control" value="0"><output id="spins-value"></output>`;
});

describe('paid-spin controller boundary', () => {
  it('exposes the required bet and sequential-spin selections', () => {
    expect(BET_OPTIONS).toEqual([5, 10, 20, 50, 100]);
    expect(SPIN_COUNT_OPTIONS).toEqual([1, 5, 10, 15, 20]);
  });

  it('deducts once, stays busy through feature presentation, and credits once', async () => {
    const releases: Array<() => void> = [];
    const present = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
    const scene = { present, setPresentationSpeed: vi.fn() } as unknown as SlotScene;
    const recordCompletedSpin = vi.fn<SpinDiagnosticsRecorder['recordCompletedSpin']>();
    const dispose = attachController(
      config,
      scene,
      new SequenceRandom([1, 1, 1, 0, 0, 0, 0, 0, 0]),
      { recordCompletedSpin },
      new Localization('en-US'),
      () => Promise.resolve(),
    );
    document.querySelector<HTMLButtonElement>('#spin')?.click();
    await settle();
    expect(document.querySelector('#credits')?.textContent).toBe('995');
    expect(document.querySelector<HTMLButtonElement>('#spin')?.disabled).toBe(true);
    document.querySelector<HTMLButtonElement>('#spin')?.click();
    expect(present).toHaveBeenCalledTimes(1);

    releases.shift()?.();
    await settle();
    expect(present).toHaveBeenCalledTimes(2);
    releases.shift()?.();
    await settle();
    expect(present).toHaveBeenCalledTimes(3);
    releases.shift()?.();
    await settle();

    expect(document.querySelector('#credits')?.textContent).toBe('1,015');
    expect(document.querySelector('#win')?.textContent).toBe('20');
    expect(recordCompletedSpin).toHaveBeenCalledOnce();
    expect(recordCompletedSpin).toHaveBeenCalledWith(
      expect.objectContaining({
        betCredits: 5,
        uncappedBaseWinCredits: 0,
        uncappedFeatureWinCredits: 20,
        uncappedTotalWinCredits: 20,
        creditedTotalWinCredits: 20,
        totalFreeSpinsPlayed: 2,
      }),
    );
    expect(document.querySelector<HTMLButtonElement>('#spin')?.disabled).toBe(false);
    dispose();
  });

  it('refunds a failed presentation and does not record a completed spin', async () => {
    const recordCompletedSpin = vi.fn<SpinDiagnosticsRecorder['recordCompletedSpin']>();
    const scene = {
      present: vi.fn(() => Promise.reject(new Error('presentation failed'))),
      setPresentationSpeed: vi.fn(),
    } as unknown as SlotScene;
    const dispose = attachController(
      config,
      scene,
      new SequenceRandom([0, 0, 0]),
      {
        recordCompletedSpin,
      },
      new Localization('en-US'),
      () => Promise.resolve(),
    );
    document.querySelector<HTMLButtonElement>('#spin')?.click();
    await settle();
    expect(document.querySelector('#credits')?.textContent).toBe('1,000');
    expect(document.querySelector('#message')?.textContent).toBe('Spin failed.');
    expect(recordCompletedSpin).not.toHaveBeenCalled();
    dispose();
  });

  it('starts from Space outside controls and removes the keyboard listener on disposal', async () => {
    const present = vi.fn(() => Promise.resolve());
    const recordCompletedSpin = vi.fn<SpinDiagnosticsRecorder['recordCompletedSpin']>();
    const dispose = attachController(
      config,
      { present, setPresentationSpeed: vi.fn() },
      new SequenceRandom([0, 0, 0]),
      { recordCompletedSpin },
      new Localization('en-US'),
      () => Promise.resolve(),
    );

    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await settle();
    expect(present).toHaveBeenCalledOnce();
    expect(recordCompletedSpin).toHaveBeenCalledOnce();

    dispose();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    await settle();
    expect(present).toHaveBeenCalledOnce();
  });

  it('scales bets and awards while running a selected batch sequentially', async () => {
    const present = vi.fn(() => Promise.resolve());
    const recordCompletedSpin = vi.fn<SpinDiagnosticsRecorder['recordCompletedSpin']>();
    const setPresentationSpeed = vi.fn();
    const localization = new Localization('en-US');
    const dispose = attachController(
      config,
      { present, setPresentationSpeed },
      new SequenceRandom(Array<number>(15).fill(0)),
      { recordCompletedSpin },
      localization,
      () => Promise.resolve(),
    );
    const betControl = document.querySelector<HTMLInputElement>('#bet-control');
    const spinsControl = document.querySelector<HTMLInputElement>('#spins-control');
    if (!betControl || !spinsControl) throw new Error('Missing test controls');
    betControl.value = '1';
    betControl.dispatchEvent(new Event('input'));
    spinsControl.value = '1';
    spinsControl.dispatchEvent(new Event('input'));

    document.querySelector<HTMLButtonElement>('#spin')?.click();
    await settle();

    expect(present).toHaveBeenCalledTimes(5);
    expect(recordCompletedSpin).toHaveBeenCalledTimes(5);
    expect(recordCompletedSpin).toHaveBeenLastCalledWith(
      expect.objectContaining({ betCredits: 10, creditedTotalWinCredits: 20 }),
    );
    expect(document.querySelector('#credits')?.textContent).toBe('1,050');
    expect(document.querySelector('#bet')?.textContent).toBe('10');
    expect(document.querySelector<HTMLButtonElement>('#spin')?.disabled).toBe(false);
    expect(document.querySelector('#message')?.textContent).toBe(
      '5/5 spins completed · Spin 5/5 · Won $20.',
    );

    localization.setLocale('pt-BR');
    expect(document.querySelector('#message')?.textContent).toBe(
      '5/5 giros concluídos · Giro 5/5 · Ganhou $20.',
    );
    expect(document.querySelector('#credits')?.textContent).toBe('1.050');
    expect(recordCompletedSpin).toHaveBeenCalledTimes(5);
    expect(betControl.value).toBe('1');
    expect(spinsControl.value).toBe('1');
    dispose();
  });

  it('switches locale during a sequence without restarting or changing its selections', async () => {
    let releasePresentation = (): void => undefined;
    const present = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releasePresentation = resolve;
        }),
    );
    const localization = new Localization('en-US');
    const dispose = attachController(
      config,
      { present, setPresentationSpeed: vi.fn() },
      new SequenceRandom(Array<number>(15).fill(0)),
      { recordCompletedSpin: vi.fn() },
      localization,
      () => Promise.resolve(),
    );
    const spinsControl = document.querySelector<HTMLInputElement>('#spins-control');
    if (!spinsControl) throw new Error('Missing spins control');
    spinsControl.value = '1';
    spinsControl.dispatchEvent(new Event('input'));

    document.querySelector<HTMLButtonElement>('#spin')?.click();
    await settle();
    expect(present).toHaveBeenCalledOnce();
    expect(document.querySelector('#message')?.textContent).toBe('Spin 1 of 5.');

    localization.setLocale('zh-CN');
    expect(document.querySelector('#message')?.textContent).toBe('第 1/5 次旋转。');
    expect(document.querySelector('#credits')?.textContent).toBe('995');
    expect(spinsControl.value).toBe('1');
    expect(document.querySelector<HTMLButtonElement>('#spin')?.disabled).toBe(true);
    expect(present).toHaveBeenCalledOnce();

    dispose();
    releasePresentation();
    await settle();
  });

  it('applies selectable presentation speed and scales the cap with the bet', () => {
    const scaled = scaleConfigForBet(config, 100);
    expect(scaled.lineBetCredits).toBe(20);
    expect(scaled.totalBetCredits).toBe(100);
    expect(scaled.maximumWinCredits).toBe(2000);
    expect(scaled.rules.lineAwardRules).toMatchObject({
      lineBetCredits: 20,
      totalBetCredits: 100,
    });

    const setPresentationSpeed = vi.fn();
    const localization = new Localization('en-US');
    const dispose = attachController(
      config,
      { present: vi.fn(() => Promise.resolve()), setPresentationSpeed },
      new SequenceRandom([]),
      { recordCompletedSpin: vi.fn() },
      localization,
      () => Promise.resolve(),
    );
    const speedControl = document.querySelector<HTMLInputElement>('#speed-control');
    if (!speedControl) throw new Error('Missing speed control');
    speedControl.value = '3';
    speedControl.dispatchEvent(new Event('input'));
    expect(setPresentationSpeed).toHaveBeenLastCalledWith(3);
    expect(document.querySelector('#speed-value')?.textContent).toBe('3.0×');
    localization.setLocale('zh-CN');
    expect(speedControl.getAttribute('aria-valuetext')).toBe('3× 速度');
    expect(document.querySelector('#spin')?.textContent).toBe('SPIN');
    dispose();
  });
});
