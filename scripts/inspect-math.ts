import { validateConfig } from '@lucky/math-engine';
import { loadSourceConfig } from './lib/source-loader.js';
import { renderProductionSummary } from './lib/production-profile.js';

const { config } = await loadSourceConfig();
const issues = validateConfig(config, 'math/source');
if (issues.length > 0)
  throw new Error(`Math inspection stopped: ${issues.length} validation issue(s)`);
console.log(renderProductionSummary(config));
