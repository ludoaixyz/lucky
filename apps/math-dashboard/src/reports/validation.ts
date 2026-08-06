import type { PayoutBucket, SimulationReport } from '../types/simulation-report.js';

export type ValidationResult =
  | { readonly ok: true; readonly report: SimulationReport }
  | { readonly ok: false; readonly errors: readonly string[] };

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

function validateBucket(value: unknown, index: number, errors: string[]): value is PayoutBucket {
  if (!isRecord(value)) {
    errors.push(`payoutDistribution[${index}] must be an object.`);
    return false;
  }
  if (typeof value.label !== 'string' || value.label.length === 0)
    errors.push(`payoutDistribution[${index}].label must be a non-empty string.`);
  for (const field of ['minimumMultiple', 'count', 'probability'] as const) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]))
      errors.push(`payoutDistribution[${index}].${field} must be a finite number.`);
  }
  if (value.maximumMultiple !== null && !Number.isFinite(value.maximumMultiple))
    errors.push(`payoutDistribution[${index}].maximumMultiple must be a number or null.`);
  return true;
}

export function validateSimulationReport(value: unknown): ValidationResult {
  if (!isRecord(value)) return { ok: false, errors: ['Report root must be a JSON object.'] };
  const errors: string[] = [];
  if (value.schemaVersion !== '1.2.0')
    errors.push(`schemaVersion must be "1.2.0"; received ${String(value.schemaVersion)}.`);
  if (value.methodology !== 'deterministic-monte-carlo')
    errors.push('methodology must be "deterministic-monte-carlo".');
  for (const field of ['gameVersion', 'configurationId', 'generatedAt'] as const) {
    if (typeof value[field] !== 'string' || value[field].length === 0)
      errors.push(`${field} must be a non-empty string.`);
  }
  if (typeof value.generatedAt === 'string' && Number.isNaN(Date.parse(value.generatedAt)))
    errors.push('generatedAt must be a valid timestamp.');
  for (const field of numberFields) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field]))
      errors.push(`${field} must be a finite number.`);
  }
  if (
    typeof value.paidSpins === 'number' &&
    (!Number.isInteger(value.paidSpins) || value.paidSpins < 1)
  )
    errors.push('paidSpins must be a positive integer.');
  if (!isRecord(value.featureTriggerFrequencyByScatterCount))
    errors.push('featureTriggerFrequencyByScatterCount must be an object.');
  else {
    for (const key of Object.keys(value.featureTriggerFrequencyByScatterCount)) {
      const frequency = value.featureTriggerFrequencyByScatterCount[key];
      if (
        !['3', '4', '5'].includes(key) ||
        typeof frequency !== 'number' ||
        !Number.isFinite(frequency)
      )
        errors.push(
          `featureTriggerFrequencyByScatterCount.${key} must be a finite 3/4/5 Scatter frequency.`,
        );
    }
  }
  if (!isRecord(value.featureLengthPercentiles))
    errors.push('featureLengthPercentiles must be an object.');
  else
    for (const field of percentileFields)
      if (typeof value.featureLengthPercentiles[field] !== 'number')
        errors.push(`featureLengthPercentiles.${field} must be a number.`);
  if (
    !Array.isArray(value.confidenceInterval95) ||
    value.confidenceInterval95.length !== 2 ||
    value.confidenceInterval95.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))
  )
    errors.push('confidenceInterval95 must contain exactly two finite numbers.');
  if (!Array.isArray(value.payoutDistribution) || value.payoutDistribution.length === 0)
    errors.push('payoutDistribution must be a non-empty array.');
  else value.payoutDistribution.forEach((bucket, index) => validateBucket(bucket, index, errors));
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, report: value as unknown as SimulationReport };
}

export function parseSimulationReport(json: string): ValidationResult {
  try {
    return validateSimulationReport(JSON.parse(json) as unknown);
  } catch (error: unknown) {
    return {
      ok: false,
      errors: [
        `Malformed JSON: ${error instanceof Error ? error.message : 'unable to parse file'}`,
      ],
    };
  }
}
