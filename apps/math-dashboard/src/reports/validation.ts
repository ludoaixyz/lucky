import type { PayoutBucket, SimulationReport } from '../types/simulation-report.js';
import type { SimulationCheckpoint } from '@lucky/shared-types';
import { normalizeSimulationCheckpoints } from './checkpoints.js';

export type ValidationIssueKey =
  | 'malformedJson'
  | 'rootObject'
  | 'schemaVersion'
  | 'methodology'
  | 'requiredString'
  | 'finiteNumber'
  | 'positiveSpins'
  | 'invalidNestedMetric'
  | 'confidenceInterval'
  | 'payoutDistribution'
  | 'invalidCheckpoints';

export interface ValidationIssue {
  readonly key: ValidationIssueKey;
  readonly field?: string;
  readonly technicalDetail?: string;
}

export type ValidationResult =
  | { readonly ok: true; readonly report: SimulationReport }
  | { readonly ok: false; readonly errors: readonly ValidationIssue[] };

const numberFields = [
  'seed',
  'paidSpins',
  'totalWageredCredits',
  'uncappedBaseLinePayoutCredits',
  'uncappedBaseScatterPayoutCredits',
  'uncappedFeaturePayoutCredits',
  'uncappedTotalPayoutCredits',
  'creditedTotalPayoutCredits',
  'capReductionCredits',
  'uncappedBaseLineRtp',
  'uncappedBaseScatterRtp',
  'uncappedFeatureRtp',
  'uncappedTotalRtp',
  'creditedTotalRtp',
  'baseHitFrequency',
  'featureTriggerFrequency',
  'featureInclusiveHitFrequency',
  'averageInitiallyAwardedFreeSpins',
  'averageTotalFreeSpinsPerTrigger',
  'averageRetriggersPerTrigger',
  'maximumObservedFeatureLength',
  'featureCapHitFrequency',
  'variance',
  'standardDeviation',
  'standardError',
  'maximumObservedWinCredits',
  'capApplications',
  'capApplicationFrequency',
] as const satisfies readonly (keyof SimulationReport)[];

const percentileFields = ['median', 'p75', 'p90', 'p95', 'p99'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateBucket(
  value: unknown,
  index: number,
  errors: ValidationIssue[],
): value is PayoutBucket {
  const prefix = `payoutDistribution[${index}]`;
  if (!isRecord(value)) {
    errors.push({ key: 'invalidNestedMetric', field: prefix });
    return false;
  }
  if (typeof value.label !== 'string' || value.label.length === 0)
    errors.push({ key: 'requiredString', field: `${prefix}.label` });
  for (const field of ['minimumMultiple', 'count', 'probability'] as const)
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]))
      errors.push({ key: 'finiteNumber', field: `${prefix}.${field}` });
  if (value.maximumMultiple !== null && !Number.isFinite(value.maximumMultiple))
    errors.push({ key: 'finiteNumber', field: `${prefix}.maximumMultiple` });
  return true;
}

function validateCheckpoint(
  value: unknown,
  index: number,
  errors: ValidationIssue[],
): value is SimulationCheckpoint {
  const prefix = `simulationCheckpoints[${index}]`;
  if (!isRecord(value)) {
    errors.push({ key: 'invalidCheckpoints', field: prefix });
    return false;
  }
  for (const field of [
    'bets',
    'totalWageredCredits',
    'totalReturnedCredits',
    'simulatedRtp',
    'theoreticalRtp',
    'rtpDeviation',
    'totalWins',
    'hitFrequency',
    'bonusTriggers',
    'bonusFrequency',
    'maximumWinCredits',
    'maximumWinMultiplier',
    'standardDeviation',
  ] as const)
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]))
      errors.push({ key: 'invalidCheckpoints', field: `${prefix}.${field}` });
  if (typeof value.bets !== 'number' || !Number.isSafeInteger(value.bets) || value.bets <= 0)
    errors.push({ key: 'invalidCheckpoints', field: `${prefix}.bets` });
  if (
    !Array.isArray(value.confidenceInterval95) ||
    value.confidenceInterval95.length !== 2 ||
    value.confidenceInterval95.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))
  )
    errors.push({ key: 'invalidCheckpoints', field: `${prefix}.confidenceInterval95` });
  return true;
}

