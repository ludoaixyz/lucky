import { SeededRandom } from '@lucky/math-engine';
import './style.css';
import { loadConfig } from './config/load-config.js';
import { createGame } from './game/create-game.js';
import { attachController } from './ui/controller.js';
import { attachDiagnostics } from './diagnostics/dom-diagnostics.js';

try {
  const config = await loadConfig();
  const { game, scene } = await createGame(config);
  try {
    const diagnostics = attachDiagnostics();
    const disposeController = attachController(
      config,
      scene,
      new SeededRandom(Date.now()),
      diagnostics,
    );
    scene.registerShutdown(() => {
      disposeController();
      diagnostics.dispose();
    });
  } catch (error: unknown) {
    game.destroy(true);
    throw error;
  }
} catch (error: unknown) {
  console.error('Lucky888 startup failed', error);
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  const target = document.querySelector('#message');
  if (target) target.textContent = `Unable to start: ${message}`;
}
