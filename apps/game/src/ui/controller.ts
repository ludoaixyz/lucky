import { resolveSpin } from '@lucky/math-engine';
import type { RandomSource } from '@lucky/math-engine';
import type { RuntimeGameConfig } from '@lucky/shared-types';
import type { SlotScene } from '../game/scenes/SlotScene.js';

function element<T extends HTMLElement>(id: string): T {
  const found = document.querySelector<T>(`#${id}`);
  if (!found) throw new Error(`Missing UI element #${id}`);
  return found;
}

export function attachController(
  config: RuntimeGameConfig,
  scene: SlotScene,
  rng: RandomSource,
): void {
  const button = element<HTMLButtonElement>('spin');
  const creditsText = element<HTMLElement>('credits');
  const winText = element<HTMLElement>('win');
  const message = element<HTMLElement>('message');
  let credits = 1000;
  let spinning = false;

  const spin = async (): Promise<void> => {
    if (spinning || credits < config.totalBetCredits) return;
    spinning = true;
    button.disabled = true;
    credits -= config.totalBetCredits;
    creditsText.textContent = String(credits);
    winText.textContent = '0';
    message.textContent = 'Presenting resolved result…';
    const result = resolveSpin(config, rng);
    await scene.present(result);
    credits += result.winCredits;
    creditsText.textContent = String(credits);
    winText.textContent = String(result.winCredits);
    message.textContent = result.featureTriggered
      ? `Win ${result.winCredits}. Illustrative feature trigger.`
      : `Win ${result.winCredits} credits.`;
    spinning = false;
    button.disabled = credits < config.totalBetCredits;
  };
  button.addEventListener('click', () => {
    void spin();
  });
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && event.target === document.body) {
      event.preventDefault();
      void spin();
    }
  });
}
