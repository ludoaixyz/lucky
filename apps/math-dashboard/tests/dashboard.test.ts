// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExportOptions, createExportSnapshot, exportFilename } from '../src/export.js';
import {
  DASHBOARD_LOCALES,
  persistDashboardLocale,
  readReportLocale,
  readStoredLocale,
  resolveDashboardLocale,
  TRANSLATIONS,
} from '../src/i18n/index.js';
import { formatDate, formatDecimal, formatInteger, formatPercent } from '../src/i18n/format.js';
import { bindPrintLayout, setPrintLayout } from '../src/print.js';
import {
  comparisonRows,
  evaluateTargets,
  featureFrequencyOdds,
  isNestedDeterministicSamples,
  meetsAllTargets,
  reconcileReport,
  riskFlags,
} from '../src/reports/analysis.js';
import { parseSimulationReport, validateSimulationReport } from '../src/reports/validation.js';
import type { LoadedReport, SimulationReport } from '../src/types/simulation-report.js';

const millionJson = readFileSync(
  resolve(process.cwd(), 'apps/math-dashboard/public/reports/simulation-2026-1000000.json'),
  'utf8',
);
const thousandJson = readFileSync(
  resolve(process.cwd(), 'apps/math-dashboard/public/reports/simulation-2026-1000.json'),
  'utf8',
);

function reportFrom(json: string): SimulationReport {
  const result = parseSimulationReport(json);
  if (!result.ok) throw new Error(result.errors.map((issue) => issue.key).join(' '));
  return result.report;
}

