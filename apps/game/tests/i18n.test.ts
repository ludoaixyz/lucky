// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDomTranslations,
  bindDomLocalization,
  DEFAULT_LOCALE,
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
    expect(SUPPORTED_LOCALES).toEqual(['en-US', 'pt-BR', 'zh-CN']);
    expect(DEFAULT_LOCALE).toBe('en-US');
    const reference = Object.keys(TRANSLATIONS['en-US'].static).sort();
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(TRANSLATIONS[locale].static).sort()).toEqual(reference);
      expect(Object.keys(TRANSLATIONS[locale].messages).sort()).toEqual(
        Object.keys(TRANSLATIONS['en-US'].messages).sort(),
      );
      expect(TRANSLATIONS[locale].controls.spin).toBe('SPIN');
    }
  });

  it('restores supported preferences and safely maps browser languages', () => {
    expect(resolveInitialLocale('pt-BR', 'en-GB')).toBe('pt-BR');
    expect(resolveInitialLocale('unsupported', 'en-GB')).toBe('en-US');
    expect(localeFromBrowser('pt')).toBe('pt-BR');
    expect(localeFromBrowser('pt-PT')).toBe('pt-BR');
    expect(localeFromBrowser('zh-CN')).toBe('zh-CN');
    expect(localeFromBrowser('zh-Hans-SG')).toBe('zh-CN');
    expect(localeFromBrowser('fr-FR')).toBe('en-US');
  });

  it('persists language changes without replacing game-control state', () => {
    document.body.innerHTML = `
      <nav data-i18n-aria-label="languageSelector">
        <button data-locale="en-US" aria-pressed="true">US</button>
        <button data-locale="pt-BR" aria-pressed="false">BR</button>
        <button data-locale="zh-CN" aria-pressed="false">CN</button>
      </nav>
      <span data-i18n="credits">Credits</span>
      <strong id="credits">1,005</strong>
      <input id="bet-control" value="3"><input id="spins-control" value="2"><input id="speed-control" value="0">
      <p id="language-announcement"></p>`;
    const localization = new Localization('en-US', preferenceStorage);
    const dispose = bindDomLocalization(localization);
    document.querySelector<HTMLButtonElement>('[data-locale="pt-BR"]')?.click();

    expect(document.documentElement.lang).toBe('pt-BR');
    expect(document.querySelector('[data-i18n="credits"]')?.textContent).toBe('Créditos');
    expect(document.querySelector('[data-locale="pt-BR"]')?.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(preferenceStorage.getItem(LOCALE_STORAGE_KEY)).toBe('pt-BR');
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
  });

  it('uses locale-aware singular and plural spin labels', () => {
    expect(TRANSLATIONS['en-US'].controls.spinsValue(1)).toBe('1 spin');
    expect(TRANSLATIONS['en-US'].controls.spinsValue(5)).toBe('5 spins');
    expect(TRANSLATIONS['pt-BR'].controls.spinsValue(1)).toBe('1 giro');
    expect(TRANSLATIONS['pt-BR'].controls.spinsValue(5)).toBe('5 giros');
    expect(TRANSLATIONS['zh-CN'].controls.spinsValue(5)).toBe('5 次旋转');
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
    diagnostics.dispose();
    vi.unstubAllGlobals();
  });

  it('keeps title, visible SPIN label, local flags, and GitHub Pages-safe paths', async () => {
    const html = await readFile(resolve(process.cwd(), 'apps/game/index.html'), 'utf8');
    expect(html).toContain('<title>LUCKY888</title>');
    expect(html).toContain('>\n            SPIN\n          </button>');
    expect(html.match(/%BASE_URL%assets\/flags\/(?:us|br|cn)\.svg/gu)).toHaveLength(3);
    for (const flag of ['us', 'br', 'cn']) {
      await expect(
        readFile(resolve(process.cwd(), `apps/game/public/assets/flags/${flag}.svg`), 'utf8'),
      ).resolves.toContain('<svg');
    }
  });
});
