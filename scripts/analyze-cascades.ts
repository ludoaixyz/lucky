import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { resolveSpin, SeededRandom, validateConfig } from '@lucky/math-engine';
import { loadSourceConfig, requireProfileId } from './lib/source-loader.js';

function option(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  const index = process.argv.indexOf(`--${name}`);
  const raw = inline?.slice(prefix.length) ?? (index >= 0 ? process.argv[index + 1] : undefined);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`--${name} must be a positive safe integer`);
  return value;
}

const spins = option('spins', 1_000_000);
const seed = option('seed', 2026);
const profileId = requireProfileId();
const { config, sourceHash } = await loadSourceConfig(profileId);
const issues = validateConfig(config, `math/profiles/${profileId}`);
if (issues.length > 0)
  throw new Error(`Cascade analysis stopped: ${issues.length} math validation issue(s)`);

const stagePayoutCredits = [0, 0, 0, 0];
const stageOccurrences = [0, 0, 0, 0];
const bucket = (stageIndex: number): number => Math.min(stageIndex, 4) - 1;
const accumulate = (
  stages: readonly { readonly index: number; readonly payoutCredits: number }[] | undefined,
  multiplier = 1,
): void => {
  for (const stage of stages ?? []) {
    if (stage.index === 0) continue;
    const index = bucket(stage.index);
    stageOccurrences[index] = (stageOccurrences[index] ?? 0) + 1;
    stagePayoutCredits[index] = (stagePayoutCredits[index] ?? 0) + stage.payoutCredits * multiplier;
  }
};

const rng = new SeededRandom(seed);
for (let paidSpin = 0; paidSpin < spins; paidSpin += 1) {
  const result = resolveSpin(config, rng);
  accumulate(result.cascades);
  for (const freeSpin of result.feature?.freeSpins ?? [])
    accumulate(freeSpin.cascades, freeSpin.multiplier);
}

const totalWageredCredits = spins * config.totalBetCredits;
const labels = ['stage-1', 'stage-2', 'stage-3', 'stage-4-plus'] as const;
const stages = labels.map((label, index) => ({
  label,
  boardOccurrences: stageOccurrences[index] ?? 0,
  payoutCredits: stagePayoutCredits[index] ?? 0,
  rtpContribution: (stagePayoutCredits[index] ?? 0) / totalWageredCredits,
}));
const report = {
  methodology: 'deterministic-cascade-depth-analysis',
  configurationId: config.configurationId,
  sourceHash,
  seed,
  paidSpins: spins,
  totalWageredCredits,
  stages,
  totalCascadePayoutCredits: stages.reduce((sum, stage) => sum + stage.payoutCredits, 0),
  cascadeRtpContribution: stages.reduce((sum, stage) => sum + stage.rtpContribution, 0),
};
const output = resolve(process.cwd(), `math/reports/cascade-depth-${seed}-${spins}.json`);
await mkdir(resolve(process.cwd(), 'math/reports'), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  stages
    .map(
      (stage) =>
        `${stage.label}: ${(stage.rtpContribution * 100).toFixed(4)}% RTP (${stage.payoutCredits.toLocaleString()} credits)`,
    )
    .join('\n'),
);
console.log(`Report: ${output}`);
