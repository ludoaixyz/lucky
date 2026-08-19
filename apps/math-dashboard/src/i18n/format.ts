import type { DashboardLocale } from './types.js';

const intlLocale = (locale: DashboardLocale): string => (locale === 'en' ? 'en-US' : locale);

export function formatNullableMetric(
  value: number | string | null | undefined,
  formatter: (value: number | string) => string = String,
  unavailable = 'N/A',
): string {
  if (
    value === null ||
    value === undefined ||
    (typeof value === 'number' && !Number.isFinite(value)) ||
    (typeof value === 'string' && value.trim() === '')
  )
    return unavailable;
  return formatter(value);
}

export function formatInteger(value: number | null, locale: DashboardLocale): string {
  return formatNullableMetric(value, (amount) =>
    new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(Number(amount)),
  );
}

export function formatDecimal(value: number | null, locale: DashboardLocale, digits = 2): string {
  return formatNullableMetric(value, (amount) =>
    new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits }).format(
      Number(amount),
    ),
  );
}

export function formatFixedDecimal(
  value: number | null,
  locale: DashboardLocale,
  digits: number,
): string {
  return formatNullableMetric(value, (amount) =>
    new Intl.NumberFormat(intlLocale(locale), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(amount)),
  );
}

export function formatPercent(value: number | null, locale: DashboardLocale, digits = 2): string {
  return formatNullableMetric(value, (amount) =>
    new Intl.NumberFormat(intlLocale(locale), {
      style: 'percent',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(amount)),
  );
}

export function formatPercentRange(
  lower: number | null,
  upper: number | null,
  locale: DashboardLocale,
  digits = 2,
): string {
  return lower === null || upper === null
    ? 'N/A'
    : `${formatPercent(lower, locale, digits)}–${formatPercent(upper, locale, digits)}`;
}

export function formatAdaptivePercent(value: number | null, locale: DashboardLocale): string {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  if (value > 0 && value < 0.0001) return `<${formatPercent(0.0001, locale, 2)}`;
  const digits = value > 0 && value < 0.001 ? 3 : 2;
  return formatPercent(value, locale, digits);
}

export function formatCredits(value: number | null, locale: DashboardLocale): string {
  return value === null || !Number.isFinite(value)
    ? 'N/A'
    : `${formatFixedDecimal(value, locale, 2)} credits`;
}

export function formatMultiplier(
  value: number | null,
  locale: DashboardLocale,
  digits = 2,
): string {
  return value === null || !Number.isFinite(value)
    ? 'N/A'
    : `${formatFixedDecimal(value, locale, digits)}×`;
}

export function formatOneIn(
  value: number | null,
  locale: DashboardLocale,
  prefix = '1 in',
): string {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  return value > 0 ? `${prefix} ${formatInteger(1 / value, locale)}` : '—';
}

export function formatDate(value: string | Date | null, locale: DashboardLocale): string {
  if (value === null || (typeof value === 'string' && !value.trim())) return 'N/A';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatCompact(value: number, locale: DashboardLocale): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact' }).format(value);
}
