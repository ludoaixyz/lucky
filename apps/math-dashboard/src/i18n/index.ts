import { TRANSLATIONS } from './dictionaries.js';
import { DASHBOARD_LOCALES } from './types.js';
import type { DashboardLocale, DashboardTranslations } from './types.js';

export { TRANSLATIONS } from './dictionaries.js';
export { DASHBOARD_LOCALES } from './types.js';
export type { DashboardLocale, DashboardTranslations } from './types.js';

export const DASHBOARD_LOCALE_STORAGE_KEY = 'lucky888.dashboard.locale';
export const REPORT_LOCALES_STORAGE_KEY = 'lucky888.dashboard.reportLocales';

export type TranslationKey =
  | `dashboard.${keyof DashboardTranslations['dashboard']}`
  | `metrics.${keyof DashboardTranslations['metrics']}`
  | `charts.${keyof DashboardTranslations['charts']}`;

export function isDashboardLocale(value: unknown): value is DashboardLocale {
  return typeof value === 'string' && DASHBOARD_LOCALES.includes(value as DashboardLocale);
}

export function browserDashboardLocale(language: string | undefined): DashboardLocale {
  const normalized = language?.toLowerCase() ?? '';
  if (normalized === 'pt' || normalized.startsWith('pt-')) return 'pt-BR';
  if (
    normalized === 'fil' ||
    normalized.startsWith('fil-') ||
    normalized === 'tl' ||
    normalized.startsWith('tl-')
  )
    return 'fil-PH';
  if (
    normalized === 'zh' ||
    normalized.startsWith('zh-cn') ||
    normalized.startsWith('zh-sg') ||
    normalized.startsWith('zh-hans')
  )
    return 'zh-CN';
  return 'en';
}

export function resolveDashboardLocale(
  userLocale: unknown,
  reportLocale: unknown,
  browserLanguage: string | undefined,
): DashboardLocale {
  if (isDashboardLocale(userLocale)) return userLocale;
  if (isDashboardLocale(reportLocale)) return reportLocale;
  return browserDashboardLocale(browserLanguage);
}

export function dictionary(locale: DashboardLocale): DashboardTranslations {
  return TRANSLATIONS[locale];
}

export function t(locale: DashboardLocale, key: TranslationKey): string {
  const separator = key.indexOf('.');
  const section = key.slice(0, separator) as 'dashboard' | 'metrics' | 'charts';
  const item = key.slice(separator + 1);
  const values = TRANSLATIONS[locale][section] as unknown as Readonly<Record<string, string>>;
  const translated = values[item];
  if (!translated) throw new Error(`Unknown dashboard translation key: ${key}`);
  return translated;
}

export function readStoredLocale(
  storage: Pick<Storage, 'getItem'> | undefined,
): DashboardLocale | null {
  try {
    const value = storage?.getItem(DASHBOARD_LOCALE_STORAGE_KEY);
    return isDashboardLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function readReportLocale(
  storage: Pick<Storage, 'getItem'> | undefined,
  reportId: string,
): DashboardLocale | null {
  try {
    const raw = storage?.getItem(REPORT_LOCALES_STORAGE_KEY);
    if (!raw) return null;
    const value = (JSON.parse(raw) as Record<string, unknown>)[reportId];
    return isDashboardLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function persistDashboardLocale(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined,
  locale: DashboardLocale,
  reportId: string,
): void {
  try {
    storage?.setItem(DASHBOARD_LOCALE_STORAGE_KEY, locale);
    const raw = storage?.getItem(REPORT_LOCALES_STORAGE_KEY);
    const reportLocales = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    reportLocales[reportId] = locale;
    storage?.setItem(REPORT_LOCALES_STORAGE_KEY, JSON.stringify(reportLocales));
  } catch {
    // Language switching remains available when preference storage is blocked.
  }
}
