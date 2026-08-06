import { resolveSpin } from '@lucky/math-engine';
import type { RandomSource } from '@lucky/math-engine';
import type { RuntimeGameConfig } from '@lucky/shared-types';
import type { SpinDiagnosticsRecorder } from '../diagnostics/types.js';
import type { SlotScene } from '../game/scenes/SlotScene.js';
import { PRESENTATION_TIMING } from '../game/presentation-timing.js';

function element<T extends HTMLElement>(id: string): T {
  const found = document.querySelector<T>(`#${id}`);
  if (!found) throw new Error(`Required game control '#${id}' is missing`);
  return found;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown spin error';
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function animateCreditValue(
  target: HTMLElement,
  value: number,
  wait: (milliseconds: number) => Promise<void> = delay,
): Promise<void> {
  if (value <= 0) {
    target.textContent = '0';
    return;
  }
  const frames = 8;
  const frameDelay = Math.max(1, Math.floor(PRESENTATION_TIMING.payoutCountUp / frames));
  for (let frame = 1; frame <= frames; frame += 1) {
    target.textContent = String(Math.round((value * frame) / frames));
    await wait(frameDelay);
  }
}

export function attachController(
  config: RuntimeGameConfig,
  scene: SlotScene,
  rng: RandomSource,
  diagnostics: SpinDiagnosticsRecorder,
  wait: (milliseconds: number) => Promise<void> = delay,
): () => void {
  const button = element<HTMLButtonElement>('spin');
  const creditsText = element<HTMLElement>('credits');
  const betText = element<HTMLElement>('bet');
  const winText = element<HTMLElement>('win');
  const message = element<HTMLElement>('message');
  let credits = 1000;
  let spinning = false;
  let disposed = false;

  betText.textContent = String(config.totalBetCredits);
  message.textContent = 'Ready. Press Space or Spin.';

  const spin = async (): Promise<void> => {
    if (disposed || spinning || credits < config.totalBetCredits) return;
    spinning = true;
    button.disabled = true;
    let debited = false;
    try {
      const creditsBefore = credits;
      // Resolve the paid spin and its entire bounded feature before presentation begins.
      const result = resolveSpin(config, rng);
      credits -= config.totalBetCredits;
      debited = true;
      creditsText.textContent = String(credits);
      winText.textContent = '0';
      message.textContent = 'Base spin';
      await scene.present(result);

      if (result.uncappedBaseWinCredits > 0) {
        message.textContent = `Base win ${result.uncappedBaseWinCredits}`;
        await animateCreditValue(winText, result.uncappedBaseWinCredits, wait);
        await wait(PRESENTATION_TIMING.baseWinHold);
      } else if (!result.feature) {
        message.textContent = 'No win';
      }

      if (result.feature) {
        await wait(PRESENTATION_TIMING.freeSpinTransition);
        let featureSubtotal = 0;
        for (const freeSpin of result.feature.freeSpins) {
          if (disposed) return;
          const remaining = result.feature.totalPlayedSpins - freeSpin.spinIndex;
          const retrigger =
            freeSpin.retriggeredFreeSpins > 0
              ? ` (+${freeSpin.retriggeredFreeSpins} retrigger)`
              : '';
          message.textContent = `Free Spin ${freeSpin.spinIndex}/${result.feature.totalPlayedSpins} — ${remaining} remaining${retrigger}`;
          await scene.present(freeSpin, 'free-spin');
          featureSubtotal += freeSpin.winCredits;
          winText.textContent = String(featureSubtotal);
          if (freeSpin.retriggeredFreeSpins > 0) {
            message.textContent = `Retrigger +${freeSpin.retriggeredFreeSpins} · feature subtotal ${featureSubtotal}`;
            await wait(PRESENTATION_TIMING.retriggerDisplay);
          } else {
            message.textContent = `Feature subtotal ${featureSubtotal}`;
          }
        }
        message.textContent = `Free Spins complete — feature win ${result.uncappedFeatureWinCredits}`;
        await wait(PRESENTATION_TIMING.featureCompletion);
      }

      if (disposed) return;
      // One aggregate credit boundary prevents free-spin and total-win double crediting.
      credits += result.totalWinCredits;
      creditsText.textContent = String(credits);
      if (result.totalWinCredits > 0)
        await animateCreditValue(winText, result.totalWinCredits, wait);
      else winText.textContent = '0';
      diagnostics.recordCompletedSpin({
        timestamp: new Date().toISOString(),
        betCredits: config.totalBetCredits,
        uncappedBaseWinCredits: result.uncappedBaseWinCredits,
        uncappedFeatureWinCredits: result.uncappedFeatureWinCredits,
        uncappedTotalWinCredits: result.uncappedTotalWinCredits,
        creditedTotalWinCredits: result.totalWinCredits,
        capReductionCredits: result.capReductionCredits,
        creditsBefore,
        creditsAfter: credits,
        featureTriggered: result.featureTriggered,
        scatterCount: result.scatterCount,
        initialFreeSpins: result.feature?.initialAwardedSpins ?? 0,
        totalFreeSpinsPlayed: result.feature?.totalPlayedSpins ?? 0,
        totalRetriggeredSpins: result.feature?.totalRetriggeredSpins ?? 0,
        retriggerCount: result.feature?.retriggerCount ?? 0,
        maximumWinApplied: result.maximumWinApplied,
        feature: result.feature,
        outcome: {
          visibleWindow: result.window,
          reelStops: result.stops,
          lineWins: result.lineWins,
        },
      });
      message.textContent =
        result.totalWinCredits === 0
          ? 'No win'
          : result.featureTriggered
            ? `Final win ${result.totalWinCredits} credits (base ${result.uncappedBaseWinCredits} + feature ${result.uncappedFeatureWinCredits}).`
            : `Win ${result.totalWinCredits} credits.`;
    } catch (error: unknown) {
      console.error('LUCKY888 spin failed', error);
      if (!disposed) {
        if (debited) credits += config.totalBetCredits;
        creditsText.textContent = String(credits);
        winText.textContent = '0';
        message.textContent = `Spin failed: ${errorMessage(error)}`;
      }
    } finally {
      spinning = false;
      if (!disposed) button.disabled = credits < config.totalBetCredits;
    }
  };

  const clickHandler = (): void => {
    void spin();
  };
  const keyHandler = (event: KeyboardEvent): void => {
    if (event.code !== 'Space') return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, input, select, textarea, a')) return;
    event.preventDefault();
    void spin();
  };
  button.addEventListener('click', clickHandler);
  window.addEventListener('keydown', keyHandler);

  return () => {
    if (disposed) return;
    disposed = true;
    button.removeEventListener('click', clickHandler);
    window.removeEventListener('keydown', keyHandler);
    button.disabled = true;
  };
}
