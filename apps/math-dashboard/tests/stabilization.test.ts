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
import { formatPercentRange } from '../src/i18n/format.js';
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
    expect(css).toContain('--comparison-metric-column: 31%');
    expect(css).toContain('--comparison-sim-column: 23%');
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
    expect(html.match(/class="comparison-sim-column"/gu)?.length).toBe(9);
    expect(html).toContain('N/A');
    expect(html).toContain('class="value-na"');
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

  it('uses the shared comparison grid and independent full-width export charts', () => {
    const report = reportFixture();
    let workspace = createWorkspace();
    workspace = importIntoSet(workspace, 'sim-1', { ok: true, report }, 'one.json');
    workspace = importIntoSet(workspace, 'sim-2', { ok: true, report }, 'two.json');
    const html = renderCompareExportDocument(workspace, 'en', TRANSLATIONS.en.labels);
    expect(html.match(/class="comparison-grid-table/gu)).toHaveLength(3);
    expect(html).toContain('class="comparison-grid-table economy-table"');
    const chartsPage = html.slice(html.indexOf('compare-export-charts'));
    expect(chartsPage).toContain('comparison-chart-section');
    expect(chartsPage).toContain('comparison-tail-section');
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
      expect(subsections?.[0]?.querySelector('h3')?.textContent).toBe('Simulation Profile');
      expect(subsections?.[1]?.querySelector('h3')?.textContent).toBe('Base vs Feature');
      expect(profileHeaders).toEqual(['Dimension', 'Result']);
      expect(executive?.querySelector('.assessment-subsection h3')?.textContent).toBe(
        'Simulation Assessment',
      );
      expect(host.querySelector('.validation-grid')?.children).toHaveLength(2);
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
    expect(html.match(/<col class="comparison-sim-column">/gu)).toHaveLength(6);
    expect(html).toContain('Simulation Spins');
  });

  it('orders comparison sections by decision hierarchy without duplicating Economy', () => {
    const report = reportFixture();
    const workspace = importIntoSet(createWorkspace(), 'sim-1', { ok: true, report }, 'one.json');
    for (const html of [
      renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels),
      renderCompareExportDocument(workspace, 'en', TRANSLATIONS.en.labels),
    ]) {
      const executive = html.indexOf('Comparative Executive Summary');
      const economy = html.indexOf('Base vs Feature Economy');
      const rtp = html.indexOf('RTP Composition Comparison');
      const tail = html.indexOf('Payout Tail Comparison');
      expect(executive).toBeGreaterThan(-1);
      expect(economy).toBeGreaterThan(executive);
      expect(rtp).toBeGreaterThan(economy);
      expect(tail).toBeGreaterThan(rtp);
      expect(html.match(/Base vs Feature Economy/gu)).toHaveLength(1);
    }
  });

  it('keeps workspace context only in the manager and uses one green ACTIVE badge contract', () => {
    const report = reportFixture();
    const workspace = importIntoSet(createWorkspace(), 'sim-1', { ok: true, report }, 'one.json');
    const manager = renderSetManager(workspace, [], 'en', TRANSLATIONS.en.labels);
    const comparison = renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels);
    expect(manager.match(/Comparison Workspace/gu)).toHaveLength(1);
    expect(comparison).not.toContain('Comparison Workspace');
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
    expect(withoutOne).toContain('series-2');
    expect(withoutOne).toContain('series-3');
    expect(withoutOne).not.toContain('series-stroke-1');
    workspace = importIntoSet(workspace, 'sim-1', { ok: true, report }, 'one.json');
    const withOne = renderCompareDashboard(workspace, 'en', TRANSLATIONS.en.labels);
    expect(withOne).toContain('series-stroke-2');
    expect(withOne).toContain('series-stroke-3');
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
