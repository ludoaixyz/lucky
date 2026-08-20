import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { loadSourceConfig, requireProfileId } from './lib/source-loader.js';
import { loadOrBuildStructuralCache, priceInitialBoardRtp } from './lib/structural-cache.js';

const started = performance.now();
const { config, sourceHash, structuralHash, payoutHash } =
  await loadSourceConfig(requireProfileId());
const structural = await loadOrBuildStructuralCache(
  config,
  structuralHash,
  process.argv.includes('--rebuild'),
);
const priced = priceInitialBoardRtp(config, structural.cache);
const triggerFrequency = Object.entries(structural.cache.baseScatterCountProbability)
  .filter(([count]) => Number(count) >= config.bonus.minimumCount)
  .reduce((sum, [, probability]) => sum + probability, 0);
const report = {
  schemaVersion: '1.0.0',
  methodology: 'hybrid-exact-initial-board',
  configurationId: config.configurationId,
  generatedAt: new Date().toISOString(),
  sourceHash,
  structuralHash,
  payoutHash,
  exactInitialBoardBaseLineRtp: priced.rtp,
  exactFeatureTriggerFrequency: triggerFrequency,
  exactScatterCountProbability: structural.cache.baseScatterCountProbability,
  notes:
    'Initial-board line expectation and initial Scatter trigger probability are exact. Variable-length cascades and free-spin contribution are reconciled by deterministic Monte Carlo.',
  timing: {
    cacheStatus: structural.status,
    structuralMilliseconds: structural.milliseconds,
    payoutMilliseconds: priced.milliseconds,
    totalMilliseconds: performance.now() - started,
  },
};
const directory = resolve(process.cwd(), 'math/reports');
await mkdir(directory, { recursive: true });
await writeFile(
  resolve(directory, `${config.configurationId}-hybrid.json`),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(`Structural cache ${structural.status} in ${structural.milliseconds.toFixed(2)} ms.`);
console.log(
  `Paytable-priced exact initial RTP ${(priced.rtp * 100).toFixed(6)}% in ${priced.milliseconds.toFixed(2)} ms.`,
);
console.log(`Exact feature trigger frequency ${(triggerFrequency * 100).toFixed(6)}%.`);
