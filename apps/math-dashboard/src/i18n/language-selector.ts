import { dictionary, isDashboardLocale } from './index.js';
import type { DashboardLocale } from './types.js';

export const DASHBOARD_LANGUAGE_OPTIONS = [
  { locale: 'en', flag: 'gb.svg' },
  { locale: 'pt-BR', flag: 'br.svg' },
  { locale: 'zh-CN', flag: 'cn.svg' },
  { locale: 'fil-PH', flag: 'ph.svg' },
] as const satisfies readonly { readonly locale: DashboardLocale; readonly flag: string }[];

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/gu, (character) => {
    const entities: Readonly<Record<string, string>> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });

export function languageButtons(locale: DashboardLocale, baseUrl: string): string {
  return DASHBOARD_LANGUAGE_OPTIONS.map(({ locale: code, flag }) => {
    const label = dictionary(code).languageName;
    const safeLabel = escapeHtml(label);
    return `<button type="button" data-locale="${code}" aria-label="${safeLabel}" title="${safeLabel}" aria-pressed="${String(code === locale)}"><img src="${baseUrl}flags/${flag}" alt=""> <span>${safeLabel}</span></button>`;
  }).join('');
}

export function bindLanguageButtons(
  root: ParentNode,
  onSelect: (locale: DashboardLocale) => void,
): void {
  root.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach((button) => {
    const select = (): void => {
      const locale = button.dataset.locale;
      if (isDashboardLocale(locale)) onSelect(locale);
    };
    button.addEventListener('click', select);
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      select();
    });
  });
}
