import type { DashboardLabels } from '../i18n/dictionaries.js';
import {
  formatAdaptivePercent,
  formatDate,
  formatDecimal,
  formatInteger,
  formatMultiplier,
  formatOneIn,
  formatPercent,
  formatPercentRange,
} from '../i18n/format.js';
import type { DashboardLocale } from '../i18n/types.js';
import { deriveAnalytics } from '../reports/derived.js';
import { metricDefinition, type MetricId, type MetricUnit } from '../reports/metric-registry.js';
import type { LoadedReport, SimulationReport } from '../types/simulation-report.js';
import {
  findSet,
  workspaceWarnings,
  type SimulationSet,
  type SimulationWorkspace,
} from '../workspace/simulation-workspace.js';

type Labels = DashboardLabels;
const esc = (value: unknown): string =>
  String(value).replace(
    /[&<>'"]/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c,
  );
const label = (labels: Labels, key: string): string =>
  (labels as Readonly<Record<string, string>>)[key] ?? key;
const naValue = (l: Labels): string => `<span class="value-na">${esc(l.na)}</span>`;
const COMPARISON_COLGROUP =
  '<colgroup><col class="comparison-metric-column"><col class="comparison-sim-column"><col class="comparison-sim-column"><col class="comparison-sim-column"></colgroup>';

export const COMPARISON_METRICS = Object.freeze([
  'rtp',
  'winningSpinFrequency',
  'featureFrequency',
  'averageWinPerWinningSpin',
  'baseGameWinContribution',
  'freeGameWinContribution',
  'baseGameTumbleTriggerFrequency',
  'freeGameTumbleTriggerFrequency',
  'averageBaseGameTumbleRoundsPerTrigger',
  'averageFreeGameTumbleRoundsPerTrigger',
  'bathalaToNextWinConversionRate',
  'multiplierAppearanceFrequency',
  'averageMultiplierValue',
  'multiplierRtpContribution',
  'averageFreeGamesPlayed',
  'averageEndingFreeGameMultiplier',
  'coefficientOfVariation',
  'maximumObservedWin',
  'tail100',
  'tail250',
  'tail500',
  'tail1000',
] satisfies readonly MetricId[]);

export const EXECUTIVE_COMPARISON_METRICS = Object.freeze([
  'rtp',
  'winningSpinFrequency',
  'featureFrequency',
  'baseGameWinContribution',
  'freeGameWinContribution',
  'multiplierRtpContribution',
  'bathalaToNextWinConversionRate',
  'coefficientOfVariation',
  'maximumObservedWin',
  'tail1000',
] satisfies readonly MetricId[]);

const SET_SERIES = Object.freeze({ 'sim-1': 1, 'sim-2': 2, 'sim-3': 3 } as const);
export function seriesNumberForSet(setId: string): 1 | 2 | 3 {
  return SET_SERIES[setId as keyof typeof SET_SERIES] ?? 1;
}

export function comparisonMetricValue(set: SimulationSet, id: MetricId): number | null {
  return set.report ? metricDefinition(id).getter(set.report) : null;
}

function formatValue(
  value: number | null,
  unit: MetricUnit,
  locale: DashboardLocale,
  l: Labels,
): string {
  if (value === null) return l.na;
  if (unit === 'percent') return formatAdaptivePercent(value, locale);
  if (unit === 'frequency') return formatOneIn(value, locale, l.oneIn);
  if (unit === 'multiplier') return formatMultiplier(value, locale);
  if (unit === 'count') return formatInteger(value, locale);
  return formatDecimal(value, locale, 3);
}

export function formatNullableMetric(
  set: SimulationSet,
  id: MetricId,
  locale: DashboardLocale,
  l: Labels,
): string {
  const definition = metricDefinition(id);
  return formatValue(comparisonMetricValue(set, id), definition.unit, locale, l);
}

function deltaText(
  set: SimulationSet,
  baseline: SimulationSet | null,
  id: MetricId,
  locale: DashboardLocale,
  l: Labels,
): string {
  if (!baseline?.report || set.id === baseline.id) return '';
  const current = comparisonMetricValue(set, id),
    base = comparisonMetricValue(baseline, id);
  if (current === null || base === null) return '';
  const unit = metricDefinition(id).unit;
  if (unit === 'frequency')
    return `${formatOneIn(current, locale, l.oneIn)} ${l.comparedWith} ${formatOneIn(base, locale, l.oneIn)}`;
  const difference = current - base;
  const shown =
    unit === 'percent'
      ? `${difference >= 0 ? '+' : ''}${formatDecimal(difference * 100, locale, 2)} pp`
      : unit === 'multiplier'
        ? `${difference >= 0 ? '+' : ''}${formatMultiplier(difference, locale)}`
        : `${difference >= 0 ? '+' : ''}${formatDecimal(difference, locale, 3)}`;
  return `${l.delta}: ${shown}`;
}

function setStatus(set: SimulationSet, l: Labels): string {
  return set.report
    ? `<span class="set-status set-active">${esc(l.active)}</span>`
    : `<span class="set-status set-empty">${esc(l.noReport)}</span>`;
}

export function renderSetManager(
  workspace: SimulationWorkspace,
  catalog: readonly LoadedReport[],
  locale: DashboardLocale,
  l: Labels,
): string {
  const warnings = workspaceWarnings(workspace);
  return `<section class="workspace-manager no-print"><div class="workspace-toolbar"><div><p class="eyebrow">${esc(l.comparisonWorkspace)}</p><h2>${esc(l.simulationSets)}</h2></div><div class="view-switch"><button data-view-mode="compare" class="${workspace.viewMode === 'compare' ? 'is-active' : ''}">${esc(l.compare)}</button><button data-view-mode="detail" class="${workspace.viewMode === 'detail' ? 'is-active' : ''}">${esc(l.detailedReport)}</button></div></div><div class="set-manager-grid">${workspace.sets
    .map((set) => {
      const selected = set.id === workspace.selectedSetId;
      const setWarnings = warnings.filter((warning) => warning.setId === set.id);
      return `<article class="simulation-set-card ${selected ? 'is-selected' : ''}" data-set-card="${set.id}"><div class="set-card-heading"><button data-select-set="${set.id}"><strong>${esc(set.label)}</strong>${setStatus(set, l)}</button><input data-rename-set="${set.id}" value="${esc(set.label)}" aria-label="${esc(l.renameSet)}"></div><dl><div><dt>${esc(l.configuration)}</dt><dd>${esc(set.report?.metadata.configurationId ?? l.na)}</dd></div><div><dt>${esc(l.gameVersion)}</dt><dd>${esc(set.report?.metadata.gameVersion ?? l.na)}</dd></div><div><dt>${esc(l.sourceFile)}</dt><dd>${esc(set.sourceName ?? l.na)}</dd></div><div><dt>${esc(l.spins)}</dt><dd>${set.report ? formatInteger(set.report.simulation.spins, locale) : l.na}</dd></div><div><dt>${esc(l.creditedRtp)}</dt><dd>${set.report ? formatAdaptivePercent(set.report.metrics.rtp, locale) : l.na}</dd></div><div><dt>${esc(l.generated)}</dt><dd>${set.report ? formatDate(set.report.metadata.generatedAt, locale) : l.na}</dd></div><div><dt>${esc(l.validationState)}</dt><dd>${set.report ? l.validReport : l.noReport}</dd></div></dl>${setWarnings.map((w) => `<p class="set-warning">${esc(label(l, w.kind))}</p>`).join('')}<label class="set-report-select">${esc(l.loadBundledReport)}<select data-catalog-report="${set.id}"><option value="">${esc(l.chooseBuiltIn)}</option>${catalog.map((report) => `<option value="${esc(report.id)}">${esc(report.label)}</option>`).join('')}</select></label><div class="set-drop-zone" data-drop-set="${set.id}" tabindex="0"><strong>${esc(set.report ? l.replaceReport : l.dropReportHere)}</strong><span>${esc(l.browseFile)}</span><input data-file-set="${set.id}" type="file" accept="application/json,.json"></div><div class="set-actions"><button data-select-set="${set.id}" data-detail-set="${set.id}">${esc(l.viewReportMetadata)}</button><button data-remove-set="${set.id}" ${set.report ? '' : 'disabled'}>${esc(l.removeReport)}</button></div>${
        set.lastImportStatus === 'rejected'
          ? `<div class="set-import-message import-rejected"><strong>${esc(l.reportRejected)}</strong><span>${esc(l.importPreserved)}</span><ul>${set.validationErrors
              .slice(0, 3)
              .map((error) => `<li>${esc(error)}</li>`)
              .join('')}</ul></div>`
          : set.lastImportStatus === 'loaded'
            ? `<div class="set-import-message import-loaded">${esc(l.reportLoadedInto.replace('{set}', set.label))}</div>`
            : ''
      }</article>`;
    })
    .join('')}</div></section>`;
}

function comparisonHeader(
  workspace: SimulationWorkspace,
  locale: DashboardLocale,
  l: Labels,
): string {
  const reports = workspace.sets.flatMap((set) => (set.report ? [set.report] : []));
  const sameConfigurationDifferentSample = reports.some((report, index) =>
    reports
      .slice(index + 1)
      .some(
        (other) =>
          other.metadata.configurationId === report.metadata.configurationId &&
          (other.simulation.spins !== report.simulation.spins ||
            other.simulation.seed !== report.simulation.seed),
      ),
  );
  return `<section class="comparison-metadata"><div class="comparison-set-grid">${workspace.sets.map((set) => `<article><span>${esc(set.label)}</span>${setStatus(set, l)}<strong title="${esc(set.report?.metadata.configurationId ?? l.na)}">${set.report ? esc(set.report.metadata.configurationId) : naValue(l)}</strong><small>${set.report ? `${formatInteger(set.report.simulation.spins, locale)} ${l.spins.toLowerCase()}` : l.noReport}</small></article>`).join('')}</div>${sameConfigurationDifferentSample ? `<p class="comparison-context-note">${esc(l.sameConfigurationDifferentSample)}</p>` : ''}</section>`;
}

function comparisonTable(
  workspace: SimulationWorkspace,
  locale: DashboardLocale,
  l: Labels,
  metrics: readonly MetricId[] = COMPARISON_METRICS,
  options: { readonly executive?: boolean; readonly exportMode?: boolean } = {},
): string {
  const baseline = workspace.baselineSetId ? findSet(workspace, workspace.baselineSetId) : null;
  const specialRows = options.executive
    ? [
        `<tr><th>${esc(l.simulationSpins)}</th>${workspace.sets.map((set) => `<td><strong>${set.report ? formatInteger(set.report.simulation.spins, locale) : naValue(l)}</strong></td>`).join('')}</tr>`,
        `<tr><th>${esc(l.rtpConfidenceInterval95)}</th>${workspace.sets.map((set) => `<td class="comparison-ci"><strong>${set.report ? formatPercentRange(set.report.metrics.confidenceInterval95[0], set.report.metrics.confidenceInterval95[1], locale) : naValue(l)}</strong></td>`).join('')}</tr>`,
      ].join('')
    : '';
  const staticBaseline = options.exportMode
    ? `<p class="export-baseline">${esc(l.baseline)}: ${esc(baseline?.label ?? l.noBaseline)}</p>`
    : '';
  return `<section class="report-section comparison-table-section${options.executive ? ' executive-comparison-section' : ''}"><div class="section-heading"><h2>${esc(options.executive ? l.comparativeExecutiveSummary : l.detailedComparison)}</h2><label class="baseline-selector no-print">${esc(l.baseline)}<select id="baseline-select"><option value="">${esc(l.noBaseline)}</option>${workspace.sets
    .filter((set) => set.report)
    .map(
      (set) =>
        `<option value="${set.id}"${set.id === workspace.baselineSetId ? ' selected' : ''}>${esc(set.label)}</option>`,
    )
    .join(
      '',
    )}</select></label></div>${staticBaseline}<div class="table-scroll"><table class="comparison-grid-table comparison-table">${COMPARISON_COLGROUP}<thead><tr><th>${esc(l.metric)}</th>${workspace.sets.map((set) => `<th>${esc(set.label)}<small title="${esc(set.report?.metadata.configurationId ?? l.noReport)}">${esc(set.report?.metadata.configurationId ?? l.noReport)}</small></th>`).join('')}</tr></thead><tbody>${specialRows}${metrics
    .map((id) => {
      const definition = metricDefinition(id);
      return `<tr><th>${esc(label(l, definition.labelKey))}</th>${workspace.sets.map((set) => `<td><strong>${set.report ? esc(formatNullableMetric(set, id, locale, l)) : naValue(l)}</strong>${baseline ? `<small>${esc(deltaText(set, baseline, id, locale, l))}</small>` : ''}</td>`).join('')}</tr>`;
    })
    .join('')}</tbody></table></div></section>`;
}

const RTP_COMPONENTS = [
  ['baseRegular', (r: SimulationReport) => deriveAnalytics(r).baseRegularRtp],
  ['baseScatter', (r: SimulationReport) => deriveAnalytics(r).baseScatterRtp],
  ['baseMultiplier', (r: SimulationReport) => deriveAnalytics(r).baseMultiplierRtp],
  ['freeRegular', (r: SimulationReport) => deriveAnalytics(r).freeRegularRtp],
  ['freeScatter', (r: SimulationReport) => deriveAnalytics(r).freeScatterRtp],
  ['freeMultiplier', (r: SimulationReport) => deriveAnalytics(r).freeMultiplierRtp],
] as const;

function comparisonRtp(workspace: SimulationWorkspace, locale: DashboardLocale, l: Labels): string {
  const valid = workspace.sets.filter(
    (set): set is SimulationSet & { report: SimulationReport } => set.report !== null,
  );
  const max = Math.max(
    ...valid.flatMap((set) => RTP_COMPONENTS.map(([, getter]) => getter(set.report))),
    0.0001,
  );
  return `<section class="report-section comparison-chart-section"><div class="section-heading"><h2>${esc(l.comparisonRtpComposition)}</h2></div>${
    valid.length
      ? `<div class="grouped-bars" role="img" aria-label="${esc(l.comparisonRtpComposition)}">${RTP_COMPONENTS.map(
          ([key, getter]) =>
            `<div class="grouped-row"><span>${esc(label(l, key))}</span><div>${valid
              .map((set) => {
                const amount = getter(set.report);
                const series = seriesNumberForSet(set.id);
                return `<div class="grouped-series-row"><em>${esc(set.label)}</em><i><b class="series-${series}" style="width:${Math.max(0.4, (amount / max) * 100)}%"></b></i><strong>${formatAdaptivePercent(amount, locale)}</strong></div>`;
              })
              .join('')}</div></div>`,
        ).join('')}</div>`
      : `<p class="empty-state">${esc(l.noValidReports)}</p>`
  }</section>`;
}

function comparisonTail(
  workspace: SimulationWorkspace,
  locale: DashboardLocale,
  l: Labels,
): string {
  const valid = workspace.sets.filter(
    (set): set is SimulationSet & { report: SimulationReport } => set.report !== null,
  );
  const frequencies = valid.flatMap((set) =>
    set.report.metrics.tails.filter((t) => t.frequency > 0).map((t) => t.frequency),
  );
  if (!frequencies.length)
    return `<section class="report-section"><div class="section-heading"><h2>${esc(l.tailComparison)}</h2></div><p class="empty-state">${esc(l.notObserved)}</p></section>`;
  const width = 720,
    height = 240,
    left = 72,
    right = 20,
    top = 28,
    bottom = 45;
  let rawMinLog = Math.min(...frequencies.map(Math.log10)),
    rawMaxLog = Math.max(...frequencies.map(Math.log10));
  if (Math.abs(rawMaxLog - rawMinLog) < 0.001) {
    rawMinLog -= 0.5;
    rawMaxLog += 0.5;
  }
  const candidateLogs: number[] = [];
  for (
    let exponent = Math.floor(rawMinLog) - 1;
    exponent <= Math.ceil(rawMaxLog) + 1;
    exponent += 1
  )
    for (const multiplier of [1, 2, 5]) candidateLogs.push(exponent + Math.log10(multiplier));
  let tickPadding = 0.3;
  let tickLogs = candidateLogs.filter(
    (candidate) => candidate >= rawMinLog - tickPadding && candidate <= rawMaxLog + tickPadding,
  );
  while (tickLogs.length < 4 && tickPadding < 1) {
    tickPadding += 0.2;
    tickLogs = candidateLogs.filter(
      (candidate) => candidate >= rawMinLog - tickPadding && candidate <= rawMaxLog + tickPadding,
    );
  }
  if (tickLogs.length > 6) {
    const last = tickLogs.length - 1;
    tickLogs = Array.from(
      new Set(Array.from({ length: 6 }, (_, index) => tickLogs[Math.round((index / 5) * last)]!)),
    );
  }
  const domainMinLog = Math.min(rawMinLog, ...tickLogs) - 0.1,
    domainMaxLog = Math.max(rawMaxLog, ...tickLogs) + 0.1;
  const thresholds = Array.from(
    new Set(valid.flatMap((set) => set.report.metrics.tails.map((t) => t.threshold))),
  ).sort((a, b) => a - b);
  const x = (threshold: number) =>
    left +
    (thresholds.indexOf(threshold) / Math.max(1, thresholds.length - 1)) * (width - left - right);
  const yFromLog = (logFrequency: number) =>
    top + ((domainMaxLog - logFrequency) / (domainMaxLog - domainMinLog)) * (height - top - bottom);
  const y = (frequency: number) => yFromLog(Math.log10(frequency));
  const tickLabel = (logFrequency: number) => {
    const frequency = 10 ** logFrequency;
    const digits = Math.min(6, Math.max(0, -Math.floor(Math.log10(frequency * 100))));
    return formatPercent(frequency, locale, digits);
  };
  const gridlines = tickLogs
    .map(
      (tick) =>
        `<line class="chart-gridline" x1="${left}" y1="${yFromLog(tick)}" x2="${width - right}" y2="${yFromLog(tick)}"/>`,
    )
    .join('');
  const seriesLines = valid
    .map((set) => {
      const points = set.report.metrics.tails.filter((t) => t.frequency > 0);
      return `<polyline class="comparison-line series-stroke-${seriesNumberForSet(set.id)}" points="${points.map((t) => `${x(t.threshold)},${y(t.frequency)}`).join(' ')}"/>`;
    })
    .join('');
  const seriesMarkers = valid
    .map((set) => {
      const points = set.report.metrics.tails.filter((t) => t.frequency > 0);
      const series = seriesNumberForSet(set.id);
      return points
        .map(
          (t) =>
            `<circle class="series-fill-${series}" cx="${x(t.threshold)}" cy="${y(t.frequency)}" r="2.5"><title>${esc(set.label)} · ${formatInteger(t.threshold, locale)}× · ${formatAdaptivePercent(t.frequency, locale)}</title></circle>`,
        )
        .join('');
    })
    .join('');
  const yLabels = tickLogs
    .map(
      (tick) =>
        `<text class="y-axis-label" x="${left - 8}" y="${yFromLog(tick) + 3}">${tickLabel(tick)}</text>`,
    )
    .join('');
  const xLabels = thresholds
    .map(
      (threshold) =>
        `<text class="x-axis-label" x="${x(threshold)}" y="${height - 18}">${formatInteger(threshold, locale)}×</text>`,
    )
    .join('');
  return `<section class="report-section comparison-tail-section"><div class="section-heading"><h2>${esc(l.tailComparison)}</h2></div><div class="chart-legend">${valid.map((set) => `<span class="legend-${seriesNumberForSet(set.id)}">${esc(set.label)}</span>`).join('')}</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(l.tailComparison)}"><text class="y-axis-title" x="${left}" y="14">${esc(l.logFrequency)}</text>${gridlines}<line class="chart-axis y-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="chart-axis x-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>${seriesLines}${seriesMarkers}${yLabels}${xLabels}</svg></section>`;
}

function economySplit(workspace: SimulationWorkspace, locale: DashboardLocale, l: Labels): string {
  const rows = [
    ['baseContribution', (r: SimulationReport) => r.metrics.baseGameWinContribution],
    ['freeContribution', (r: SimulationReport) => r.metrics.freeGameWinContribution],
    [
      'baseShare',
      (r: SimulationReport) =>
        r.metrics.rtp > 0 ? r.metrics.baseGameWinContribution / r.metrics.rtp : null,
    ],
    [
      'featureShare',
      (r: SimulationReport) =>
        r.metrics.rtp > 0 ? r.metrics.freeGameWinContribution / r.metrics.rtp : null,
    ],
  ] as const;
  return `<section class="report-section economy-comparison"><div class="section-heading"><h2>${esc(l.economySplit)}</h2></div><div class="table-scroll"><table class="comparison-grid-table economy-table">${COMPARISON_COLGROUP}<thead><tr><th>${esc(l.metric)}</th>${workspace.sets.map((set) => `<th>${esc(set.label)}</th>`).join('')}</tr></thead><tbody>${rows
    .map(
      ([key, getter]) =>
        `<tr><th>${esc(label(l, key))}</th>${workspace.sets
          .map((set) => {
            const amount = set.report ? getter(set.report) : null;
            return `<td><strong>${set.report ? (amount === null ? esc(l.na) : formatAdaptivePercent(amount, locale)) : naValue(l)}</strong></td>`;
          })
          .join('')}</tr>`,
    )
    .join('')}</tbody></table></div></section>`;
}

export function renderCompareDashboard(
  workspace: SimulationWorkspace,
  locale: DashboardLocale,
  l: Labels,
): string {
  return `<main id="dashboard-content" class="compare-dashboard">${comparisonHeader(workspace, locale, l)}${comparisonTable(workspace, locale, l, COMPARISON_METRICS, { executive: true })}${economySplit(workspace, locale, l)}<div class="comparison-chart-grid">${comparisonRtp(workspace, locale, l)}${comparisonTail(workspace, locale, l)}</div><footer>${esc(l.footer)}</footer></main>`;
}

function exportPageFooter(l: Labels, page: number, total: number): string {
  return `<footer class="export-page-footer"><span>${esc(l.footer)}</span><span>${esc(l.page)} ${page} / ${total}</span></footer>`;
}

export function renderCompareExportDocument(
  workspace: SimulationWorkspace,
  locale: DashboardLocale,
  l: Labels,
): string {
  const header = `<header class="export-report-header"><p class="eyebrow">Lucky888</p><h1>${esc(l.title)}</h1><strong>${esc(l.comparisonReport)}</strong></header>`;
  return `<main class="export-report compare-export-document"><section class="export-page compare-export-executive">${header}${comparisonHeader(workspace, locale, l)}${comparisonTable(workspace, locale, l, EXECUTIVE_COMPARISON_METRICS, { executive: true, exportMode: true })}${exportPageFooter(l, 1, 3)}</section><section class="export-page compare-export-details"><header class="export-section-header"><span>Lucky888</span><h2>${esc(l.detailedComparison)}</h2></header>${economySplit(workspace, locale, l)}${comparisonTable(workspace, locale, l, COMPARISON_METRICS, { exportMode: true })}${exportPageFooter(l, 2, 3)}</section><section class="export-page compare-export-charts"><header class="export-section-header"><span>Lucky888</span><h2>${esc(l.comparativeDistribution)}</h2></header>${comparisonRtp(workspace, locale, l)}${comparisonTail(workspace, locale, l)}${exportPageFooter(l, 3, 3)}</section></main>`;
}

export function renderEmptyDetail(set: SimulationSet, l: Labels): string {
  return `<main id="dashboard-content"><section class="empty-detail"><p class="eyebrow">${esc(set.label)}</p><h2>${esc(l.noReportConfigured)}</h2><p>${esc(l.emptyDetailInstruction)}</p></section></main>`;
}
