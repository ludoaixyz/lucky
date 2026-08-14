export interface ValidationIssue {
  field: string;
  message: string;
}
export type RawValidationResult =
  { ok: true; value: Record<string, unknown> } | { ok: false; errors: ValidationIssue[] };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export function identifySchema(value: unknown): string | null {
  if (!record(value)) return null;
  if (record(value.metadata) && typeof value.metadata.schemaVersion === 'string')
    return value.metadata.schemaVersion;
  if (record(value.metrics) && typeof value.metrics.schemaVersion === 'string')
    return value.metrics.schemaVersion;
  return typeof value.schemaVersion === 'string' ? value.schemaVersion : null;
}
export function parseRawReport(json: string): RawValidationResult {
  try {
    const value: unknown = JSON.parse(json);
    return record(value)
      ? { ok: true, value }
      : { ok: false, errors: [{ field: '$', message: 'report must be a JSON object' }] };
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          field: '$',
          message: `malformed JSON: ${error instanceof Error ? error.message : 'parse failed'}`,
        },
      ],
    };
  }
}
export function finite(
  value: unknown,
  path: string,
  errors: ValidationIssue[],
  options: { ratio?: boolean; integer?: boolean; positive?: boolean } = {},
): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({ field: path, message: `${path} must be a finite number` });
    return false;
  }
  if (value < 0 || (options.positive && value === 0))
    errors.push({
      field: path,
      message: `${path} must be ${options.positive ? 'positive' : 'non-negative'}`,
    });
  if (options.integer && !Number.isSafeInteger(value))
    errors.push({ field: path, message: `${path} must be a safe integer` });
  if (options.ratio && value > 1)
    errors.push({ field: path, message: `${path} must be between 0 and 1` });
  return true;
}
export { record as isRecord };
