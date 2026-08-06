import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateConfig } from '@lucky/math-engine';
import { loadSourceConfig } from './lib/source-loader.js';

const { config, sourceHash } = await loadSourceConfig();
const issues = validateConfig(config, 'math/source');
if (issues.length > 0) throw new Error(`Math build stopped: ${issues.length} validation issue(s)`);
const artifact = {
  metadata: {
    schemaVersion: config.schemaVersion,
    gameId: config.gameId,
    gameName: config.gameName,
    gameVersion: config.gameVersion,
    configurationId: config.configurationId,
    sourceHash,
    generatedAt: new Date().toISOString(),
  },
  config,
};
const text = `${JSON.stringify(artifact, null, 2)}\n`;
for (const directory of ['math/generated', 'apps/game/public/data'])
  await mkdir(resolve(process.cwd(), directory), { recursive: true });
await Promise.all([
  writeFile(resolve(process.cwd(), 'math/generated/runtime-config.json'), text),
  writeFile(resolve(process.cwd(), 'apps/game/public/data/runtime-config.json'), text),
]);
console.log(`Built runtime configuration ${config.configurationId} (${sourceHash.slice(0, 12)}).`);
