import './style.css';
import { renderBarChart, renderConfidenceChart, renderConvergenceChart } from './charts.js';
import { MANAGEMENT_TARGETS } from './config/management-targets.js';
import { bindPrintLayout, setPrintLayout } from './print.js';
import {
  baseBetCredits,
  betReturnFrequency,
  comparisonRows,
  evaluateTargets,
  featureFrequencyOdds,
  maximumWinMultiple,
  nestedSampleNotice,
  number,
  overallStatus,
  percentage,
  plainLanguageSummary,
  reconcileReport,
  riskFlags,
  sampleSizeGuidance,
} from './reports/analysis.js';
import { parseSimulationReport, validateSimulationReport } from './reports/validation.js';
import type {
  ComparisonRow,
  ReconciliationCheck,
  RiskFlag,
  TargetEvaluation,
} from './reports/analysis.js';
import type {
  LoadedReport,
  ReportIndexEntry,
  SimulationReport,
} from './types/simulation-report.js';

const app = document.querySelector<HTMLElement>('#app') ?? failMissingRoot();

function failMissingRoot(): never {
  throw new Error('Dashboard root is missing.');
}

let reports: LoadedReport[] = [];
let activeReportId = '';
const comparisonIds = new Set<string>();
let visibleError = '';

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

const formatDate = (timestamp: string): string =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(timestamp),
  );

function statusBadge(status: string): string {
  return `<span class="status-badge status-${status.toLowerCase()}">${escapeHtml(status)}</span>`;
}

function targetRows(targets: readonly TargetEvaluation[]): string {
  return targets
    .map(
      (row) => `<tr>
        <th scope="row">${escapeHtml(row.metric)}</th>
        <td>${escapeHtml(row.result)}</td>
        <td>${escapeHtml(row.target)}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${escapeHtml(row.interpretation)}</td>
      </tr>`,
    )
    .join('');
}

function reconciliationRows(checks: readonly ReconciliationCheck[]): string {
  return checks
    .map(
      (check) => `<tr>
        <th scope="row">${escapeHtml(check.label)}</th>
        <td>${number(check.reported, 8)}</td>
        <td>${number(check.expected, 8)}</td>
        <td>${statusBadge(check.status)}</td>
      </tr>`,
    )
    .join('');
}

function riskItems(flags: readonly RiskFlag[]): string {
  return flags
    .map(
      (flag) => `<li class="risk-item risk-${flag.status.toLowerCase()}">
        ${statusBadge(flag.status)} <span>${escapeHtml(flag.message)}</span>
      </li>`,
    )
    .join('');
}

function comparisonValue(value: number, format: ComparisonRow['format']): string {
  if (format === 'percent') return percentage(value, 3);
  if (format === 'credits') return `${number(value, 0)} cr`;
  return number(value, 3);
}

function comparisonSection(selected: readonly LoadedReport[]): string {
  if (selected.length < 2)
    return '<p class="empty-state">Select at least two reports to compare management metrics.</p>';
  const [first, second] = selected;
  if (!first || !second) return '';
  const rows = comparisonRows(first.report, second.report)
    .map(
      (row) => `<tr>
        <th scope="row">${escapeHtml(row.metric)}</th>
        <td>${comparisonValue(row.a, row.format)}</td>
        <td>${comparisonValue(row.b, row.format)}</td>
        <td>${comparisonValue(row.absoluteDifference, row.format)}</td>
        <td>${row.relativeDifference === null ? 'N/A' : percentage(row.relativeDifference, 2)}</td>
      </tr>`,
    )
    .join('');
  const nested = nestedSampleNotice(selected);
  const incompatible = new Set(selected.map((entry) => entry.report.configurationId)).size > 1;
  return `${nested ? `<p class="notice">${escapeHtml(nested)}</p>` : ''}
    ${selected.length > 2 ? '<p class="microcopy">Difference columns use the first two selected reports; convergence uses every compatible selection.</p>' : ''}
    <div class="table-scroll"><table>
      <thead><tr><th>Metric</th><th>${escapeHtml(first.label)}</th><th>${escapeHtml(second.label)}</th><th>Absolute difference</th><th>Relative difference</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${incompatible ? '<p class="notice">Convergence is unavailable because selected configuration IDs differ.</p>' : '<div id="convergence-chart" class="chart-surface"></div>'}`;
}

