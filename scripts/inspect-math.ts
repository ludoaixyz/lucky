import { validateConfig } from '@lucky/math-engine';
import { loadSourceConfig, requireProfileId } from './lib/source-loader.js';
import { renderProductionSummary } from './lib/production-profile.js';

const profileId = requireProfileId();
const { config } = await loadSourceConfig(profileId);
const issues = validateConfig(config, `math/profiles/${profileId}`);
if (issues.length > 0)
  throw new Error(`Math inspection stopped: ${issues.length} validation issue(s)`);
console.log(renderProductionSummary(config));
