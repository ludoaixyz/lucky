import { SeededRandom } from '@lucky/math-engine';
import './style.css';
import { loadConfig } from './config/load-config.js';
import { createGame } from './game/create-game.js';
import { attachController } from './ui/controller.js';
import { attachDiagnostics } from './diagnostics/dom-diagnostics.js';
import { bindDomLocalization, createBrowserLocalization } from './i18n/index.js';

const localization = createBrowserLocalization();
const disposeDomLocalization = bindDomLocalization(localization);
const startupMessage = document.querySelector<HTMLElement>('#message');
if (startupMessage)
  startupMessage.textContent = localization.renderMessage({
    key: 'loadingConfiguration',
    params: {},
  });

try {
  const config = await loadConfig();
  const { game, scene } = await createGame(config, localization);
  try {
    const diagnostics = attachDiagnostics(localization);
    const requestedSeed = new URLSearchParams(window.location.search).get('seed');
    const parsedSeed = requestedSeed === null ? Number.NaN : Number(requestedSeed);
    const developmentSeed = Number.isSafeInteger(parsedSeed) ? parsedSeed : Date.now();
    const disposeController = attachController(
      config,
      scene,
      new SeededRandom(developmentSeed),
      diagnostics,
      localization,
    );
    scene.registerShutdown(() => {
      disposeController();
      diagnostics.dispose();
      disposeDomLocalization();
    });
  } catch (error: unknown) {
    game.destroy(true);
    throw error;
  }
} catch (error: unknown) {
  console.error('LUCKY888 startup failed', error);
  const target = document.querySelector('#message');
  if (target) target.textContent = localization.renderMessage({ key: 'unableToStart', params: {} });
}
