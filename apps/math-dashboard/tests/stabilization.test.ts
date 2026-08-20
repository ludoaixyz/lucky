import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderDashboard, renderDetailedExportDocument } from '../src/components/dashboard.js';
import {
  renderCompareDashboard,
  renderCompareExportDocument,
  renderSetManager,
  seriesNumberForSet,
} from '../src/components/workspace.js';
import { normalizeBasePath, resolveDashboardBase } from '../src/config/base-path.js';
import { TRANSLATIONS } from '../src/i18n/index.js';
import { formatAdaptivePercent, formatPercentRange } from '../src/i18n/format.js';
import {
  DASHBOARD_LANGUAGE_OPTIONS,
  flagAssetPath,
  languageButtons,
} from '../src/i18n/language-selector.js';
import {
  normalizeBundledReport,
  normalizeImportedReport,
  parseImportedSimulationReport,
  SUPPORTED_REPORT_SCHEMA_VERSIONS,
} from '../src/reports/report-normalizer.js';
import { evaluateTargetValue } from '../src/reports/analysis.js';
import {
  percentagePointDelta,
  relativePercentageDelta,
  tailFrequencyDelta,
} from '../src/reports/comparison-delta.js';
import {
  FIXED_TAIL_OCCURRENCES,
  formatReciprocalTailTick,
  reciprocalTailScale,
  reciprocalTailY,
} from '../src/reports/tail-axis.js';
import type { SimulationReport } from '../src/types/simulation-report.js';
import { createWorkspace, importIntoSet } from '../src/workspace/simulation-workspace.js';

