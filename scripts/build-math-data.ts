import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateConfig } from '@lucky/math-engine';
import type { ActiveGameConfig } from '@lucky/shared-types';
import { loadSourceConfig } from './lib/source-loader.js';

const { config, sourceHash, structuralHash, payoutHash } = await loadSourceConfig();
const issues = validateConfig(config);
if (issues.length > 0) throw new Error(`Math build stopped: ${issues.length} validation issue(s)`);
const artifact = {
  metadata: {
    schemaVersion: config.schemaVersion,
    gameId: config.gameId,
    gameName: config.gameName,
    gameVersion: config.gameVersion,
    configurationId: config.configurationId,
    sourceHash,
    structuralHash,
    payoutHash,
    generatedAt: new Date().toISOString(),
  },
  config,
};
const text = `${JSON.stringify(artifact, null, 2)}\n`;
const generatedRuntimePath = resolve(process.cwd(), 'math/generated/runtime-config.json');
const gameRuntimePath = resolve(process.cwd(), 'apps/game/public/data/runtime-config.json');
for (const directory of ['math/generated', 'apps/game/public/data'])
  await mkdir(resolve(process.cwd(), directory), { recursive: true });
await Promise.all([writeFile(generatedRuntimePath, text), writeFile(gameRuntimePath, text)]);
const [generatedRuntime, gameRuntime] = await Promise.all([
  readFile(generatedRuntimePath, 'utf8'),
  readFile(gameRuntimePath, 'utf8'),
]);
for (const [label, serialized] of [
  ['math generated runtime', generatedRuntime],
  ['game public runtime', gameRuntime],
] as const) {
  const compiled = JSON.parse(serialized) as { config: ActiveGameConfig };
  if (JSON.stringify(compiled.config) !== JSON.stringify(config))
    throw new Error(`${label} differs from canonical source data`);
}
console.log(`Built runtime configuration ${config.configurationId} (${sourceHash.slice(0, 12)}).`);
console.log(`Generated runtime: ${generatedRuntimePath}`);
console.log(`Game runtime mirror: ${gameRuntimePath}`);
