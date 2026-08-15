import type { BathalaMetrics, SimulationReport } from '../types/simulation-report.js';
import {
  finite,
  identifySchema,
  isRecord,
  parseRawReport,
  type ValidationIssue,
} from './validation.js';

export const SUPPORTED_REPORT_SCHEMA_VERSIONS = new Set(['2.0.0'] as const);
export type NormalizationMode = 'strict-import' | 'bundled-compatibility';
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
  'tumbleTriggerFrequency',
  'averageTumbleRoundsPerTriggeringSpin',
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

const probabilityFields = new Set<string>([
  'winningSpinFrequency',
  'baseGameTumbleTriggerFrequency',
  'freeGameTumbleTriggerFrequency',
  'bathalaActivationFrequency',
  'bathalaToNextWinConversionRate',
  'multiplierAppearanceFrequency',
  'featureFrequency',
]);

const integerMetricFields = new Set<string>([
  'totalSpins',
  'maximumObservedBaseGameTumbleDepth',
  'maximumObservedFreeGameTumbleDepth',
  'maximumObservedTumbleDepth',
  'bathalaActivations',
  'freeGameTriggerCount',
  'maximumObservedFeatureLength',
  'retriggerCount',
]);

const componentNames = [
  'baseGameRegularPayout',
  'baseGameScatterPayout',
  'baseGameMultiplierUplift',
  'freeGameRegularPayout',
  'freeGameScatterPayout',
  'freeGameMultiplierUplift',
] as const;

function unsupportedSchema(schema: string | null): NormalizationResult {
  const shown = schema === null ? 'missing' : `"${schema}"`;
  return {
    ok: false,
    errors: [
      {
        field: 'metadata.schemaVersion',
        message: `Unsupported report schemaVersion ${shown}. Supported versions: ${[...SUPPORTED_REPORT_SCHEMA_VERSIONS].join(', ')}.`,
      },
    ],
  };
}

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

function requiredRecord(
  value: unknown,
  path: string,
  errors: ValidationIssue[],
): Record<string, unknown> {
  if (isRecord(value)) return value;
  errors.push({ field: path, message: `${path} is required and must be an object` });
  return {};
}

function requiredString(
  record: Record<string, unknown>,
  name: string,
  path: string,
  errors: ValidationIssue[],
): string | undefined {
  const value = record[name];
  if (typeof value === 'string' && value.length > 0) return value;
  errors.push({ field: `${path}.${name}`, message: `${path}.${name} is required` });
  return undefined;
}