export function validateSimulationReport(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: [{ key: 'rootObject' }] };
  const errors: ValidationIssue[] = [];
  if (value.schemaVersion !== '1.2.0')
    errors.push({ key: 'schemaVersion', field: 'schemaVersion' });
  if (value.methodology !== 'deterministic-monte-carlo')
    errors.push({ key: 'methodology', field: 'methodology' });
  for (const field of ['gameVersion', 'configurationId', 'generatedAt'] as const)
    if (typeof value[field] !== 'string' || value[field].length === 0)
      errors.push({ key: 'requiredString', field });
  if (typeof value.generatedAt === 'string' && Number.isNaN(Date.parse(value.generatedAt)))
    errors.push({ key: 'requiredString', field: 'generatedAt' });
  for (const field of numberFields)
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]))
      errors.push({ key: 'finiteNumber', field });
  if (
    typeof value.paidSpins === 'number' &&
    (!Number.isInteger(value.paidSpins) || value.paidSpins < 1)
  )
    errors.push({ key: 'positiveSpins', field: 'paidSpins' });
  if (!isRecord(value.featureTriggerFrequencyByScatterCount))
    errors.push({ key: 'invalidNestedMetric', field: 'featureTriggerFrequencyByScatterCount' });
  else
    for (const key of Object.keys(value.featureTriggerFrequencyByScatterCount)) {
      const frequency = value.featureTriggerFrequencyByScatterCount[key];
      if (
        !['3', '4', '5'].includes(key) ||
        typeof frequency !== 'number' ||
        !Number.isFinite(frequency)
      )
        errors.push({
          key: 'invalidNestedMetric',
          field: `featureTriggerFrequencyByScatterCount.${key}`,
        });
    }
  if (!isRecord(value.featureLengthPercentiles))
    errors.push({ key: 'invalidNestedMetric', field: 'featureLengthPercentiles' });
  else
    for (const field of percentileFields)
      if (typeof value.featureLengthPercentiles[field] !== 'number')
        errors.push({ key: 'finiteNumber', field: `featureLengthPercentiles.${field}` });
  if (
    !Array.isArray(value.confidenceInterval95) ||
    value.confidenceInterval95.length !== 2 ||
    value.confidenceInterval95.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))
  )
    errors.push({ key: 'confidenceInterval', field: 'confidenceInterval95' });
  if (!Array.isArray(value.payoutDistribution) || value.payoutDistribution.length === 0)
    errors.push({ key: 'payoutDistribution', field: 'payoutDistribution' });
  else value.payoutDistribution.forEach((bucket, index) => validateBucket(bucket, index, errors));
  if (value.simulationCheckpoints !== undefined) {
    if (!Array.isArray(value.simulationCheckpoints) || value.simulationCheckpoints.length === 0)
      errors.push({ key: 'invalidCheckpoints', field: 'simulationCheckpoints' });
    else {
      value.simulationCheckpoints.forEach((checkpoint, index) =>
        validateCheckpoint(checkpoint, index, errors),
      );
      const bets = value.simulationCheckpoints.map((checkpoint) =>
        isRecord(checkpoint) && typeof checkpoint.bets === 'number' ? checkpoint.bets : 0,
      );
      if (new Set(bets).size !== bets.length)
        errors.push({ key: 'invalidCheckpoints', field: 'simulationCheckpoints' });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const report = value as unknown as SimulationReport;
  return {
    ok: true,
    report:
      report.simulationCheckpoints === undefined
        ? report
        : {
            ...report,
            simulationCheckpoints: normalizeSimulationCheckpoints(report.simulationCheckpoints),
          },
  };
}

export function parseSimulationReport(json: string): ValidationResult {
  try {
    return validateSimulationReport(JSON.parse(json) as unknown);
  } catch (error: unknown) {
    const issue: ValidationIssue =
      error instanceof Error
        ? { key: 'malformedJson', technicalDetail: error.message }
        : { key: 'malformedJson' };
    return {
      ok: false,
      errors: [issue],
    };
  }
}
