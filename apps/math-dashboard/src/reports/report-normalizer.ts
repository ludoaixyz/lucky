import type { BathalaMetrics, SimulationReport } from '../types/simulation-report.js';
import {
  finite,
  identifySchema,
  isRecord,
  parseRawReport,
  type ValidationIssue,
} from './validation.js';
export type NormalizationResult =
  { ok: true; report: SimulationReport } | { ok: false; errors: ValidationIssue[] };
const metricNumbers = [
  'totalSpins',
  'totalBet',
  'totalCreditedWin',
  'rtp',
  'winningSpinFrequency',
  'averageWinPerWinningSpin',
  'baseGameTumbleTriggerFrequency',
  'freeGameTumbleTriggerFrequency',
  'averageBaseGameTumbleRoundsPerTrigger',
  'averageFreeGameTumbleRoundsPerTrigger',
  'tumbleRoundsPerPaidSpin',
  'maximumObservedBaseGameTumbleDepth',
  'maximumObservedFreeGameTumbleDepth',
  'maximumObservedTumbleDepth',
  'bathalaActivations',
  'bathalaActivationFrequency',
  'averageSymbolsRemoved',
  'bathalaToNextWinConversionRate',
  'multiplierAppearanceFrequency',
  'averageMultiplierValue',
  'averageSummedMultiplierOnMultipliedWins',
  'maximumSummedMultiplier',
  'freeGameTriggerCount',
  'featureFrequency',
  'averageFreeGamesPlayed',
  'averageInitiallyAwardedFreeGames',
  'maximumObservedFeatureLength',
  'retriggerCount',
  'averageRetriggersPerFeature',
  'averageEndingFreeGameMultiplier',
  'freeGameWinContribution',
  'baseGameWinContribution',
  'maximumObservedWin',
  'meanWinPerPaidSpin',
  'variance',
  'standardDeviation',
  'coefficientOfVariation',
  'standardError',
] as const;
const ratioFields = new Set([
  'rtp',
  'winningSpinFrequency',
  'baseGameTumbleTriggerFrequency',
  'freeGameTumbleTriggerFrequency',
  'bathalaActivationFrequency',
  'bathalaToNextWinConversionRate',
  'multiplierAppearanceFrequency',
  'featureFrequency',
  'freeGameWinContribution',
  'baseGameWinContribution',
]);
const componentNames = [
  'baseGameRegularPayout',
  'baseGameScatterPayout',
  'baseGameMultiplierUplift',
  'freeGameRegularPayout',
  'freeGameScatterPayout',
  'freeGameMultiplierUplift',
] as const;
function legacyComponents(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    baseGameRegularPayout: raw.regularBaseSymbolPayout,
    baseGameScatterPayout: raw.scatterDirectPayout,
    baseGameMultiplierUplift: raw.baseGameMultiplierUplift,
    freeGameRegularPayout: raw.freeGameRegularPayout,
    freeGameScatterPayout: 0,
    freeGameMultiplierUplift: raw.freeGameMultiplierUplift,
  };
}
export function normalizeReport(value: unknown): NormalizationResult {
  if (!isRecord(value))
    return { ok: false, errors: [{ field: '$', message: 'report must be a JSON object' }] };
  const schema = identifySchema(value);
  if (!schema?.startsWith('2.'))
    return {
      ok: false,
      errors: [
        {
          field: 'metadata.schemaVersion',
          message: `unsupported schema version: ${schema ?? 'missing'}; expected Bathala report schema 2.x`,
        },
      ],
    };
  const canonical = isRecord(value.metadata);
  const metadataRaw: Record<string, unknown> = canonical
    ? (value.metadata as Record<string, unknown>)
    : {};
  const simulationRaw = isRecord(value.simulation) ? value.simulation : {};
  const metricsRaw = isRecord(value.metrics) ? value.metrics : {};
  const configurationId = canonical
    ? metadataRaw.configurationId
    : (metricsRaw.configurationId ??
      (isRecord(value.config) ? value.config.configurationId : undefined));
  const source =
    isRecord(value.config) && typeof value.config.source === 'string'
      ? value.config.source
      : undefined;
  const metadata = {
    schemaVersion: schema,
    gameId: typeof metadataRaw.gameId === 'string' ? metadataRaw.gameId : 'lucky888',
    gameName: typeof metadataRaw.gameName === 'string' ? metadataRaw.gameName : 'Lucky888',
    gameVersion: typeof metadataRaw.gameVersion === 'string' ? metadataRaw.gameVersion : '2.0.0',
    configurationId,
    generatedAt:
      typeof metadataRaw.generatedAt === 'string'
        ? metadataRaw.generatedAt
        : new Date(0).toISOString(),
    calibrationProfile:
      typeof metadataRaw.calibrationProfile === 'string' ? metadataRaw.calibrationProfile : source,
  };
  const methodology = canonical ? simulationRaw.methodology : metricsRaw.methodology;
  const seed = simulationRaw.seed ?? metricsRaw.seed;
  const spins = simulationRaw.spins ?? metricsRaw.totalSpins;
  const errors: ValidationIssue[] = [];
  for (const [path, item] of [
    ['metadata.gameVersion', metadata.gameVersion],
    ['metadata.configurationId', metadata.configurationId],
    ['metadata.generatedAt', metadata.generatedAt],
    ['simulation.methodology', methodology],
  ] as const)
    if (typeof item !== 'string' || item.length === 0)
      errors.push({ field: path, message: `${path} is missing` });
  if (methodology !== 'deterministic-streaming-monte-carlo')
    errors.push({
      field: 'simulation.methodology',
      message: 'simulation.methodology must be deterministic-streaming-monte-carlo',
    });
  finite(seed, 'simulation.seed', errors, { integer: true });
  finite(spins, 'simulation.spins', errors, { integer: true, positive: true });
  for (const name of metricNumbers)
    finite(metricsRaw[name], `metrics.${name}`, errors, {
      ratio: ratioFields.has(name),
      integer: name === 'totalSpins',
    });
  if (
    !Array.isArray(metricsRaw.confidenceInterval95) ||
    metricsRaw.confidenceInterval95.length !== 2
  )
    errors.push({
      field: 'metrics.confidenceInterval95',
      message: 'metrics.confidenceInterval95 must contain two numbers',
    });
  else
    metricsRaw.confidenceInterval95.forEach((n, i) =>
      finite(n, `metrics.confidenceInterval95[${i}]`, errors),
    );
  const percentiles = isRecord(metricsRaw.featureLengthPercentiles)
    ? metricsRaw.featureLengthPercentiles
    : {};
  for (const name of ['p50', 'p75', 'p90', 'p95', 'p99'])
    finite(percentiles[name], `metrics.featureLengthPercentiles.${name}`, errors);
  const rawComponents: Record<string, unknown> = isRecord(metricsRaw.components)
    ? metricsRaw.components
    : {};
  const compRaw = componentNames.every((k) => k in rawComponents)
    ? rawComponents
    : legacyComponents(rawComponents);
  for (const name of componentNames) finite(compRaw[name], `metrics.components.${name}`, errors);
  if (!Array.isArray(metricsRaw.tails))
    errors.push({ field: 'metrics.tails', message: 'metrics.tails must be an array' });
  else
    metricsRaw.tails.forEach((tail, i) => {
      if (!isRecord(tail))
        errors.push({
          field: `metrics.tails[${i}]`,
          message: `metrics.tails[${i}] must be an object`,
        });
      else {
        finite(tail.threshold, `metrics.tails[${i}].threshold`, errors, { positive: true });
        finite(tail.count, `metrics.tails[${i}].count`, errors, { integer: true });
        finite(tail.frequency, `metrics.tails[${i}].frequency`, errors, { ratio: true });
      }
    });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    report: {
      metadata: metadata as SimulationReport['metadata'],
      simulation: {
        methodology: methodology as 'deterministic-streaming-monte-carlo',
        seed: seed as number,
        spins: spins as number,
      },
      metrics: { ...metricsRaw, components: compRaw } as unknown as BathalaMetrics,
    },
  };
}
export function parseSimulationReport(json: string): NormalizationResult {
  const parsed = parseRawReport(json);
  return parsed.ok ? normalizeReport(parsed.value) : parsed;
}
