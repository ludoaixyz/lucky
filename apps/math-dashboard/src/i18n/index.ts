import { TRANSLATIONS } from './dictionaries.js';
import { DASHBOARD_LOCALES, type DashboardLocale } from './types.js';
export { TRANSLATIONS, DASHBOARD_LOCALES };
export type { DashboardLocale, DashboardTranslations } from './types.js';
export const DASHBOARD_LOCALE_STORAGE_KEY = 'lucky888.dashboard.locale';
export const isDashboardLocale = (v: unknown): v is DashboardLocale =>
  typeof v === 'string' && DASHBOARD_LOCALES.includes(v as DashboardLocale);
export const browserDashboardLocale = (v?: string): DashboardLocale => {
  const x = v?.toLowerCase() ?? '';
  if (x.startsWith('pt')) return 'pt-BR';
  if (x.startsWith('zh')) return 'zh-CN';
  if (x.startsWith('fil') || x.startsWith('tl')) return 'fil-PH';
  return 'en';
};
export const resolveDashboardLocale = (
  user: unknown,
  _report: unknown,
  browser?: string,
): DashboardLocale => (isDashboardLocale(user) ? user : browserDashboardLocale(browser));
export const dictionary = (locale: DashboardLocale) => TRANSLATIONS[locale];
export const readStoredLocale = (
  storage: Pick<Storage, 'getItem'> | undefined,
): DashboardLocale | null => {
  try {
    const x = storage?.getItem(DASHBOARD_LOCALE_STORAGE_KEY);
    return isDashboardLocale(x) ? x : null;
  } catch {
    return null;
  }
};
export const persistDashboardLocale = (
  storage: Pick<Storage, 'setItem'> | undefined,
  locale: DashboardLocale,
): void => {
  try {
    storage?.setItem(DASHBOARD_LOCALE_STORAGE_KEY, locale);
  } catch {
    /* Preference storage is optional. */
  }
};
