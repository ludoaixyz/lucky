import { validateConfig } from '@lucky/math-engine';
import { loadSourceConfig } from './lib/source-loader.js';

const { config } = await loadSourceConfig();
const issues = validateConfig(config, 'math/source');
if (issues.length > 0) {
  for (const item of issues)
    console.error(
      `${item.file}:${item.record}:${item.field}: invalid ${JSON.stringify(item.value)}; ${item.rule}`,
    );
  process.exitCode = 1;
} else {
  console.log(
    `Math data valid: ${config.configurationId}, ${config.reelStrips.length} reels, ${config.paylines.length} paylines.`,
  );
}