function renderDashboard(): void {
  const active = reports.find((entry) => entry.id === activeReportId);
  if (!active) {
    app.innerHTML = `<main class="loading-shell"><h1>LUCKY888 — Math Performance Dashboard</h1><p>${visibleError ? escapeHtml(visibleError) : 'Loading reports…'}</p></main>`;
    return;
  }
  const report = active.report;
  const status = overallStatus(report);
  const targets = evaluateTargets(report);
  const reconciliations = reconcileReport(report);
  const risks = riskFlags(report);
  const selectedComparisons = reports.filter((entry) => comparisonIds.has(entry.id));
  const reportOptions = reports
    .map(
      (entry) =>
        `<option value="${escapeHtml(entry.id)}" ${entry.id === active.id ? 'selected' : ''}>${escapeHtml(entry.label)}</option>`,
    )
    .join('');
  const comparisonOptions = reports
    .map(
      (entry) =>
        `<label class="check-option"><input type="checkbox" data-compare-id="${escapeHtml(entry.id)}" ${comparisonIds.has(entry.id) ? 'checked' : ''}> <span>${escapeHtml(entry.label)}</span></label>`,
    )
    .join('');
  const kpis = [
    ['Credited RTP', percentage(report.creditedTotalRtp), 'Estimated credited return'],
    ['Uncapped RTP', percentage(report.uncappedTotalRtp), 'Before maximum-win cap'],
    ['Base RTP', percentage(report.uncappedBaseLineRtp), 'Line-award contribution'],
    ['Feature RTP', percentage(report.uncappedFeatureRtp), 'Free-spin contribution'],
    ['Award Frequency', percentage(report.featureInclusiveHitFrequency), 'Any positive award'],
    ['Bet-Return Frequency', percentage(betReturnFrequency(report)), 'At least 1× bet returned'],
    [
      'Feature Frequency',
      percentage(report.featureTriggerFrequency, 3),
      `1 in ${number(featureFrequencyOdds(report), 1)}`,
    ],
    [
      'Average Feature Length',
      number(report.averageTotalFreeSpinsPerTrigger, 2),
      'Free spins per trigger',
    ],
    ['P95 Feature Length', number(report.featureLengthPercentiles.p95, 0), '95th percentile'],
    ['Standard Deviation', number(report.standardDeviation, 3), 'Bet-multiple return dispersion'],
    [
      'Maximum Observed Win',
      `${number(report.maximumObservedWinCredits, 0)} cr`,
      `${number(maximumWinMultiple(report), 1)}× default bet`,
    ],
    [
      'Cap Hit Frequency',
      percentage(report.capApplicationFrequency, 4),
      `${number(report.capApplications, 0)} applications`,
    ],
  ];
  app.innerHTML = `
    <header class="dashboard-header">
      <div><p class="eyebrow">SIMULATION MANAGEMENT</p><h1>LUCKY888 <span>— Math Performance Dashboard</span></h1></div>
      <div class="header-actions no-print"><button id="print-button" class="button button-gold" type="button">Print / Export PDF</button></div>
    </header>
    <nav class="dashboard-nav no-print" aria-label="Report controls">
      <label>Active report<select id="report-select">${reportOptions}</select></label>
      <fieldset><legend>Comparison reports</legend><div class="comparison-options">${comparisonOptions}</div></fieldset>
      <div id="upload-zone" class="upload-zone" tabindex="0" role="button" aria-label="Upload simulation report JSON">
        <strong>Drop report JSON</strong><span>or choose a file</span>
        <input id="file-input" type="file" accept="application/json,.json" aria-label="Choose simulation report JSON">
      </div>
    </nav>
    ${visibleError ? `<div class="error-banner" role="alert"><strong>Report rejected.</strong> ${escapeHtml(visibleError)}</div>` : ''}
    <main>
      <section class="identity-card print-identity">
        <div><p class="eyebrow">ACTIVE REPORT</p><h2>${escapeHtml(report.configurationId)}</h2><p class="guidance">${escapeHtml(sampleSizeGuidance(report.paidSpins))} · All Monte Carlo output is estimated.</p></div>
        <div class="overall-status"><span>Overall status</span>${statusBadge(status)}</div>
        <dl class="identity-grid">
          <div><dt>Game version</dt><dd>${escapeHtml(report.gameVersion)}</dd></div>
          <div><dt>Simulation size</dt><dd>${number(report.paidSpins, 0)} paid spins</dd></div>
          <div><dt>Seed</dt><dd>${number(report.seed, 0)}</dd></div>
          <div><dt>Generated</dt><dd>${escapeHtml(formatDate(report.generatedAt))}</dd></div>
          <div><dt>Methodology</dt><dd>${escapeHtml(report.methodology)}</dd></div>
          <div><dt>Base bet assumption</dt><dd>${number(baseBetCredits(report), 0)} credits${report.baseBetCredits === undefined ? ' (dashboard default)' : ''}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="kpi-heading"><div class="section-heading"><p class="eyebrow">EXECUTIVE VIEW</p><h2 id="kpi-heading">Key performance indicators</h2></div>
        <div class="kpi-grid">${kpis.map(([label, value, detail]) => `<article class="kpi-card"><h3>${escapeHtml(label ?? '')}</h3><strong>${escapeHtml(value ?? '')}</strong><p>${escapeHtml(detail ?? '')}</p></article>`).join('')}</div>
      </section>
      <section class="summary-card"><p class="eyebrow">PLAIN-LANGUAGE SUMMARY</p><p>${escapeHtml(plainLanguageSummary(report))}</p></section>
      <section aria-labelledby="targets-heading"><div class="section-heading"><p class="eyebrow">PROVISIONAL BALANCING TARGETS</p><h2 id="targets-heading">Management target assessment</h2><p>Compliance indicates alignment with current internal targets, not regulatory approval.</p></div>
        <div class="table-scroll"><table><thead><tr><th>Metric</th><th>Result</th><th>Target</th><th>Status</th><th>Interpretation</th></tr></thead><tbody>${targetRows(targets)}</tbody></table></div>
      </section>
      <section aria-labelledby="charts-heading"><div class="section-heading"><p class="eyebrow">DISTRIBUTION &amp; UNCERTAINTY</p><h2 id="charts-heading">Performance charts</h2></div>
        <div class="chart-grid">
          <article class="chart-card"><h3>RTP contribution</h3><div id="rtp-chart" class="chart-surface"></div></article>
          <article class="chart-card"><h3>Payout distribution</h3><div id="payout-chart" class="chart-surface"></div></article>
          <article class="chart-card"><h3>Feature trigger composition</h3><div id="trigger-chart" class="chart-surface"></div></article>
          <article class="chart-card"><h3>Feature-length percentiles</h3><div id="length-chart" class="chart-surface"></div></article>
          <article class="chart-card chart-wide"><h3>Credited RTP estimate and 95% confidence interval</h3><div id="confidence-chart" class="chart-surface"></div></article>
        </div>
      </section>
      <section class="review-grid">
        <article><div class="section-heading"><p class="eyebrow">RISK REVIEW</p><h2>Risk flags</h2></div><ul class="risk-list">${riskItems(risks)}</ul></article>
        <article><div class="section-heading"><p class="eyebrow">DATA INTEGRITY</p><h2>Reconciliation</h2></div><div class="table-scroll"><table><thead><tr><th>Check</th><th>Reported</th><th>Calculated</th><th>Status</th></tr></thead><tbody>${reconciliationRows(reconciliations)}</tbody></table></div></article>
      </section>
      <section id="comparison" aria-labelledby="comparison-heading"><div class="section-heading"><p class="eyebrow">REPORT COMPARISON</p><h2 id="comparison-heading">Comparison mode</h2></div>${comparisonSection(selectedComparisons)}</section>
    </main>
    <footer><p>LUCKY888 simulated-credit engineering prototype · Estimated deterministic Monte Carlo evidence · No cash value</p></footer>`;

  wireInteractions();
  renderCharts(report, selectedComparisons);
}

