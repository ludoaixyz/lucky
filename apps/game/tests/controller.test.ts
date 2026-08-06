// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RandomSource } from '@lucky/math-engine';
import type { RuntimeGameConfig } from '@lucky/shared-types';
import type { SpinDiagnosticsRecorder } from '../src/diagnostics/types.js';
import type { SlotScene } from '../src/game/scenes/SlotScene.js';
import { attachController } from '../src/ui/controller.js';

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
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  document.body.innerHTML = `
    <strong id="credits">1000</strong><strong id="bet">5</strong>
    <strong id="win">0</strong><p id="message"></p><button id="spin">Spin</button>`;
});

describe('paid-spin controller boundary', () => {
  it('deducts once, stays busy through feature presentation, and credits once', async () => {
    const releases: Array<() => void> = [];
    const present = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        }),
    );
    const scene = { present } as unknown as SlotScene;
    const recordCompletedSpin = vi.fn<SpinDiagnosticsRecorder['recordCompletedSpin']>();
    const dispose = attachController(
      config,
      scene,
      new SequenceRandom([1, 1, 1, 0, 0, 0, 0, 0, 0]),
      { recordCompletedSpin },
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

    expect(document.querySelector('#credits')?.textContent).toBe('1015');
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
    } as unknown as SlotScene;
    const dispose = attachController(config, scene, new SequenceRandom([0, 0, 0]), {
      recordCompletedSpin,
    });
    document.querySelector<HTMLButtonElement>('#spin')?.click();
    await settle();
    expect(document.querySelector('#credits')?.textContent).toBe('1000');
    expect(document.querySelector('#message')?.textContent).toContain('presentation failed');
    expect(recordCompletedSpin).not.toHaveBeenCalled();
    dispose();
  });

  it('starts from Space outside controls and removes the keyboard listener on disposal', async () => {
    const present = vi.fn(() => Promise.resolve());
    const recordCompletedSpin = vi.fn<SpinDiagnosticsRecorder['recordCompletedSpin']>();
    const dispose = attachController(
      config,
      { present } as unknown as SlotScene,
      new SequenceRandom([0, 0, 0]),
      { recordCompletedSpin },
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
});
