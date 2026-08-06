import type { LocaleCode } from './types.js';

export function formatNumber(locale: LocaleCode, value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatCredits(locale: LocaleCode, value: number): string {
  return `$${formatNumber(locale, value)}`;
}

export function formatPercent(locale: LocaleCode, ratio: number, decimals = 2): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(ratio);
}

export function formatTime(locale: LocaleCode, value: Date): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(value);
}