function rawFixture(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        'apps/math-dashboard/public/reports/bathala-simulation-2026-1000000.json',
      ),
      'utf8',
    ),
  ) as Record<string, unknown>;
}
function reportFixture(): SimulationReport {
  const result = normalizeBundledReport(rawFixture());
  if (!result.ok) throw new Error('fixture');
  return result.report;
}
describe('dark print/export CSS contract', () => {
  it('contains one layout-only print block and no white/light print theme', () => {
    const css = readFileSync(resolve(process.cwd(), 'apps/math-dashboard/src/style.css'), 'utf8');
    const exportSource = readFileSync(
      resolve(process.cwd(), 'apps/math-dashboard/src/export.ts'),
      'utf8',
    );
    expect(css.match(/@media\s+print/gu)).toHaveLength(1);
    const print = css.slice(css.indexOf('@media print'));
    expect(print).not.toMatch(
      /color-scheme\s*:\s*light|background\s*:\s*#fff|color\s*:\s*#111827/iu,
    );
    expect(print).toContain('print-color-adjust: exact');
    expect(print).toContain('A4 portrait');
    expect(print).toContain('margin: 7mm');
    expect(css).not.toMatch(/A4\s+landscape|1400px|transform\s*:\s*rotate/iu);
    expect(css).toContain('width: 210mm');
    expect(css).toContain('table-layout: fixed');
    expect(css).toContain('--comparison-metric-column: 33%');
    expect(css).toContain('--comparison-sim-column: 23%');
    expect(css).toContain('--comparison-delta-column: 21%');
    expect(css).toContain('border-left: 1px solid var(--line)');
    expect(css).toContain('border-left: 1.5px solid var(--line-strong)');
    expect(css).toMatch(/\.comparison-line\s*\{[^}]*stroke-width:\s*1\.5/isu);
    expect(css).not.toMatch(/\.comparison-line\s*\{[^}]*stroke-width:\s*2\.5/isu);
    expect(exportSource).toContain('const width = snapshot.scrollWidth');
    expect(exportSource).not.toMatch(/Math\.max\(1200|orientation:\s*['"]landscape/iu);
  });
});

describe('portrait export document structure', () => {
  it('renders three deliberate comparison pages with executive metrics and full-width columns', () => {
    const report = reportFixture();
    const longConfiguration = {
      ...report,
      metadata: {
        ...report.metadata,
        configurationId: 'extremely-long-production-configuration-identifier-for-width-testing',
      },
    };
    const deep = {
      ...longConfiguration,
      simulation: { ...report.simulation, spins: 1_000_000, seed: report.simulation.seed + 1 },
    };
    let workspace = createWorkspace();
    workspace = importIntoSet(
      workspace,
      'sim-1',
      { ok: true, report: longConfiguration },
      '100k.json',
    );
    workspace = importIntoSet(workspace, 'sim-2', { ok: true, report: deep }, '1m.json');
    workspace = { ...workspace, baselineSetId: 'sim-1' };
    const html = renderCompareExportDocument(workspace, 'en', TRANSLATIONS.en.labels);
    expect(html.match(/class="export-page /gu)).toHaveLength(3);
    expect(html).toContain('Simulation Spins');
    expect(html).toContain('1,000,000');
    expect(html).toContain('95% RTP Confidence Interval');
    expect(html).toContain('Baseline: Sim 1');
    expect(html).toContain('Same configuration');
    expect(html).toContain('Detailed Comparison');
    expect(html).toContain('Comparative Distribution');
    expect(html.match(/class="comparison-sim-column"/gu)?.length).toBe(6);
    expect(html.match(/class="comparison-delta-column"/gu)?.length).toBe(3);
    expect(html).toContain('Sim 2 vs Sim 1');
    expect(html).not.toContain('Sim 3');
  });

  it('keeps generated comparison output free of mojibake', () => {
    const report = {
      ...reportFixture(),
      metrics: {
        ...reportFixture().metrics,
        confidenceInterval95: [0.61, 0.6609] as [number, number],
      },
    };
    let workspace = createWorkspace();
    workspace = importIntoSet(workspace, 'sim-1', { ok: true, report }, 'one.json');
    const html = renderCompareExportDocument(workspace, 'en', TRANSLATIONS.en.labels);
    expect(html).toContain('61.00%\u201366.09%');
    expect(html).not.toMatch(/\u00e2(?:\u20ac|\u2020)|\u00c3\u0192|\u00ef\u00bf\u00bd|\ufffd/u);
    for (const locale of ['en', 'pt-BR', 'zh-CN', 'fil-PH'] as const)
      expect(formatPercentRange(0.61, 0.6609, locale)).not.toMatch(
        /\u00e2(?:\u20ac|\u2020)|\u00c3\u0192|\u00ef\u00bf\u00bd|\ufffd/u,
      );
  });

  it('uses sectioned comparison grids and a single full-width distribution chart', () => {
    const report = reportFixture();
    let workspace = createWorkspace();
    workspace = importIntoSet(workspace, 'sim-1', { ok: true, report }, 'one.json');
    workspace = importIntoSet(workspace, 'sim-2', { ok: true, report }, 'two.json');
    const html = renderCompareExportDocument(workspace, 'en', TRANSLATIONS.en.labels);
    expect(html.match(/class="comparison-grid-table/gu)).toHaveLength(3);
    expect(html).not.toContain('economy-table');
    const chartsPage = html.slice(html.indexOf('compare-export-charts'));
    expect(chartsPage).toContain('comparison-tail-section');
    expect(chartsPage).not.toContain('comparison-chart-section');
    expect(chartsPage).not.toContain('comparison-chart-grid');
    expect(chartsPage).not.toContain('economy-comparison');
  });

  it('uses the consolidated Executive Summary hierarchy in live and exported detail', () => {
    const report = reportFixture();
    const options = { locale: 'en' as const, labels: TRANSLATIONS.en.labels, targets: {} };
    const renders = [
      renderDashboard(report, options),
      renderDetailedExportDocument(report, options),
    ];
    expect(renders[1]?.match(/class="export-page /gu)).toHaveLength(3);

    for (const html of renders) {
      const host = document.createElement('div');
      host.innerHTML = html;
      const executive = host.querySelector('.executive-section');
      const analysis = executive?.querySelector('.executive-analysis-grid');
      const subsections = analysis?.querySelectorAll('.executive-subsection');
      const profileHeaders = [
        ...(executive?.querySelectorAll('.simulation-profile-subsection thead th') ?? []),
      ].map((node) => node.textContent?.trim());

      expect(executive?.querySelector('.section-heading h2')?.textContent).toBe(
        'Executive Summary',
      );
      expect(executive?.querySelectorAll('.executive-strip .kpi-card')).toHaveLength(6);
      expect(subsections).toHaveLength(2);
      expect(subsections?.[0]?.querySelector('h3')?.textContent).toBe('Core Simulation Profile');
      expect(subsections?.[1]?.querySelector('h3')?.textContent).toBe('Base Spins vs. Features');
      expect(profileHeaders).toEqual(['Core Metric', 'Result']);
      expect(executive?.textContent).not.toContain('Bathala Tumble → Next Win Activation');
      expect(executive?.querySelector('.assessment-subsection')).toBeNull();
      expect(host.querySelector('.pie-chart')?.querySelectorAll('.pie-slice')).toHaveLength(6);
      const mechanicPanels = [...host.querySelectorAll('.mechanic-grid > article')];
      expect(mechanicPanels).toHaveLength(8);
      expect(mechanicPanels.map((panel) => panel.querySelector('h3')?.textContent)).toEqual([
        'Tumble Activations',
        'Bathala Activations',
        'Multipliers',
        'Scatter Activations',
        'Free Game',
        'Feature Activations',
        'Feature Lengths',
        'Volatility Profile',
      ]);
      expect(
        [...(mechanicPanels[5]?.querySelectorAll('dt') ?? [])].map((row) => row.textContent),
      ).toEqual([
        'Initially Awarded Free Games',
        'Total Retriggers',
        'Average Retriggers per Feature',
        'Average Ending Free Game Multiplier',
      ]);
      expect(mechanicPanels[6]?.querySelectorAll('.percentile-chart > div')).toHaveLength(6);
      expect(host.querySelector('.feature-length-section')).toBeNull();
      expect(host.querySelector('.mechanic-detail-grid')).toBeNull();
      expect(host.querySelector('.validation-grid')?.children).toHaveLength(3);
      expect(host.querySelector('.validation-section')?.textContent).toContain(
        'Simulation Confidence',
      );
      expect(host.querySelector('.diagnostics-section')).toBeNull();
      expect(host.querySelector('.metric-tip')).toBeNull();
      expect(host.textContent).not.toContain('Mathematical Health');
      expect(host.textContent).not.toContain('Profile Status');
      expect(host.textContent).not.toContain('UNCALIBRATED');
      expect(host.textContent).not.toContain('No management targets are configured');
      expect(host.textContent).not.toContain('No Target');
      expect(host.textContent).not.toContain('Data Quality');
      expect(host.textContent).not.toContain(
        'Lucky888 Bathala count-pay tumble simulation · Internal analytical report',
      );
    }
  });

  it('keeps fixed comparison columns in the live dashboard', () => {
    const html = renderCompareDashboard(createWorkspace(), 'en', TRANSLATIONS.en.labels);
    expect(html).toContain('<col class="comparison-metric-column">');
    expect(html.match(/<col class="comparison-sim-column">/gu)).toHaveLength(4);
    expect(html.match(/<col class="comparison-delta-column">/gu)).toHaveLength(2);
    expect(html).toContain('Simulation Spins');
  });

  it('keeps Sim 3 internally while hiding it from the comparison workflow', () => {
    const report = reportFixture();
    let workspace = createWorkspace();
    workspace = importIntoSet(workspace, 'sim-1', { ok: true, report }, 'one.json');
    workspace = importIntoSet(workspace, 'sim-2', { ok: true, report }, 'two.json');
    workspace = importIntoSet(workspace, 'sim-3', { ok: true, report }, 'three.json');
    expect(workspace.sets).toHaveLength(3);
    for (const html of [
      renderSetManager(workspace, [], 'en', TRANSLATIONS.en.labels),
      renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels),
      renderCompareExportDocument(workspace, 'en', TRANSLATIONS.en.labels),
    ]) {
      expect(html).not.toContain('Sim 3');
      expect(html).not.toContain('data-set-card="sim-3"');
    }
  });

  it('groups comparison metrics by decision hierarchy without redundant RTP cards', () => {
    const report = reportFixture();
    const workspace = importIntoSet(createWorkspace(), 'sim-1', { ok: true, report }, 'one.json');
    for (const html of [
      renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels),
      renderCompareExportDocument(workspace, 'en', TRANSLATIONS.en.labels),
    ]) {
      const executive = html.indexOf('Comparative Executive Summary');
      const overview = html.indexOf('Simulation Overview');
      const rtp = html.indexOf('RTP Composition');
      const detail = html.indexOf('Detailed Comparison');
      const tail = html.indexOf('Payout Tail Comparison');
      expect(executive).toBeGreaterThan(-1);
      expect(overview).toBeGreaterThan(executive);
      expect(rtp).toBeGreaterThan(overview);
      expect(detail).toBeGreaterThan(rtp);
      expect(tail).toBeGreaterThan(detail);
      expect(html).not.toContain('Base vs Feature Economy');
      expect(html).not.toContain('RTP Composition Comparison');
      expect(html).not.toContain('comparison-chart-section');
    }
  });

  it('shows exact component RTP values inside the executive RTP subsection', () => {
    const report = reportFixture();
    const workspace = importIntoSet(createWorkspace(), 'sim-1', { ok: true, report }, 'one.json');
    const html = renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels);
    const expected = formatAdaptivePercent(
      report.metrics.components.baseGameRegularPayout / report.metrics.totalBet,
      'en',
    );
    expect(html).toContain('Base Regular RTP');
    expect(html).toContain('Free Game Multiplier RTP');
    expect(html).toContain(expected);
  });

  it('keeps workspace context only in the manager and uses one green ACTIVE badge contract', () => {
    const report = reportFixture();
    const workspace = importIntoSet(createWorkspace(), 'sim-1', { ok: true, report }, 'one.json');
    const manager = renderSetManager(workspace, [], 'en', TRANSLATIONS.en.labels);
    const comparison = renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels);
    expect(manager.match(/>Workspace</gu)).toHaveLength(1);
    expect(comparison).not.toContain('>Workspace<');
    expect(manager).toContain('set-status set-active');
    expect(comparison).toContain('set-status set-active');
    expect(`${manager}${comparison}`).not.toMatch(
      /set-status[^>]*(?:status-warn|status-uncalibrated)/u,
    );
  });

  it('renders a logarithmic tail Y-axis, gridlines, labels, and safe narrow domains', () => {
    const report = reportFixture();
    const render = (candidate: SimulationReport) => {
      const workspace = importIntoSet(
        createWorkspace(),
        'sim-1',
        { ok: true, report: candidate },
        'tail.json',
      );
      return renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels);
    };
    const html = render(report);
    expect(html).toContain('class="chart-axis y-axis"');
    expect(html).toContain('class="chart-axis x-axis"');
    expect(html.match(/class="chart-gridline"/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain('class="y-axis-label"');
    expect(html).toContain('class="y-axis-title"');
    expect(html).toContain('class="comparison-line series-stroke-1"');
    expect(html).toContain('Log Frequency');
    for (const tick of [
      '1 in 10',
      '1 in 100',
      '1 in 1k',
      '1 in 10k',
      '1 in 100k',
      '1 in 1 million',
    ])
      expect(html).toContain(tick);
    expect(html).toContain('Observed:');
    expect(html).toContain('Tail Frequency Table');
    expect(html).not.toContain('log₁₀ frequency');

    const narrow = {
      ...report,
      metrics: {
        ...report.metrics,
        tails: report.metrics.tails.map((tail) => ({
          ...tail,
          frequency: tail.frequency > 0 ? 0.0001 : 0,
        })),
      },
    };
    const narrowHtml = render(narrow);
    expect(narrowHtml).not.toMatch(/NaN|Infinity/u);
    expect(narrowHtml.match(/class="chart-gridline"/gu)?.length).toBeGreaterThanOrEqual(4);
  });

  it('shares a safe reciprocal logarithmic scale across tail charts', () => {
    const scale = reciprocalTailScale([1 / 50, 1 / 1_000, 1 / 1_000_000]);
    expect(scale).not.toBeNull();
    expect(scale?.ticks.map((tick) => Math.round(1 / tick.frequency))).toEqual([
      ...FIXED_TAIL_OCCURRENCES,
    ]);
    expect(scale?.ticks.every((tick) => tick.frequency > 0)).toBe(true);
    const positions = scale!.ticks.map((tick) => reciprocalTailY(scale!, tick.frequency, 20, 300));
    const gaps = positions.slice(1).map((position, index) => position! - positions[index]!);
    expect(gaps.every((gap) => Math.abs(gap - gaps[0]!) < 1e-9)).toBe(true);
    expect(reciprocalTailY(scale!, 1 / 1_000, 20, 300)).toBeTypeOf('number');
    expect(reciprocalTailY(scale!, 0, 20, 300)).toBeNull();
    expect(reciprocalTailScale([0, Number.NaN])).toBeNull();
  });

  it('formats reciprocal decades and appropriate delta types', () => {
    expect(
      FIXED_TAIL_OCCURRENCES.map((occurrence) =>
        formatReciprocalTailTick(1 / occurrence, '1 in', '1 million'),
      ),
    ).toEqual(['1 in 10', '1 in 100', '1 in 1k', '1 in 10k', '1 in 100k', '1 in 1 million']);
    expect(percentagePointDelta(0.3131, 0.4559)).toBeCloseTo(14.28);
    expect(relativePercentageDelta(9.499, 3.684)).toBeCloseTo(-61.2169);
    expect(tailFrequencyDelta(1 / 1_080, 1 / 3_509)).toEqual({
      kind: 'rarer',
      factor: 3_509 / 1_080,
    });
    expect(tailFrequencyDelta(0, 1 / 1_000)).toEqual({ kind: 'notComparable' });
  });
});

describe('exact schemas and strict imports', () => {
  it('supports only the explicitly registered schema', () => {
    expect([...SUPPORTED_REPORT_SCHEMA_VERSIONS]).toEqual(['2.0.0']);
    for (const [version, ok] of [
      ['2.0.0', true],
      ['1.2.0', false],
      ['2.1.0', false],
      ['3.0.0', false],
    ] as const) {
      const raw = rawFixture();
      (raw.metadata as Record<string, unknown>).schemaVersion = version;
      expect(normalizeImportedReport(raw).ok).toBe(ok);
    }
    const missing = rawFixture();
    delete (missing.metadata as Record<string, unknown>).schemaVersion;
    expect(normalizeImportedReport(missing).ok).toBe(false);
    const unsupported = rawFixture();
    (unsupported.metadata as Record<string, unknown>).schemaVersion = '2.1.0';
    const result = normalizeImportedReport(unsupported);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.message).toContain('Supported versions: 2.0.0');
  });

  it('requires all canonical metadata and simulation fields for imports', () => {
    for (const [section, field] of [
      ['metadata', 'gameId'],
      ['metadata', 'gameName'],
      ['metadata', 'gameVersion'],
      ['metadata', 'configurationId'],
      ['metadata', 'generatedAt'],
      ['simulation', 'methodology'],
      ['simulation', 'seed'],
      ['simulation', 'spins'],
    ] as const) {
      const raw = rawFixture();
      delete (raw[section] as Record<string, unknown>)[field];
      const result = normalizeImportedReport(raw);
      expect(result.ok, `${section}.${field}`).toBe(false);
      if (!result.ok)
        expect(result.errors.some((error) => error.field === `${section}.${field}`)).toBe(true);
    }
    const invalidDate = rawFixture();
    (invalidDate.metadata as Record<string, unknown>).generatedAt = 'invalid';
    expect(normalizeImportedReport(invalidDate).ok).toBe(false);
  });

  it('keeps legacy bundled compatibility out of the strict import path', () => {
    const canonical = rawFixture();
    const legacy = {
      config: { configurationId: 'legacy', source: 'legacy fixture' },
      simulation: { seed: 2026, spins: 100000 },
      metrics: { ...(canonical.metrics as Record<string, unknown>), configurationId: 'legacy' },
    };
    expect(normalizeBundledReport(legacy).ok).toBe(true);
    expect(normalizeImportedReport(legacy).ok).toBe(false);
    expect(parseImportedSimulationReport(JSON.stringify(legacy)).ok).toBe(false);
  });
});

describe('structural values versus balance quality', () => {
  it('accepts RTP, contributions, and confidence intervals above 100%', () => {
    for (const changed of [
      { rtp: 1.03 },
      { rtp: 1.5 },
      { baseGameWinContribution: 1.1 },
      { confidenceInterval95: [1.01, 1.07] },
    ]) {
      const raw = rawFixture();
      Object.assign(raw.metrics as Record<string, unknown>, changed);
      expect(normalizeImportedReport(raw).ok).toBe(true);
    }
  });

  it('rejects negative/non-finite RTP and invalid probabilities', () => {
    for (const changed of [
      { rtp: -0.1 },
      { rtp: Number.NaN },
      { rtp: Number.POSITIVE_INFINITY },
      { featureFrequency: 1.1 },
      { winningSpinFrequency: 1.01 },
      { bathalaToNextWinConversionRate: -0.1 },
    ]) {
      const raw = rawFixture();
      Object.assign(raw.metrics as Record<string, unknown>, changed);
      expect(normalizeImportedReport(raw).ok).toBe(false);
    }
  });

  it('renders high RTP in comparison without clipping it to 100%', () => {
    const report = reportFixture();
    const high = {
      ...report,
      metrics: { ...report.metrics, rtp: 1.5, baseGameWinContribution: 1.1 },
    };
    const workspace = importIntoSet(
      createWorkspace(),
      'sim-1',
      { ok: true, report: high },
      'high.json',
    );
    const html = renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels);
    expect(html).toContain('150.00%');
    expect(html).toContain('110.00%');
    expect(
      evaluateTargetValue(1.2, {
        metric: 'rtp',
        type: 'range',
        minimum: 0.95,
        maximum: 0.96,
        criticality: 'critical',
      }),
    ).toBe('FAIL');
  });
});

describe('stable series identities', () => {
  it('maps colors to set IDs even when Sim 1 is empty', () => {
    expect(seriesNumberForSet('sim-1')).toBe(1);
    expect(seriesNumberForSet('sim-2')).toBe(2);
    expect(seriesNumberForSet('sim-3')).toBe(3);
    const report = reportFixture();
    let workspace = createWorkspace();
    workspace = importIntoSet(workspace, 'sim-2', { ok: true, report }, 'two.json');
    workspace = importIntoSet(workspace, 'sim-3', { ok: true, report }, 'three.json');
    const withoutOne = renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels);
    expect(withoutOne).toContain('series-stroke-2');
    expect(withoutOne).not.toContain('series-stroke-3');
    expect(withoutOne).not.toContain('series-stroke-1');
    workspace = importIntoSet(workspace, 'sim-1', { ok: true, report }, 'one.json');
    const withOne = renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels);
    expect(withOne).toContain('series-stroke-1');
    expect(withOne).toContain('series-stroke-2');
    expect(withOne).not.toContain('series-stroke-3');
  });
});

describe('deployment-safe locale assets', () => {
  it('normalizes root and subdirectory base paths', () => {
    expect(normalizeBasePath('/')).toBe('/');
    expect(normalizeBasePath('preview/math')).toBe('/preview/math/');
    expect(resolveDashboardBase({ VITE_BASE_PATH: '/preview/math' })).toBe('/preview/math/');
    expect(flagAssetPath('/preview/math/', 'gb.svg')).toBe('/preview/math/flags/gb.svg');
  });

  it('has deterministic local assets and subpath-safe markup for all locales', () => {
    expect(DASHBOARD_LANGUAGE_OPTIONS).toHaveLength(4);
    for (const option of DASHBOARD_LANGUAGE_OPTIONS) {
      expect(
        existsSync(resolve(process.cwd(), 'apps/math-dashboard/public/flags', option.flag)),
      ).toBe(true);
      expect(languageButtons(option.locale, '/subdir/')).toContain(`/subdir/flags/${option.flag}`);
    }
  });
});