function memoryStorage(): Storage {
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

function dictionaryShape(value: unknown, prefix = ''): string[] {
  if (typeof value === 'function' || typeof value === 'string') return [prefix];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .flatMap(([key, child]) => dictionaryShape(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

const million = reportFrom(millionJson);
const thousand = reportFrom(thousandJson);

describe('simulation report validation', () => {
  it('accepts complete deterministic Monte Carlo schema 1.2.0 reports', () => {
    const result = validateSimulationReport(JSON.parse(millionJson) as unknown);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.paidSpins).toBe(1_000_000);
  });

  it('rejects missing required metrics with useful field identifiers', () => {
    const malformed = { ...(JSON.parse(millionJson) as Record<string, unknown>) };
    delete malformed.creditedTotalRtp;
    const result = validateSimulationReport(malformed);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContainEqual({ key: 'finiteNumber', field: 'creditedTotalRtp' });
  });

  it('handles malformed JSON without throwing or storing rendered English', () => {
    const result = parseSimulationReport('{"schemaVersion":');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.key).toBe('malformedJson');
  });
});

describe('language-neutral management calculations', () => {
  it('reconciles RTP, payouts, and bucket totals', () => {
    expect(reconcileReport(million).every((check) => check.status === 'PASS')).toBe(true);
  });

  it('fails payout bucket reconciliation without correcting the report', () => {
    const changed = {
      ...million,
      payoutDistribution: million.payoutDistribution.map((bucket, index) =>
        index === 0 ? { ...bucket, count: bucket.count - 1 } : bucket,
      ),
    };
    expect(reconcileReport(changed).find((check) => check.key === 'bucketCounts')?.status).toBe(
      'FAIL',
    );
    expect(changed.payoutDistribution[0]?.count).toBe(665_032);
  });

  it('calculates feature odds and provisional targets independently of locale', () => {
    expect(featureFrequencyOdds(million)).toBeCloseTo(115.6203, 3);
    expect(evaluateTargets(million).every((target) => target.status === 'PASS')).toBe(true);
    expect(meetsAllTargets(million)).toBe(true);
  });

  it('returns semantic small-sample risk keys', () => {
    expect(riskFlags(thousand).map((flag) => flag.key)).toContain('smokeSample');
    expect(riskFlags({ ...million, paidSpins: 50_000 }).map((flag) => flag.key)).toContain(
      'limitedSample',
    );
  });

  it('calculates absolute and relative comparison differences', () => {
    const credited = comparisonRows(thousand, million).find((row) => row.key === 'creditedRtp');
    expect(credited?.absoluteDifference).toBeCloseTo(0.0543236, 7);
    expect(credited?.relativeDifference).toBeCloseTo(0.0604, 3);
  });

  it('identifies same-seed different-size reports as nested deterministic samples', () => {
    const loaded: LoadedReport[] = [
      { id: 'small', label: 'Small', source: 'built-in', report: thousand },
      { id: 'large', label: 'Large', source: 'built-in', report: million },
    ];
    expect(isNestedDeterministicSamples(loaded)).toBe(true);
  });
});

describe('dashboard localization', () => {
  it('provides exactly three structurally complete dictionaries', () => {
    expect(DASHBOARD_LOCALES).toEqual(['en', 'pt-BR', 'zh-CN']);
    const shape = dictionaryShape(TRANSLATIONS.en);
    for (const locale of DASHBOARD_LOCALES)
      expect(dictionaryShape(TRANSLATIONS[locale])).toEqual(shape);
  });

  it('uses the required professional terminology baseline', () => {
    expect(TRANSLATIONS['pt-BR'].dashboard.title).toBe('Painel de Desempenho Matemático');
    expect(TRANSLATIONS['pt-BR'].metrics.featureRtp).toBe('RTP do Recurso');
    expect(TRANSLATIONS['zh-CN'].dashboard.title).toBe('数学表现仪表板');
    expect(TRANSLATIONS['zh-CN'].metrics).toMatchObject({
      creditedRtp: '封顶后 RTP',
      uncappedRtp: '未封顶 RTP',
      featureRtp: '免费旋转 RTP',
      awardFrequency: '正派彩频率',
      netReturnFrequency: '回本频率',
      featureFrequency: '免费旋转触发频率',
      averageFeatureLength: '平均免费旋转局数',
      p95FeatureLength: '免费旋转局数 P95',
      maximumObservedWin: '模拟观测最高派彩',
      capHitFrequency: '封顶触发频率',
    });
    expect(TRANSLATIONS.en.status.PASS).toBe('Pass');
  });

  it('excludes deprecated literal terminology from visible Chinese metric and chart labels', () => {
    const visibleLabels = [
      ...Object.values(TRANSLATIONS['zh-CN'].metrics),
      ...Object.values(TRANSLATIONS['zh-CN'].metricDescriptions),
      ...Object.values(TRANSLATIONS['zh-CN'].charts),
    ].join('\n');
    for (const deprecated of [
      '获奖频率',
      '净回报频率',
      '平均功能时长',
      '功能长度百分位数',
      '封顶命中频率',
      '观测到的最高赢取',
    ])
      expect(visibleLabels).not.toContain(deprecated);
  });

  it('resolves locale using user, report, browser, then English precedence', () => {
    expect(resolveDashboardLocale('pt-BR', 'zh-CN', 'en-GB')).toBe('pt-BR');
    expect(resolveDashboardLocale(null, 'zh-CN', 'pt-PT')).toBe('zh-CN');
    expect(resolveDashboardLocale(null, null, 'pt-PT')).toBe('pt-BR');
    expect(resolveDashboardLocale(null, null, 'zh-Hans-SG')).toBe('zh-CN');
    expect(resolveDashboardLocale(null, null, 'fr-FR')).toBe('en');
  });

  it('persists the user locale globally and with the active report', () => {
    const storage = memoryStorage();
    persistDashboardLocale(storage, 'zh-CN', 'report-a');
    expect(readStoredLocale(storage)).toBe('zh-CN');
    expect(readReportLocale(storage, 'report-a')).toBe('zh-CN');
  });

  it('formats numbers, percentages, decimals, and dates by locale without changing values', () => {
    expect(formatInteger(1_000_000, 'en')).toBe('1,000,000');
    expect(formatInteger(1_000_000, 'pt-BR')).toBe('1.000.000');
    expect(formatInteger(1_000_000, 'zh-CN')).toBe('1,000,000');
    expect(formatPercent(0.9537, 'pt-BR')).toBe('95,37%');
    expect(formatDecimal(2.377, 'pt-BR', 3)).toBe('2,377');
    expect(formatDate(million.generatedAt, 'en')).not.toBe(
      formatDate(million.generatedAt, 'zh-CN'),
    );
    expect(DASHBOARD_LOCALES.map(() => million.creditedTotalRtp)).toEqual([
      0.9537236, 0.9537236, 0.9537236,
    ]);
  });

  it('renders grammatical dynamic summaries from locale templates', () => {
    const values = {
      rtp: '95.37%',
      spins: '1,000,000',
      awardFrequency: '33.50%',
      featureOdds: '115.6',
      averageLength: '9.3',
      metTargets: true,
    };
    expect(TRANSLATIONS.en.templates.summary(values)).toContain('The current profile');
    expect(TRANSLATIONS['pt-BR'].templates.summary(values)).toContain('O perfil atual');
    const chinese = TRANSLATIONS['zh-CN'].templates.summary(values);
    expect(chinese).toContain('当前配置在 1,000,000 次付费旋转模拟中的封顶后 RTP 为 95.37%');
    expect(chinese).toContain('平均每 115.6 次付费旋转触发一次免费旋转');
    expect(chinese).toContain('平均每次触发进行 9.3 局免费旋转');
  });

  it('adapts Chinese summaries for zero triggers, warnings, failures, unavailable values, and comparisons', () => {
    const base = {
      rtp: '95.37%',
      spins: '12,345,678',
      awardFrequency: '33.50%',
      featureOdds: '115.6',
      averageLength: '9.3',
      metTargets: true,
    } as const;
    expect(
      TRANSLATIONS['zh-CN'].templates.summary({
        ...base,
        featureOdds: null,
        averageLength: null,
        hasFeatureTriggers: false,
      }),
    ).toContain('本次模拟未观测到免费旋转触发');
    expect(TRANSLATIONS['zh-CN'].templates.summary({ ...base, overallStatus: 'WARN' })).toContain(
      '风险审查中存在警告项',
    );
    expect(
      TRANSLATIONS['zh-CN'].templates.summary({
        ...base,
        metTargets: false,
        overallStatus: 'FAIL',
      }),
    ).toContain('未满足全部临时管理目标');
    expect(TRANSLATIONS['zh-CN'].templates.summary({ ...base, rtp: null, spins: null })).toContain(
      '缺少生成完整摘要所需的可用指标',
    );
    expect(
      TRANSLATIONS['zh-CN'].templates.summary({ ...base, comparisonSelected: true }),
    ).toContain('所选对比报告不改变上述数值');
  });
});

describe('localized export and print behavior', () => {
  it('uses locale-specific immutable filenames and metadata', () => {
    const options = createExportOptions('pt-BR', million.configurationId, 'pdf');
    expect(Object.isFrozen(options)).toBe(true);
    expect(exportFilename(options)).toBe('lucky888_math-performance_pt-BR.pdf');
    expect(exportFilename(createExportOptions('zh-CN', million.configurationId, 'png'))).toBe(
      'lucky888_math-performance_zh-CN.png',
    );
  });

  it('keeps an export snapshot localized when the interactive source changes', () => {
    const source = document.createElement('div');
    source.innerHTML = '<main><h1>Painel de Desempenho Matemático</h1></main>';
    const options = createExportOptions('pt-BR', million.configurationId, 'png');
    const snapshot = createExportSnapshot(
      source,
      options,
      'Português',
      'Idioma: Português',
      '2026-08-06T14:35:00.000Z',
    );
    source.querySelector('h1')?.replaceChildren('Math Performance Dashboard');
    expect(snapshot.element.textContent).toContain('Painel de Desempenho Matemático');
    expect(snapshot.element.textContent).not.toContain('Math Performance Dashboard');
    expect(snapshot.metadata).toEqual({
      reportId: million.configurationId,
      locale: 'pt-BR',
      exportedAt: '2026-08-06T14:35:00.000Z',
    });
    expect(snapshot.element.dataset.exportLocale).toBe('pt-BR');
  });

  it('creates a Chinese export snapshot without interactive flags or mixed-language labels', () => {
    const source = document.createElement('div');
    source.innerHTML = `<header><h1>数学表现仪表板</h1><nav class="language-selector no-export">flags</nav></header><main><h2>封顶后 RTP</h2><h3>免费旋转触发构成</h3><strong>95.37%</strong></main>`;
    const options = createExportOptions('zh-CN', million.configurationId, 'png');
    const snapshot = createExportSnapshot(
      source,
      options,
      '简体中文',
      '报告语言：简体中文 · 配置：lucky888-balanced-base-v1 · 导出时间：2026年8月6日 20:49',
      '2026-08-06T14:35:00.000Z',
    );
    expect(snapshot.element.textContent).toContain('数学表现仪表板');
    expect(snapshot.element.textContent).toContain('免费旋转触发构成');
    expect(snapshot.element.textContent).toContain('报告语言：简体中文');
    expect(snapshot.element.textContent).not.toContain('Math Performance Dashboard');
    expect(snapshot.element.textContent).not.toContain('Painel de Desempenho Matemático');
    expect(snapshot.element.querySelector('.language-selector')).toBeNull();
    expect(snapshot.element.dataset.exportLocale).toBe('zh-CN');
    expect(exportFilename(options)).toContain('zh-CN');
  });

  it('keeps export secondary typography at a readable print size', () => {
    const css = readFileSync(resolve(process.cwd(), 'apps/math-dashboard/src/style.css'), 'utf8');
    expect(css).toMatch(/\.export-document \.axis-label,[\s\S]*font-size: 12px;/u);
    expect(css).toMatch(/table \{[\s\S]*font-size: 8\.5pt;/u);
    expect(css).toMatch(/\.export-metadata \{[\s\S]*font-size: 8\.5pt;/u);
  });

  it('includes the reviewed Chinese full-dashboard visual regression fixture', () => {
    const fixture = readFileSync(
      resolve(process.cwd(), 'apps/math-dashboard/tests/fixtures/zh-CN-dashboard-export.png'),
    );
    expect([...fixture.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(fixture.byteLength).toBeGreaterThan(1_000_000);
  });

  it('toggles the print layout class through print lifecycle events', () => {
    const dispose = bindPrintLayout();
    window.dispatchEvent(new Event('beforeprint'));
    expect(document.body.classList.contains('print-layout')).toBe(true);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.body.classList.contains('print-layout')).toBe(false);
    dispose();
    setPrintLayout(false);
  });
});