function renderCharts(report: SimulationReport, selected: readonly LoadedReport[]): void {
  const rtp = document.querySelector<HTMLElement>('#rtp-chart');
  if (rtp)
    renderBarChart(rtp, [
      {
        label: 'Base',
        value: report.uncappedBaseLineRtp,
        displayValue: percentage(report.uncappedBaseLineRtp),
      },
      {
        label: 'Feature',
        value: report.uncappedFeatureRtp,
        displayValue: percentage(report.uncappedFeatureRtp),
      },
      {
        label: 'Scatter',
        value: report.uncappedBaseScatterRtp,
        displayValue: percentage(report.uncappedBaseScatterRtp),
      },
    ]);
  const payout = document.querySelector<HTMLElement>('#payout-chart');
  if (payout)
    renderBarChart(
      payout,
      report.payoutDistribution.map((bucket) => ({
        label: bucket.label,
        value: bucket.probability,
        displayValue: percentage(bucket.probability, 1),
      })),
    );
  const trigger = document.querySelector<HTMLElement>('#trigger-chart');
  if (trigger)
    renderBarChart(
      trigger,
      (['3', '4', '5'] as const).map((count) => {
        const value = report.featureTriggerFrequencyByScatterCount[count] ?? 0;
        return { label: `${count} Scatter`, value, displayValue: percentage(value, 3) };
      }),
    );
  const length = document.querySelector<HTMLElement>('#length-chart');
  if (length) {
    const percentiles = report.featureLengthPercentiles;
    renderBarChart(length, [
      { label: 'Median', value: percentiles.median },
      { label: 'P75', value: percentiles.p75 },
      { label: 'P90', value: percentiles.p90 },
      { label: 'P95', value: percentiles.p95 },
      { label: 'P99', value: percentiles.p99 },
    ]);
  }
  const confidence = document.querySelector<HTMLElement>('#confidence-chart');
  if (confidence)
    renderConfidenceChart(confidence, report.creditedTotalRtp, report.confidenceInterval95, [
      MANAGEMENT_TARGETS.creditedRtp.minimum,
      MANAGEMENT_TARGETS.creditedRtp.maximum,
    ]);
  const convergence = document.querySelector<HTMLElement>('#convergence-chart');
  if (convergence)
    renderConvergenceChart(
      convergence,
      selected.map((entry) => ({
        label: entry.label,
        spins: entry.report.paidSpins,
        rtp: entry.report.creditedTotalRtp,
      })),
    );
}

