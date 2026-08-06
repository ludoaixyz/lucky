import Phaser from 'phaser';
import type { RuntimeGameConfig } from '@lucky/shared-types';
import { SlotScene } from './scenes/SlotScene.js';

export function createGame(config: RuntimeGameConfig): { game: Phaser.Game; scene: SlotScene } {
  const scene = new SlotScene(config);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 800,
    height: 480,
    transparent: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene,
  });
  return { game, scene };
}
