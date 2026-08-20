import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runSimulation, SeededRandom, validateConfig } from '@lucky/math-engine';
import type {
  ActiveGameConfig,
  BathalaSimulationReport,
  BathalaSymbolId,
} from '@lucky/shared-types';
import { loadSourceConfig, requireProfileId } from './lib/source-loader.js';

function integerOption(name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  const position = process.argv.indexOf(`--${name}`);
  const raw =
    inline?.slice(prefix.length) ?? (position >= 0 ? process.argv[position + 1] : undefined);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be positive`);
  return value;
}

function listOption(name: string, fallback: readonly number[]): readonly number[] {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  const position = process.argv.indexOf(`--${name}`);
  const raw =
    inline?.slice(prefix.length) ?? (position >= 0 ? process.argv[position + 1] : undefined);
  const values = raw === undefined ? [...fallback] : raw.split(',').map(Number);
  if (values.length === 0 || values.some((value) => !Number.isFinite(value) || value <= 0))
    throw new RangeError(`${name} must contain positive comma-separated numbers`);
  return values;
}

function withWeight(
  config: ActiveGameConfig,
  phase: 'base' | 'free',
  symbol: BathalaSymbolId,
  weight: number,
): ActiveGameConfig {
  const key = phase === 'base' ? 'baseSymbolWeights' : 'freegameSymbolWeights';
  return {
    ...config,
    [key]: config[key].map((entry) => (entry.symbol === symbol ? { ...entry, weight } : entry)),
  };
}

interface CandidateResult {
  readonly baseScatterWeight: number;
  readonly baseMultiplierWeight: number;
  readonly freeMultiplierWeight: number;
  readonly featureFrequency: number;
  readonly feature1InN: number | null;
  readonly creditedRtp: number;
  readonly baseGameRtpContribution: number;
  readonly freeGameRtpContribution: number;
  readonly multiplierRtpContribution: number;
  readonly regularRtpContribution: number;
  readonly scatterRtpContribution: number;
  readonly winningSpinFrequency: number;
  readonly variance: number;
  readonly standardDeviation: number;
  readonly coefficientOfVariation: number;
  readonly maximumObservedWin: number;
  readonly components: BathalaSimulationReport['components'];
  readonly tails: BathalaSimulationReport['tails'];
}

const spins = integerOption('spins', 50_000);
const seed = integerOption('seed', 2026);
const scatterWeights = listOption('scatter-weights', [8, 12, 16, 20, 24, 28, 32, 36, 40]);
const baseMultiplierWeights = listOption('base-multiplier-weights', [15]);
const freeMultiplierWeights = listOption('free-multiplier-weights', [22]);
const { config: sourceConfig } = await loadSourceConfig(requireProfileId());
const results: CandidateResult[] = [];

for (const baseScatterWeight of scatterWeights) {
  for (const baseMultiplierWeight of baseMultiplierWeights) {
    for (const freeMultiplierWeight of freeMultiplierWeights) {
      let candidate = withWeight(sourceConfig, 'base', 'SCATTER', baseScatterWeight);
      candidate = withWeight(candidate, 'base', 'MULTIPLIER', baseMultiplierWeight);
      candidate = withWeight(candidate, 'free', 'MULTIPLIER', freeMultiplierWeight);
      const issues = validateConfig(candidate);
      if (issues.length > 0)
        throw new Error(`Invalid calibration candidate: ${issues.length} issues`);
      const report = runSimulation(candidate, { spins, seed }, new SeededRandom(seed));
      const components = report.components;
      const baseGameRtpContribution =
        (components.baseGameRegularPayout +
          components.baseGameScatterPayout +
          components.baseGameMultiplierUplift) /
        spins;
      const freeGameRtpContribution =
        (components.freeGameRegularPayout +
          components.freeGameScatterPayout +
          components.freeGameMultiplierUplift) /
        spins;
      const multiplierRtpContribution =
        (components.baseGameMultiplierUplift + components.freeGameMultiplierUplift) / spins;
      const regularRtpContribution =
        (components.baseGameRegularPayout + components.freeGameRegularPayout) / spins;
      const scatterRtpContribution =
        (components.baseGameScatterPayout + components.freeGameScatterPayout) / spins;
      results.push({
        baseScatterWeight,
        baseMultiplierWeight,
        freeMultiplierWeight,
        featureFrequency: report.featureFrequency,
        feature1InN: report.featureFrequency === 0 ? null : 1 / report.featureFrequency,
        creditedRtp: report.rtp,
        baseGameRtpContribution,
        freeGameRtpContribution,
        multiplierRtpContribution,
        regularRtpContribution,
        scatterRtpContribution,
        winningSpinFrequency: report.winningSpinFrequency,
        variance: report.variance,
        standardDeviation: report.standardDeviation,
        coefficientOfVariation: report.coefficientOfVariation,
        maximumObservedWin: report.maximumObservedWin,
        components,
        tails: report.tails,
      });
    }
  }
}

await mkdir(resolve(process.cwd(), 'math/reports'), { recursive: true });
const output = resolve(
  process.cwd(),
  `math/reports/bathala-calibration-sweep-${seed}-${spins}.json`,
);
await writeFile(
  output,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sourceConfigurationId: sourceConfig.configurationId,
      spinsPerCandidate: spins,
      seed,
      results,
    },
    null,
    2,
  )}\n`,
);
console.table(
  results.map((result) => ({
    scatter: result.baseScatterWeight,
    baseMulti: result.baseMultiplierWeight,
    freeMulti: result.freeMultiplierWeight,
    feature1InN: result.feature1InN?.toFixed(2) ?? 'none',
    rtp: `${(result.creditedRtp * 100).toFixed(3)}%`,
    featureRtp: `${(result.freeGameRtpContribution * 100).toFixed(3)}%`,
    multiplierRtp: `${(result.multiplierRtpContribution * 100).toFixed(3)}%`,
    regularRtp: `${(result.regularRtpContribution * 100).toFixed(3)}%`,
    hit: `${(result.winningSpinFrequency * 100).toFixed(3)}%`,
    cv: result.coefficientOfVariation.toFixed(3),
    max: result.maximumObservedWin.toFixed(2),
  })),
);
console.log(`Calibration sweep: ${output}`);