async function addUpload(file: File): Promise<void> {
  const parsed = parseSimulationReport(await file.text());
  if (!parsed.ok) {
    visibleError = parsed.errors.join(' ');
    renderDashboard();
    return;
  }
  const id = `upload-${Date.now()}-${file.name}`;
  reports = [
    ...reports,
    { id, label: `${file.name} (uploaded)`, source: 'upload', report: parsed.report },
  ];
  activeReportId = id;
  comparisonIds.add(id);
  visibleError = '';
  renderDashboard();
}

function wireInteractions(): void {
  document
    .querySelector<HTMLSelectElement>('#report-select')
    ?.addEventListener('change', (event) => {
      activeReportId = (event.currentTarget as HTMLSelectElement).value;
      visibleError = '';
      renderDashboard();
    });
  document.querySelectorAll<HTMLInputElement>('[data-compare-id]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.compareId;
      if (!id) return;
      if (input.checked) comparisonIds.add(id);
      else comparisonIds.delete(id);
      renderDashboard();
    });
  });
  const input = document.querySelector<HTMLInputElement>('#file-input');
  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void addUpload(file);
  });
  const zone = document.querySelector<HTMLElement>('#upload-zone');
  zone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    zone.classList.add('is-dragging');
  });
  zone?.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone?.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-dragging');
    const file = event.dataTransfer?.files[0];
    if (file) void addUpload(file);
  });
  zone?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') input?.click();
  });
  document.querySelector<HTMLButtonElement>('#print-button')?.addEventListener('click', () => {
    setPrintLayout(true);
    window.print();
    window.setTimeout(() => setPrintLayout(false), 0);
  });
}

async function loadBuiltInReports(): Promise<void> {
  try {
    const indexResponse = await fetch(`${import.meta.env.BASE_URL}reports/index.json`);
    if (!indexResponse.ok)
      throw new Error(`Report index request returned ${indexResponse.status}.`);
    const index = (await indexResponse.json()) as unknown;
    if (!Array.isArray(index)) throw new Error('Report index must be an array.');
    const entries = index as ReportIndexEntry[];
    const loaded = await Promise.all(
      entries.map(async (entry, order): Promise<LoadedReport> => {
        if (typeof entry.file !== 'string' || typeof entry.label !== 'string')
          throw new Error(`Report index entry ${order + 1} is malformed.`);
        const response = await fetch(`${import.meta.env.BASE_URL}reports/${entry.file}`);
        if (!response.ok) throw new Error(`${entry.file} request returned ${response.status}.`);
        const validation = validateSimulationReport((await response.json()) as unknown);
        if (!validation.ok) throw new Error(`${entry.file}: ${validation.errors.join(' ')}`);
        return {
          id: `built-in-${entry.file}`,
          label: entry.label,
          source: 'built-in',
          report: validation.report,
        };
      }),
    );
    reports = loaded;
    const defaultEntry = entries.find((entry) => entry.default) ?? entries[0];
    activeReportId = `built-in-${defaultEntry?.file ?? ''}`;
    for (const entry of loaded) comparisonIds.add(entry.id);
    visibleError = '';
  } catch (error: unknown) {
    visibleError = error instanceof Error ? error.message : 'Unable to load built-in reports.';
  }
  renderDashboard();
}

bindPrintLayout();
renderDashboard();
void loadBuiltInReports();
