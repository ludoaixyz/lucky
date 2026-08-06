import { resolveSpin } from '@lucky/math-engine';
import type { RandomSource } from '@lucky/math-engine';
import type { RuntimeGameConfig } from '@lucky/shared-types';
import type { SlotScene } from '../game/scenes/SlotScene.js';
import type { SpinDiagnosticsRecorder } from '../diagnostics/types.js';

function element<T extends HTMLElement>(id: string): T {
  const found = document.querySelector<T>(`#${id}`);
  if (!found) throw new Error(`Required game control '#${id}' is missing`);
  return found;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown spin error';
}

export function attachController(
  config: RuntimeGameConfig,
  scene: SlotScene,
  rng: RandomSource,
  diagnostics: SpinDiagnosticsRecorder,
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
      const result = resolveSpin(config, rng);
      credits -= config.totalBetCredits;
      debited = true;
      creditsText.textContent = String(credits);
      winText.textContent = '0';
      message.textContent = 'Presenting resolved result…';
      await scene.present(result);
      if (disposed) return;
      credits += result.winCredits;
      creditsText.textContent = String(credits);
      winText.textContent = String(result.winCredits);
      diagnostics.recordCompletedSpin({
        timestamp: new Date().toISOString(),
        betCredits: config.totalBetCredits,
        winCredits: result.winCredits,
        creditsBefore,
        creditsAfter: credits,
        featureTriggered: result.featureTriggered,
        outcome: {
          visibleWindow: result.window,
          reelStops: result.stops,
          lineWins: result.lineWins,
        },
      });
      message.textContent = result.featureTriggered
        ? `Win ${result.winCredits}. Illustrative feature trigger.`
        : `Win ${result.winCredits} credits.`;
    } catch (error: unknown) {
      console.error('Lucky888 spin failed', error);
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
