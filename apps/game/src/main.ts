import { SeededRandom } from '@lucky/math-engine';
import './style.css';
import { loadConfig } from './config/load-config.js';
import { createGame } from './game/create-game.js';
import { attachController } from './ui/controller.js';

try {
  const config = await loadConfig();
  const { scene } = createGame(config);
  scene.events.once('create', () => attachController(config, scene, new SeededRandom(Date.now())));
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  const target = document.querySelector('#message');
  if (target) target.textContent = `Unable to start: ${message}`;
}
