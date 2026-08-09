// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDomTranslations,
  bindDomLocalization,
  DEFAULT_LOCALE,
  formatCredits,
  formatDecimal,
  formatNumber,
  formatPercent,
  formatTime,
  LOCALE_STORAGE_KEY,
  Localization,
  localeFromBrowser,
  resolveInitialLocale,
  SUPPORTED_LOCALES,
  TRANSLATIONS,
} from '../src/i18n/index.js';
import { attachDiagnostics } from '../src/diagnostics/dom-diagnostics.js';
import type { CompletedSpin } from '../src/diagnostics/types.js';

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

let preferenceStorage: Storage;

function dictionaryShape(value: unknown, prefix = ''): string[] {
  if (typeof value === 'function' || typeof value === 'string') return [prefix];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .flatMap(([key, child]) => dictionaryShape(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

const completedSpin: CompletedSpin = {
  timestamp: '2026-08-06T12:34:56.000Z',
  betCredits: 5,
  uncappedBaseWinCredits: 10,
  uncappedFeatureWinCredits: 0,
  uncappedTotalWinCredits: 10,
  creditedTotalWinCredits: 10,
  capReductionCredits: 0,
  creditsBefore: 1000,
  creditsAfter: 1005,
  featureTriggered: false,
  scatterCount: 0,
  initialFreeSpins: 0,
  totalFreeSpinsPlayed: 0,
  totalRetriggeredSpins: 0,
  retriggerCount: 0,
  maximumWinApplied: false,
  feature: null,
  outcome: {
    visibleWindow: [['A'], ['K'], ['Q']],
    reelStops: [1, 2, 3],
    lineWins: [{ paylineId: 'L1', symbolId: 'A', count: 3, awardCredits: 10 }],
  },
};

beforeEach(() => {
  preferenceStorage = createMemoryStorage();
  document.documentElement.lang = 'en-US';
});

describe('locale contract and resolution', () => {
  it('provides exactly the supported complete dictionaries and defaults to en-US', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en-US', 'pt-BR', 'zh-CN', 'fil-PH']);
    expect(DEFAULT_LOCALE).toBe('en-US');
    const reference = dictionaryShape(TRANSLATIONS['en-US']);
    for (const locale of SUPPORTED_LOCALES) {
      expect(dictionaryShape(TRANSLATIONS[locale])).toEqual(reference);
      expect(TRANSLATIONS[locale].controls.spin).toBe('SPIN');
    }
  });

  it('restores supported preferences and safely maps browser languages', () => {
    expect(resolveInitialLocale('pt-BR', 'en-GB')).toBe('pt-BR');
    expect(resolveInitialLocale('fil-PH', 'fr-FR')).toBe('fil-PH');
    expect(resolveInitialLocale('unsupported', 'en-GB')).toBe('en-US');
    expect(localeFromBrowser('pt')).toBe('pt-BR');
    expect(localeFromBrowser('pt-PT')).toBe('pt-BR');
    expect(localeFromBrowser('zh-CN')).toBe('zh-CN');
    expect(localeFromBrowser('zh-Hans-SG')).toBe('zh-CN');
    expect(localeFromBrowser('fil')).toBe('fil-PH');
    expect(localeFromBrowser('fil-PH')).toBe('fil-PH');
    expect(localeFromBrowser('fil-Latn-PH')).toBe('fil-PH');
    expect(localeFromBrowser('tl')).toBe('fil-PH');
    expect(localeFromBrowser('tl-PH')).toBe('fil-PH');
    expect(localeFromBrowser('fr-FR')).toBe('en-US');
  });

  it('persists language changes without replacing game-control state', () => {
    document.body.innerHTML = `
      <nav data-i18n-aria-label="languageSelector">
        <button data-locale="en-US" aria-pressed="true">US</button>
        <button data-locale="pt-BR" aria-pressed="false">BR</button>
        <button data-locale="zh-CN" aria-pressed="false">CN</button>
        <button data-locale="fil-PH" aria-label="Filipino" aria-pressed="false">PH</button>
      </nav>
      <span data-i18n="credits">Credits</span>
      <strong id="credits">1,005</strong>
      <input id="bet-control" value="3"><input id="spins-control" value="2"><input id="speed-control" value="0">
      <p id="language-announcement"></p>`;
    const localization = new Localization('en-US', preferenceStorage);
    const dispose = bindDomLocalization(localization);
    document.querySelector<HTMLButtonElement>('[data-locale="fil-PH"]')?.click();

    expect(document.documentElement.lang).toBe('fil-PH');
    expect(document.querySelector('[data-i18n="credits"]')?.textContent).toBe('Credits');
    expect(document.querySelector('[data-locale="fil-PH"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(preferenceStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fil-PH');
    expect(resolveInitialLocale(preferenceStorage.getItem(LOCALE_STORAGE_KEY), 'en-US')).toBe(
      'fil-PH',
    );
    expect(document.querySelector('#language-announcement')?.textContent).toBe(
      'Napili ang Filipino.',
    );
    expect(document.querySelector('#credits')?.textContent).toBe('1,005');
    expect(document.querySelector<HTMLInputElement>('#bet-control')?.value).toBe('3');
    expect(document.querySelector<HTMLInputElement>('#spins-control')?.value).toBe('2');
    expect(document.querySelector<HTMLInputElement>('#speed-control')?.value).toBe('0');
    dispose();
  });
});

describe('localized copy', () => {
  it('interpolates the required completion message in all locales', () => {
    const params = { completed: 10, total: 10, current: 10, amount: 520 };
    expect(TRANSLATIONS['en-US'].messages.sequenceCompleted(params)).toBe(
      '10/10 spins completed · Spin 10/10 · Won $520.',
    );
    expect(TRANSLATIONS['pt-BR'].messages.sequenceCompleted(params)).toBe(
      '10/10 giros concluídos · Giro 10/10 · Ganhou $520.',
    );
    expect(TRANSLATIONS['zh-CN'].messages.sequenceCompleted(params)).toBe(
      '已完成 10/10 次旋转 · 第 10/10 次 · 赢得 $520。',
    );
    expect(TRANSLATIONS['fil-PH'].messages.sequenceCompleted(params)).toBe(
      '10/10 spin ang natapos · Spin 10/10 · Nanalo ng $520.',
    );
  });

  it('uses locale-aware singular and plural spin labels', () => {
    expect(TRANSLATIONS['en-US'].controls.spinsValue(1)).toBe('1 spin');
    expect(TRANSLATIONS['en-US'].controls.spinsValue(5)).toBe('5 spins');
    expect(TRANSLATIONS['pt-BR'].controls.spinsValue(1)).toBe('1 giro');
    expect(TRANSLATIONS['pt-BR'].controls.spinsValue(5)).toBe('5 giros');
    expect(TRANSLATIONS['zh-CN'].controls.spinsValue(5)).toBe('5 次旋转');
    expect(TRANSLATIONS['fil-PH'].controls.spinsValue(1)).toBe('1 spin');
    expect(TRANSLATIONS['fil-PH'].controls.spinsValue(5)).toBe('5 spin');
    expect(TRANSLATIONS['fil-PH'].messages.freeSpinsAwarded({ count: 1 })).toBe(
      'Nakatanggap ng 1 libreng spin.',
    );
    expect(TRANSLATIONS['fil-PH'].messages.freeSpinsAwarded({ count: 5 })).toBe(
      'Nakatanggap ng 5 libreng spin.',
    );
  });

  it('renders Filipino feature progress, retriggers, final wins, and payline messages', () => {
    expect(
      TRANSLATIONS['fil-PH'].messages.freeSpinProgress({
        paidCurrent: 2,
        paidTotal: 5,
        current: 3,
        total: 9,
        remaining: 6,
      }),
    ).toBe('Bayad na spin 2/5 · Libreng spin 3/9 · 6 spin ang natitira.');
    expect(TRANSLATIONS['fil-PH'].messages.retrigger({ count: 2, subtotal: 1250 })).toBe(
      'Nagdagdag ng 2 libreng spin · Feature subtotal: $1,250.',
    );
    expect(
      TRANSLATIONS['fil-PH'].messages.finalWin({ amount: 1520, base: 20, feature: 1500 }),
    ).toBe('Nanalo ng $1,520 · Base $20 · Feature $1,500.');
    expect(TRANSLATIONS['fil-PH'].presentation.winningPaylines(1)).toBe('1 panalong payline');
    expect(TRANSLATIONS['fil-PH'].presentation.winningPaylines(3)).toBe('3 panalong payline');
  });

  it('formats Filipino values through the centralized Intl helpers', () => {
    const timestamp = new Date('2026-08-06T12:34:56.000Z');
    expect(formatNumber('fil-PH', 1234.5)).toBe(new Intl.NumberFormat('fil-PH').format(1234.5));
    expect(formatDecimal('fil-PH', 9.2, 2)).toBe(
      new Intl.NumberFormat('fil-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(9.2),
    );
    expect(formatCredits('fil-PH', 1234)).toBe(`$${formatNumber('fil-PH', 1234)}`);
    expect(formatPercent('fil-PH', 0.9537)).toBe(
      new Intl.NumberFormat('fil-PH', {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(0.9537),
    );
    expect(formatTime('fil-PH', timestamp)).toBe(
      new Intl.DateTimeFormat('fil-PH', { timeStyle: 'medium' }).format(timestamp),
    );
  });

  it('updates static text and html lang', () => {
    document.body.innerHTML = '<span data-i18n="latestWin">Latest Win</span>';
    const localization = new Localization('zh-CN');
    applyDomTranslations(localization);
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(document.body.textContent).toBe('最近赢分');
  });
});

describe('localized diagnostics and invariant artifacts', () => {
  it('rerenders structured diagnostic cards when locale changes', () => {
    document.body.innerHTML = `
      <span id="diagnostics-spins"></span><span id="diagnostics-wagered"></span>
      <span id="diagnostics-won"></span><span id="diagnostics-rtp"></span>
      <span id="diagnostics-uncapped"></span><span id="diagnostics-cap-reduction"></span>
      <span id="diagnostics-trigger-rate"></span><span id="diagnostics-feature-length"></span>
      <p id="history-empty"></p><ol id="spin-history"></ol><a id="download-csv"></a>`;
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    });
    const localization = new Localization('en-US');
    const diagnostics = attachDiagnostics(localization);
    diagnostics.recordCompletedSpin(completedSpin);
    expect(document.querySelector('.history-card')?.textContent).toContain('Spin #1');

    localization.setLocale('pt-BR');
    expect(document.querySelector('.history-card')?.textContent).toContain('Giro #1');
    expect(document.querySelector('.history-card')?.textContent).toContain('Linhas premiadas');
    expect(document.querySelector('.history-card')?.textContent).toContain('L1:A×3=10');

    localization.setLocale('fil-PH');
    expect(document.querySelector('.history-card')?.textContent).toContain('Spin #1');
    expect(document.querySelector('.history-card')?.textContent).toContain('Mga Panalong Payline');
    expect(document.querySelector('.history-card')?.textContent).toContain('L1:A×3=10');
    diagnostics.dispose();
    vi.unstubAllGlobals();
  });

  it('keeps title, visible SPIN label, local flags, and GitHub Pages-safe paths', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    expect(html).toContain('<title>LUCKY888</title>');
    expect(html).toContain('>\n            SPIN\n          </button>');
    expect(html.match(/%BASE_URL%assets\/flags\/(?:us|br|cn|ph)\.svg/gu)).toHaveLength(4);
    expect(html).toContain('class="language-selector no-export"');
    expect(html).toMatch(
      /data-locale="fil-PH"[\s\S]*?aria-label="Filipino"[\s\S]*?title="Filipino"/u,
    );
    for (const flag of ['us', 'br', 'cn', 'ph']) {
      await expect(
        readFile(resolve(process.cwd(), `apps/game/public/assets/flags/${flag}.svg`), 'utf8'),
      ).resolves.toContain('<svg');
    }
  });
});
