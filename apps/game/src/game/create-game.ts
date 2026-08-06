import Phaser from 'phaser';
import type { RuntimeGameConfig } from '@lucky/shared-types';
import { SlotScene } from './scenes/SlotScene.js';

export function createGame(
  config: RuntimeGameConfig,
): Promise<{ game: Phaser.Game; scene: SlotScene }> {
  return new Promise((resolve, reject) => {
    const state: { game?: Phaser.Game } = {};
    const scene = new SlotScene(config, {
      ready: () => {
        if (!state.game) {
          reject(new Error('Phaser game was unavailable when the slot scene became ready'));
          return;
        }
        resolve({ game: state.game, scene });
      },
      failed: (error) => {
        if (state.game) state.game.destroy(true);
        reject(error);
      },
    });
    state.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: 800,
      height: 480,
      transparent: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene,
    });
  });
}
