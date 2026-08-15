import type { DashboardLocale } from './types.js';

const intlLocale = (locale: DashboardLocale): string => (locale === 'en' ? 'en-US' : locale);

export function formatInteger(value: number, locale: DashboardLocale): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
}

export function formatDecimal(value: number, locale: DashboardLocale, digits = 2): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits }).format(value);
}

export function formatFixedDecimal(value: number, locale: DashboardLocale, digits: number): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value: number, locale: DashboardLocale, digits = 2): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercentRange(
  lower: number,
  upper: number,
  locale: DashboardLocale,
  digits = 2,
): string {
  return `${formatPercent(lower, locale, digits)}\u2013${formatPercent(upper, locale, digits)}`;
}

export function formatAdaptivePercent(value: number, locale: DashboardLocale): string {
  if (value > 0 && value < 0.0001) return `<${formatPercent(0.0001, locale, 2)}`;
  const digits = value > 0 && value < 0.001 ? 3 : 2;
  return formatPercent(value, locale, digits);
}

export function formatCredits(value: number, locale: DashboardLocale): string {
  return `${formatFixedDecimal(value, locale, 2)} credits`;
}

export function formatMultiplier(value: number, locale: DashboardLocale, digits = 2): string {
  return `${formatFixedDecimal(value, locale, digits)}×`;
}

export function formatOneIn(value: number, locale: DashboardLocale, prefix = '1 in'): string {
  return value > 0 ? `${prefix} ${formatInteger(1 / value, locale)}` : '—';
}

export function formatDate(value: string | Date, locale: DashboardLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

export function formatCompact(value: number, locale: DashboardLocale): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact' }).format(value);
}
