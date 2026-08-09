import { enUS } from './locales/en-US.js';
import { filPH } from './locales/fil-PH.js';
import { ptBR } from './locales/pt-BR.js';
import { zhCN } from './locales/zh-CN.js';
import type {
  LocaleCode,
  MessageDescriptor,
  StaticTranslationKey,
  TranslationDictionary,
} from './types.js';
import { SUPPORTED_LOCALES } from './types.js';

export { SUPPORTED_LOCALES } from './types.js';
export type { LocaleCode, MessageDescriptor, TranslationDictionary } from './types.js';
export { formatCredits, formatDecimal, formatNumber, formatPercent, formatTime } from './format.js';

export const DEFAULT_LOCALE: LocaleCode = 'en-US';
export const LOCALE_STORAGE_KEY = 'lucky888.locale';

export const TRANSLATIONS = {
  'en-US': enUS,
  'pt-BR': ptBR,
  'zh-CN': zhCN,
  'fil-PH': filPH,
} as const satisfies Record<LocaleCode, TranslationDictionary>;

export function isSupportedLocale(value: unknown): value is LocaleCode {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as LocaleCode);
}

export function localeFromBrowser(language: string | undefined): LocaleCode {
  const normalized = language?.toLowerCase() ?? '';
  if (normalized === 'pt' || normalized.startsWith('pt-')) return 'pt-BR';
  if (
    normalized === 'zh' ||
    normalized.startsWith('zh-cn') ||
    normalized.startsWith('zh-sg') ||
    normalized.startsWith('zh-hans')
  )
    return 'zh-CN';
  if (
    normalized === 'fil' ||
    normalized.startsWith('fil-') ||
    normalized === 'tl' ||
    normalized.startsWith('tl-')
  )
    return 'fil-PH';
  return DEFAULT_LOCALE;
}

export function resolveInitialLocale(
  savedLocale: string | null | undefined,
  browserLanguage: string | undefined,
): LocaleCode {
  return isSupportedLocale(savedLocale) ? savedLocale : localeFromBrowser(browserLanguage);
}

type LocaleListener = (locale: LocaleCode) => void;
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export class Localization {
  private readonly listeners = new Set<LocaleListener>();
  private currentLocale: LocaleCode;

  constructor(
    locale: LocaleCode = DEFAULT_LOCALE,
    private readonly storage?: PreferenceStorage,
  ) {
    this.currentLocale = locale;
  }

  get locale(): LocaleCode {
    return this.currentLocale;
  }

  get dictionary(): TranslationDictionary {
    return TRANSLATIONS[this.currentLocale];
  }

  setLocale(locale: LocaleCode): void {
    if (locale === this.currentLocale) return;
    this.currentLocale = locale;
    try {
      this.storage?.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // A blocked preference store must never prevent language switching.
    }
    for (const listener of this.listeners) listener(locale);
  }

  renderMessage(message: MessageDescriptor): string {
    const renderer = this.dictionary.messages[message.key] as (params: object) => string;
    return renderer(message.params);
  }

  subscribe(listener: LocaleListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function safeSavedLocale(storage: PreferenceStorage | undefined): string | null {
  try {
    return storage?.getItem(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function createBrowserLocalization(): Localization {
  const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
  const language = typeof navigator === 'undefined' ? undefined : navigator.language;
  return new Localization(resolveInitialLocale(safeSavedLocale(storage), language), storage);
}

function isStaticKey(value: string): value is StaticTranslationKey {
  return Object.hasOwn(enUS.static, value);
}

export function applyDomTranslations(
  localization: Localization,
  root: ParentNode = document,
): void {
  const dictionary = localization.dictionary;
  document.documentElement.lang = localization.locale;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    if (!key || !isStaticKey(key)) throw new Error(`Unknown static translation key '${key ?? ''}'`);
    node.textContent = dictionary.static[key];
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((node) => {
    const key = node.dataset.i18nAriaLabel;
    if (!key || !isStaticKey(key)) throw new Error(`Unknown aria translation key '${key ?? ''}'`);
    node.setAttribute('aria-label', dictionary.static[key]);
  });
  root.querySelectorAll<HTMLImageElement>('[data-i18n-alt]').forEach((node) => {
    const key = node.dataset.i18nAlt;
    if (!key || !isStaticKey(key)) throw new Error(`Unknown alt translation key '${key ?? ''}'`);
    node.alt = dictionary.static[key];
  });
  root.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.locale === localization.locale));
  });
}

export function bindDomLocalization(localization: Localization): () => void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-locale]')];
  const announcement = document.querySelector<HTMLElement>('#language-announcement');
  const render = (): void => applyDomTranslations(localization);
  const handlers = buttons.map((button) => {
    const handler = (): void => {
      const locale = button.dataset.locale;
      if (!isSupportedLocale(locale)) return;
      localization.setLocale(locale);
      if (announcement)
        announcement.textContent = localization.dictionary.controls.languageSelected(
          localization.dictionary.languageName,
        );
    };
    button.addEventListener('click', handler);
    return { button, handler };
  });
  render();
  const unsubscribe = localization.subscribe(render);
  return () => {
    unsubscribe();
    for (const { button, handler } of handlers) button.removeEventListener('click', handler);
  };
}