function normalize(value: unknown, mode: NormalizationMode): NormalizationResult {
  if (!isRecord(value))
    return { ok: false, errors: [{ field: '$', message: 'report must be a JSON object' }] };
  const schema = identifySchema(value);
  if (schema === null || !SUPPORTED_REPORT_SCHEMA_VERSIONS.has(schema as '2.0.0'))
    return unsupportedSchema(schema);

  const strict = mode === 'strict-import';
  const errors: ValidationIssue[] = [];
  const canonical =
    isRecord(value.metadata) && isRecord(value.simulation) && isRecord(value.metrics);
  const requireCanonicalFields = strict || canonical;
  if (strict && !canonical) {
    requiredRecord(value.metadata, 'metadata', errors);
    requiredRecord(value.simulation, 'simulation', errors);
    requiredRecord(value.metrics, 'metrics', errors);
  }
  const metadataRaw = isRecord(value.metadata) ? value.metadata : {};
  const simulationRaw = isRecord(value.simulation) ? value.simulation : {};
  const metricsRaw = isRecord(value.metrics) ? value.metrics : {};
  const configRaw = isRecord(value.config) ? value.config : {};

  if (requireCanonicalFields) {
    for (const name of [
      'schemaVersion',
      'gameId',
      'gameName',
      'gameVersion',
      'configurationId',
      'generatedAt',
    ])
      requiredString(metadataRaw, name, 'metadata', errors);
    for (const name of ['methodology']) requiredString(simulationRaw, name, 'simulation', errors);
    if (
      typeof metadataRaw.generatedAt === 'string' &&
      !Number.isFinite(Date.parse(metadataRaw.generatedAt))
    )
      errors.push({
        field: 'metadata.generatedAt',
        message: 'metadata.generatedAt must be a valid date-time',
      });
  }

  const configurationId = canonical
    ? metadataRaw.configurationId
    : (metricsRaw.configurationId ?? configRaw.configurationId);
  const source = typeof configRaw.source === 'string' ? configRaw.source : undefined;
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
  const seed = requireCanonicalFields
    ? simulationRaw.seed
    : (simulationRaw.seed ?? metricsRaw.seed);
  const spins = requireCanonicalFields
    ? simulationRaw.spins
    : (simulationRaw.spins ?? metricsRaw.totalSpins);

  for (const [path, item] of [
    ['metadata.gameVersion', metadata.gameVersion],
    ['metadata.configurationId', metadata.configurationId],
    ['metadata.generatedAt', metadata.generatedAt],
    ['simulation.methodology', methodology],
  ] as const)
    if (typeof item !== 'string' || item.length === 0)
      errors.push({ field: path, message: `${path} is required` });
  if (methodology !== 'deterministic-streaming-monte-carlo')
    errors.push({
      field: 'simulation.methodology',
      message: 'simulation.methodology must be deterministic-streaming-monte-carlo',
    });
  finite(seed, 'simulation.seed', errors, { integer: true });
  finite(spins, 'simulation.spins', errors, { integer: true, positive: true });

  for (const name of metricNumbers)
    finite(metricsRaw[name], `metrics.${name}`, errors, {
      probability: probabilityFields.has(name),
      integer: integerMetricFields.has(name),
    });

  if (
    !Array.isArray(metricsRaw.confidenceInterval95) ||
    metricsRaw.confidenceInterval95.length !== 2
  )
    errors.push({
      field: 'metrics.confidenceInterval95',
      message: 'metrics.confidenceInterval95 must contain two numbers',
    });
  else {
    metricsRaw.confidenceInterval95.forEach((number, index) =>
      finite(number, `metrics.confidenceInterval95[${index}]`, errors),
    );
    const lower: unknown = metricsRaw.confidenceInterval95[0];
    const upper: unknown = metricsRaw.confidenceInterval95[1];
    if (
      typeof lower === 'number' &&
      typeof upper === 'number' &&
      Number.isFinite(lower) &&
      Number.isFinite(upper) &&
      lower > upper
    )
      errors.push({
        field: 'metrics.confidenceInterval95',
        message: 'metrics.confidenceInterval95 lower bound must not exceed upper bound',
      });
  }

  const percentiles = isRecord(metricsRaw.featureLengthPercentiles)
    ? metricsRaw.featureLengthPercentiles
    : {};
  for (const name of ['p50', 'p75', 'p90', 'p95', 'p99'])
    finite(percentiles[name], `metrics.featureLengthPercentiles.${name}`, errors);
  const rawComponents = isRecord(metricsRaw.components) ? metricsRaw.components : {};
  const components = componentNames.every((name) => name in rawComponents)
    ? rawComponents
    : strict
      ? rawComponents
      : legacyComponents(rawComponents);
  for (const name of componentNames) finite(components[name], `metrics.components.${name}`, errors);

  if (!Array.isArray(metricsRaw.tails))
    errors.push({ field: 'metrics.tails', message: 'metrics.tails must be an array' });
  else
    metricsRaw.tails.forEach((tail, index) => {
      if (!isRecord(tail)) {
        errors.push({
          field: `metrics.tails[${index}]`,
          message: `metrics.tails[${index}] must be an object`,
        });
        return;
      }
      finite(tail.threshold, `metrics.tails[${index}].threshold`, errors, {
        positive: true,
        integer: true,
      });
      finite(tail.count, `metrics.tails[${index}].count`, errors, { integer: true });
      finite(tail.frequency, `metrics.tails[${index}].frequency`, errors, { probability: true });
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
      metrics: { ...metricsRaw, components } as unknown as BathalaMetrics,
    },
  };
}

export const normalizeBundledReport = (value: unknown): NormalizationResult =>
  normalize(value, 'bundled-compatibility');
export const normalizeImportedReport = (value: unknown): NormalizationResult =>
  normalize(value, 'strict-import');
export function parseImportedSimulationReport(json: string): NormalizationResult {
  const parsed = parseRawReport(json);
  return parsed.ok ? normalizeImportedReport(parsed.value) : parsed;
}

// Backward-compatible names remain explicit aliases: object normalization is for repository fixtures;
// JSON parsing is strict because arbitrary text is treated as a user import.
export const normalizeReport = normalizeBundledReport;
export const parseSimulationReport = parseImportedSimulationReport;
