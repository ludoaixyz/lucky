import { validateConfig } from '@lucky/math-engine';
import { loadSourceConfig } from './lib/source-loader.js';

const { config } = await loadSourceConfig();
const issues = validateConfig(config);
if (issues.length > 0) {
  for (const issue of issues) console.error(`${issue.path}: ${issue.message}`);
  throw new Error(`Math validation failed with ${issues.length} issue(s)`);
}
console.log(
  `Math data valid: ${config.configurationId}, ${config.columns}x${config.rows}, ${config.paytable.length} count-pay ranges.`,
);
