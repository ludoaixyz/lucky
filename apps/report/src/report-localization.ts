import { en } from './i18n/en.js';
import { zhCN } from './i18n/zh-CN.js';

export const REPORT_LOCALES = ['en', 'zh-CN'] as const;
export type ReportLocale = (typeof REPORT_LOCALES)[number];

export interface ShellTranslation {
  readonly languageName: string;
  readonly languageSelector: string;
  readonly openPdf: string;
  readonly loading: string;
  readonly error: string;
  readonly interactiveError: string;
  readonly pageError: string;
  readonly reportLabel: string;
  readonly selected: string;
}

export const LOCALE_STORAGE_KEY = 'lucky888.locale';
export const SHELL_TRANSLATIONS: Record<ReportLocale, ShellTranslation> = {
  en,
  'zh-CN': zhCN,
};

const flags: Record<ReportLocale, string> = { en: 'gb.svg', 'zh-CN': 'cn.svg' };

export function isReportLocale(value: unknown): value is ReportLocale {
  return typeof value === 'string' && REPORT_LOCALES.includes(value as ReportLocale);
}

export function initialLocale(): ReportLocale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'en-US') return 'en';
    if (isReportLocale(saved)) return saved;
  } catch {
    // Preference storage is optional.
  }
  return 'en';
}

export function languageButtons(locale: ReportLocale): string {
  return REPORT_LOCALES.map((code) => {
    const label = SHELL_TRANSLATIONS[code].languageName;
    return `<button type="button" data-locale="${code}" aria-label="${label}" title="${label}" aria-pressed="${String(code === locale)}"><img src="${import.meta.env.BASE_URL}flags/${flags[code]}" alt=""><span>${label}</span></button>`;
  }).join('');
}

export function persistLocale(locale: ReportLocale): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Preference storage is optional.
  }
}
