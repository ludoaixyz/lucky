import { validateConfig } from '@lucky/math-engine';
import { loadSourceConfig, requireProfileId } from './lib/source-loader.js';

const profileId = requireProfileId();
const { config } = await loadSourceConfig(profileId);
const issues = validateConfig(config);
if (issues.length > 0) {
  for (const issue of issues) console.error(`${issue.path}: ${issue.message}`);
  throw new Error(`Math validation failed with ${issues.length} issue(s)`);
}
console.log(
  `Math profile valid:\n${profileId}\n${config.columns}x${config.rows}\n${config.paytable.length} count-pay ranges`,
);
