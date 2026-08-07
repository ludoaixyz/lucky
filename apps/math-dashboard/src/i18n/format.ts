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

export function formatDate(value: string | Date, locale: DashboardLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

export function formatCompact(value: number, locale: DashboardLocale): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact' }).format(value);
}
