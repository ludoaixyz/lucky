import type { DashboardLabels } from '../i18n/dictionaries.js';
import {
  formatAdaptivePercent,
  formatDate,
  formatDecimal,
  formatFixedDecimal,
  formatInteger,
  formatMultiplier,
  formatOneIn,
  formatPercentRange,
} from '../i18n/format.js';
import type { DashboardLocale } from '../i18n/types.js';
import {
  percentagePointDelta,
  relativePercentageDelta,
  tailFrequencyDelta,
} from '../reports/comparison-delta.js';
import { metricDefinition, type MetricId, type MetricUnit } from '../reports/metric-registry.js';
import {
  formatReciprocalTailTick,
  reciprocalTailScale,
  reciprocalTailY,
} from '../reports/tail-axis.js';
import type { DashboardAnalysisReport, LoadedReport } from '../types/simulation-report.js';
import {
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
  '<colgroup><col class="comparison-metric-column"><col class="comparison-sim-column"><col class="comparison-sim-column"><col class="comparison-delta-column"></colgroup>';

const visibleComparisonSets = (workspace: SimulationWorkspace): readonly SimulationSet[] =>
  workspace.sets.filter((set) => set.id === 'sim-1' || set.id === 'sim-2');

type ComparisonRowId = MetricId | 'simulationSpins' | 'confidenceInterval';
interface ComparisonSection {
  readonly labelKey: keyof Labels;
  readonly rows: readonly ComparisonRowId[];
}

export const EXECUTIVE_COMPARISON_SECTIONS = Object.freeze([
  {
    labelKey: 'simulationOverview',
    rows: [
      'simulationSpins',
      'rtp',
      'confidenceInterval',
      'winningSpinFrequency',
      'featureFrequency',
    ],
  },
  {
    labelKey: 'tumbleMechanics',
    rows: [
      'tumbleTriggerFrequency',
      'tumbleRoundsPerPaidSpin',
      'averageTumbleRoundsPerTriggeringSpin',
      'bathalaToNextWinConversionRate',
    ],
  },
  {
    labelKey: 'rtpComposition',
    rows: [
      'baseGameWinContribution',
      'freeGameWinContribution',
      'baseRegularRtp',
      'baseMultiplierRtp',
      'freeRegularRtp',
      'freeMultiplierRtp',
      'multiplierRtpContribution',
    ],
  },
  {
    labelKey: 'volatilityTail',
    rows: [
      'coefficientOfVariation',
      'standardDeviation',
      'averageWinPerWinningSpin',
      'averageMultiplierValue',
      'maximumSummedMultiplier',
      'maximumObservedWin',
      'tail100',
      'tail250',
      'tail500',
      'tail1000',
    ],
  },
] satisfies readonly ComparisonSection[]);

export const DETAILED_COMPARISON_SECTIONS = Object.freeze([
  {
    labelKey: 'returnFrequency',
    rows: ['baseRtpShare', 'featureRtpShare', 'baseScatterRtp', 'freeScatterRtp'],
  },
  {
    labelKey: 'tumbleBathala',
    rows: [
      'baseGameTumbleTriggerFrequency',
      'freeGameTumbleTriggerFrequency',
      'averageBaseGameTumbleRoundsPerTrigger',
      'averageFreeGameTumbleRoundsPerTrigger',
      'maximumObservedBaseGameTumbleDepth',
      'maximumObservedFreeGameTumbleDepth',
      'bathalaActivationFrequency',
      'averageSymbolsRemoved',
    ],
  },
  {
    labelKey: 'multiplierFeature',
    rows: [
      'multiplierAppearanceFrequency',
      'averageSummedMultiplierOnMultipliedWins',
      'freeGameTriggerCount',
      'averageInitiallyAwardedFreeGames',
      'averageFreeGamesPlayed',
      'maximumObservedFeatureLength',
      'retriggerCount',
      'averageRetriggersPerFeature',
      'averageEndingFreeGameMultiplier',
    ],
  },
] satisfies readonly ComparisonSection[]);

const SET_SERIES = Object.freeze({ 'sim-1': 1, 'sim-2': 2, 'sim-3': 3 } as const);
export function seriesNumberForSet(setId: string): 1 | 2 | 3 {
  return SET_SERIES[setId as keyof typeof SET_SERIES] ?? 1;
}

export function comparisonMetricValue(set: SimulationSet, id: MetricId): number | null {
  return set.report ? metricDefinition(id).getter(set.report) : null;
}

const isTailMetric = (id: MetricId): boolean =>
  id === 'tail100' || id === 'tail250' || id === 'tail500' || id === 'tail1000';

function formatValue(
  value: number | null,
  unit: MetricUnit,
  locale: DashboardLocale,
  l: Labels,
): string {
  if (value === null) return l.na;
  if (unit === 'percent') return formatAdaptivePercent(value, locale);
  if (unit === 'frequency') return formatOneIn(value, locale, l.oneInFormat);
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
  const value = comparisonMetricValue(set, id);
  if (isTailMetric(id))
    return value !== null && value > 0 ? formatOneIn(value, locale, l.oneInFormat) : l.notObserved;
  const definition = metricDefinition(id);
  return formatValue(value, definition.unit, locale, l);
}

function signed(value: number, locale: DashboardLocale, digits: number): string {
  return `${value >= 0 ? '+' : ''}${formatFixedDecimal(value, locale, digits)}`;
}

export function formatComparisonDelta(
  baseline: SimulationSet | undefined,
  comparison: SimulationSet | undefined,
  id: MetricId,
  locale: DashboardLocale,
  l: Labels,
): string {
  if (!baseline?.report || !comparison?.report) return l.na;
  const base = comparisonMetricValue(baseline, id);
  const current = comparisonMetricValue(comparison, id);
  if (isTailMetric(id)) {
    const delta = tailFrequencyDelta(base, current);
    if (delta.kind === 'notComparable') return l.notComparable;
    if (delta.kind === 'unchanged') return l.unchanged;
    return `${formatDecimal(delta.factor, locale, 2)}\u00d7 ${delta.kind === 'rarer' ? l.rarer : l.moreFrequent}`;
  }
  if (current === null || base === null) return l.na;
  const unit = metricDefinition(id).unit;
  if (unit === 'percent') {
    const delta = percentagePointDelta(base, current);
    return delta === null ? l.na : `${signed(delta, locale, 2)} pp`;
  }
  const delta = relativePercentageDelta(base, current);
  return delta === null ? l.na : `${signed(delta, locale, 1)}%`;
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
  const visibleSets = visibleComparisonSets(workspace);
  return `<section class="workspace-manager no-print"><div class="workspace-toolbar"><div><p class="eyebrow">${esc(l.comparisonWorkspace)}</p><h2>${esc(l.simulationSets)}</h2></div><div class="view-switch"><button data-view-mode="compare" class="${workspace.viewMode === 'compare' ? 'is-active' : ''}">${esc(l.compare)}</button><button data-view-mode="detail" class="${workspace.viewMode === 'detail' ? 'is-active' : ''}">${esc(l.detailedReport)}</button></div></div><div class="set-manager-grid">${workspace.sets
    .filter((set) => visibleSets.includes(set))
    .map((set) => {
      const selected = set.id === workspace.selectedSetId;
      const setWarnings = warnings.filter((warning) => warning.setId === set.id);
      const sourceStatus =
        set.report?.sourceType === 'workbench-session' ? l.workbenchCsv : l.validReport;
      const spinsLabel = set.report?.sourceType === 'workbench-session' ? l.sessionSpins : l.spins;
      const rtpLabel =
        set.report?.sourceType === 'workbench-session' ? l.sessionRtp : l.creditedRtp;
      const generated =
        set.report && Number.isFinite(Date.parse(set.report.metadata.generatedAt))
          ? formatDate(set.report.metadata.generatedAt, locale)
          : l.na;
      return `<article class="simulation-set-card ${selected ? 'is-selected' : ''}" data-set-card="${set.id}"><div class="set-card-heading"><button data-select-set="${set.id}"><strong>${esc(set.label)}</strong>${setStatus(set, l)}</button><input data-rename-set="${set.id}" value="${esc(set.label)}" aria-label="${esc(l.renameSet)}"></div><dl><div><dt>${esc(l.configuration)}</dt><dd>${esc(set.report?.metadata.configurationId ?? l.na)}</dd></div><div><dt>${esc(l.gameVersion)}</dt><dd>${esc(set.report?.metadata.gameVersion ?? l.na)}</dd></div><div><dt>${esc(l.sourceFile)}</dt><dd>${esc(set.sourceName ?? l.na)}</dd></div><div><dt>${esc(spinsLabel)}</dt><dd>${set.report ? formatInteger(set.report.simulation.spins, locale) : l.na}</dd></div><div><dt>${esc(rtpLabel)}</dt><dd>${set.report && set.report.metrics.rtp !== null ? formatAdaptivePercent(set.report.metrics.rtp, locale) : l.na}</dd></div><div><dt>${esc(l.generated)}</dt><dd>${esc(generated)}</dd></div><div><dt>${esc(l.validationState)}</dt><dd>${set.report ? sourceStatus : l.noReport}</dd></div></dl>${setWarnings.map((w) => `<p class="set-warning">${esc(label(l, w.kind))}</p>`).join('')}<label class="set-report-select">${esc(l.loadBundledReport)}<select data-catalog-report="${set.id}"><option value="">${esc(l.chooseBuiltIn)}</option>${catalog.map((report) => `<option value="${esc(report.id)}">${esc(report.label)}</option>`).join('')}</select></label><div class="set-drop-zone" data-drop-set="${set.id}" tabindex="0"><strong>${esc(set.report ? l.replaceReport : l.dropReportHere)}</strong><span>${esc(l.browseFile)}</span><input data-file-set="${set.id}" type="file" accept="application/json,.json,text/csv,.csv"></div><div class="set-actions"><button data-select-set="${set.id}" data-detail-set="${set.id}">${esc(l.viewReportMetadata)}</button><button data-remove-set="${set.id}" ${set.report ? '' : 'disabled'}>${esc(l.removeReport)}</button></div>${
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
  const visibleSets = visibleComparisonSets(workspace);
  const reports = visibleSets.flatMap((set) => (set.report ? [set.report] : []));
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
  const baseline = visibleSets[0];
  return `<section class="comparison-metadata"><div class="comparison-set-grid">${visibleSets.map((set) => `<article><span>${esc(set.label)}</span>${setStatus(set, l)}<strong title="${esc(set.report?.metadata.configurationId ?? l.na)}">${set.report ? esc(set.report.metadata.configurationId) : naValue(l)}</strong><small>${set.report ? `${formatInteger(set.report.simulation.spins, locale)} ${l.spins.toLowerCase()}` : l.noReport}</small></article>`).join('')}</div><p class="comparison-baseline">${esc(l.baseline)}: ${esc(baseline?.label ?? 'Sim 1')}${baseline?.report ? ` - ${esc(baseline.report.metadata.configurationId)}` : ''}</p>${sameConfigurationDifferentSample ? `<p class="comparison-context-note">${esc(l.sameConfigurationDifferentSample)}</p>` : ''}</section>`;
}

function comparisonTable(
  workspace: SimulationWorkspace,
  locale: DashboardLocale,
  l: Labels,
  sections: readonly ComparisonSection[],
  options: { readonly executive?: boolean; readonly exportMode?: boolean } = {},
): string {
  const visibleSets = visibleComparisonSets(workspace);
  const baseline = visibleSets[0];
  const comparison = visibleSets[1];
  const deltaCell = (value: string) =>
    `<td class="comparison-delta-cell"><strong>${value === l.na ? naValue(l) : esc(value)}</strong></td>`;
  return `<section class="report-section comparison-table-section${options.executive ? ' executive-comparison-section' : ''}"><div class="section-heading"><h2>${esc(options.executive ? l.comparativeExecutiveSummary : l.detailedComparison)}</h2></div><div class="table-scroll"><table class="comparison-grid-table comparison-table">${COMPARISON_COLGROUP}<thead><tr><th>${esc(l.metric)}</th>${visibleSets.map((set) => `<th>${esc(set.label)}<small title="${esc(set.report?.metadata.configurationId ?? l.noReport)}">${esc(set.report?.metadata.configurationId ?? l.noReport)}</small></th>`).join('')}<th class="comparison-delta-heading">${esc(l.deltaSymbol)}<small>${esc(l.sim2VsSim1)}</small></th></tr></thead><tbody>${sections
    .map(
      (section) =>
        `<tr class="comparison-subsection-row"><th colspan="4"><span>${esc(l[section.labelKey])}</span></th></tr>${section.rows
          .map((id) => {
            if (id === 'simulationSpins')
              return `<tr><th>${esc(visibleSets.some((set) => set.report?.sourceType === 'workbench-session') ? l.sessionSpins : l.simulationSpins)}</th>${visibleSets.map((set) => `<td><strong>${set.report ? formatInteger(set.report.simulation.spins, locale) : naValue(l)}</strong></td>`).join('')}${deltaCell(baseline?.report && comparison?.report ? `${signed(relativePercentageDelta(baseline.report.simulation.spins, comparison.report.simulation.spins) ?? 0, locale, 1)}%` : l.na)}</tr>`;
            if (id === 'confidenceInterval')
              return `<tr><th>${esc(l.rtpConfidenceInterval95)}</th>${visibleSets.map((set) => `<td class="comparison-ci"><strong>${set.report ? formatPercentRange(set.report.metrics.confidenceInterval95[0], set.report.metrics.confidenceInterval95[1], locale) : naValue(l)}</strong></td>`).join('')}${deltaCell(baseline?.report && comparison?.report ? `${signed(percentagePointDelta((baseline.report.metrics.confidenceInterval95[0] + baseline.report.metrics.confidenceInterval95[1]) / 2, (comparison.report.metrics.confidenceInterval95[0] + comparison.report.metrics.confidenceInterval95[1]) / 2) ?? 0, locale, 2)} pp` : l.na)}</tr>`;
            const definition = metricDefinition(id);
            return `<tr><th>${esc(label(l, definition.labelKey))}</th>${visibleSets.map((set) => `<td><strong>${set.report ? esc(formatNullableMetric(set, id, locale, l)) : naValue(l)}</strong></td>`).join('')}${deltaCell(formatComparisonDelta(baseline, comparison, id, locale, l))}</tr>`;
          })
          .join('')}`,
    )
    .join('')}</tbody></table></div></section>`;
}

function profileDiagnosis(
  set: SimulationSet | undefined,
  other: SimulationSet | undefined,
  l: Labels,
): string {
  if (!set?.report) return l.na;
  const ownCv = comparisonMetricValue(set, 'coefficientOfVariation');
  const otherCv = other ? comparisonMetricValue(other, 'coefficientOfVariation') : null;
  const volatility =
    ownCv === null || otherCv === null
      ? l.volatility
      : ownCv > otherCv
        ? l.higherVolatility
        : ownCv < otherCv
          ? l.lowerVolatility
          : l.similarVolatility;
  const multiplier = comparisonMetricValue(set, 'multiplierRtpContribution');
  const tumble = comparisonMetricValue(set, 'tumbleTriggerFrequency');
  const driver =
    multiplier === null || tumble === null
      ? null
      : multiplier >= tumble
        ? l.multiplierLed
        : l.tumbleLed;
  return driver ? `${volatility} / ${driver}` : volatility;
}

function comparisonInsights(
  workspace: SimulationWorkspace,
  locale: DashboardLocale,
  l: Labels,
): string {
  const [baseline, comparison] = visibleComparisonSets(workspace);
  const cards = [
    ['winCadence', 'winningSpinFrequency'],
    ['tumbleActivity', 'tumbleTriggerFrequency'],
    ['multiplierRtp', 'multiplierRtpContribution'],
    ['volatility', 'coefficientOfVariation'],
    ['maxObservedWin', 'maximumObservedWin'],
  ] as const satisfies readonly (readonly [keyof Labels, MetricId])[];
  return `<section class="report-section comparison-insights"><div class="section-heading"><h2>${esc(l.keyProfileShift)}</h2></div><div class="profile-shift-grid">${cards
    .map(([labelKey, id]) => {
      const baselineValue = baseline?.report ? formatNullableMetric(baseline, id, locale, l) : l.na;
      const comparisonValue = comparison?.report
        ? formatNullableMetric(comparison, id, locale, l)
        : l.na;
      return `<article><span>${esc(l[labelKey])}</span><strong>${esc(baselineValue)} <b>&rarr;</b> ${esc(comparisonValue)}</strong><small>${esc(formatComparisonDelta(baseline, comparison, id, locale, l))}</small></article>`;
    })
    .join(
      '',
    )}</div><div class="profile-diagnosis"><h3>${esc(l.comparisonProfileDiagnosis)}</h3><p><strong>${esc(baseline?.label ?? 'Sim 1')}</strong><span>${esc(profileDiagnosis(baseline, comparison, l))}</span></p><p><strong>${esc(comparison?.label ?? 'Sim 2')}</strong><span>${esc(profileDiagnosis(comparison, baseline, l))}</span></p></div></section>`;
}

function comparisonTail(
  workspace: SimulationWorkspace,
  locale: DashboardLocale,
  l: Labels,
): string {
  const valid = visibleComparisonSets(workspace).filter(
    (set): set is SimulationSet & { report: DashboardAnalysisReport } => set.report !== null,
  );
  const frequencies = valid.flatMap((set) =>
    set.report.metrics.tails.filter((t) => t.frequency > 0).map((t) => t.frequency),
  );
  if (!frequencies.length)
    return `<section class="report-section"><div class="section-heading"><h2>${esc(l.tailComparison)}</h2></div><p class="empty-state">${esc(l.notObserved)}</p></section>`;
  const width = 720,
    height = 500,
    left = 95,
    right = 20,
    top = 38,
    bottom = 52;
  const scale = reciprocalTailScale(frequencies);
  if (!scale)
    return `<section class="report-section"><div class="section-heading"><h2>${esc(l.tailComparison)}</h2></div><p class="empty-state">${esc(l.notObserved)}</p></section>`;
  const thresholds = Array.from(
    new Set(valid.flatMap((set) => set.report.metrics.tails.map((t) => t.threshold))),
  ).sort((a, b) => a - b);
  const x = (threshold: number) =>
    left +
    (thresholds.indexOf(threshold) / Math.max(1, thresholds.length - 1)) * (width - left - right);
  const plotHeight = height - top - bottom;
  const y = (frequency: number) => reciprocalTailY(scale, frequency, top, plotHeight) ?? top;
  const gridlines = scale.ticks
    .map(
      (tick) =>
        `<line class="chart-gridline" x1="${left}" y1="${y(tick.frequency)}" x2="${width - right}" y2="${y(tick.frequency)}"/>`,
    )
    .join('');
  const seriesLines = valid
    .map((set) => {
      const segments: (typeof set.report.metrics.tails)[] = [];
      let segment: typeof set.report.metrics.tails = [];
      for (const tail of set.report.metrics.tails) {
        if (tail.frequency > 0) segment = [...segment, tail];
        else if (segment.length > 0) {
          segments.push(segment);
          segment = [];
        }
      }
      if (segment.length > 0) segments.push(segment);
      return segments
        .map(
          (points) =>
            `<polyline class="comparison-line series-stroke-${seriesNumberForSet(set.id)}" points="${points.map((t) => `${x(t.threshold)},${y(t.frequency)}`).join(' ')}"/>`,
        )
        .join('');
    })
    .join('');
  const seriesMarkers = valid
    .map((set) => {
      const points = set.report.metrics.tails.filter((t) => t.frequency > 0);
      const series = seriesNumberForSet(set.id);
      return points
        .map(
          (t) =>
            `<circle class="series-fill-${series}" cx="${x(t.threshold)}" cy="${y(t.frequency)}" r="3.5"><title>${esc(set.label)}\n${formatInteger(t.threshold, locale)}×+\n\n${esc(l.frequency)}: ${formatAdaptivePercent(t.frequency, locale)}\n${esc(l.occurrence)}: ${esc(formatOneIn(t.frequency, locale, l.oneInFormat))}\n${esc(l.observed)}: ${formatInteger(t.count, locale)} / ${formatInteger(set.report.simulation.spins, locale)} ${esc(l.spins.toLowerCase())}</title></circle>`,
        )
        .join('');
    })
    .join('');
  const yLabels = scale.ticks
    .map(
      (tick) =>
        `<text class="y-axis-label" x="${left - 8}" y="${y(tick.frequency) + 3}">${esc(formatReciprocalTailTick(tick.frequency, l.oneIn, l.oneMillion))}</text>`,
    )
    .join('');
  const xLabels = thresholds
    .map(
      (threshold) =>
        `<text class="x-axis-label" x="${x(threshold)}" y="${height - 18}">${formatInteger(threshold, locale)}×</text>`,
    )
    .join('');
  const tableThresholds = thresholds.filter(
    (threshold) =>
      threshold <= 1_000 &&
      valid.some(
        (set) =>
          (set.report.metrics.tails.find((tail) => tail.threshold === threshold)?.count ?? 0) > 0,
      ),
  );
  const tailValue = (set: (typeof valid)[number] | undefined, threshold: number) =>
    set?.report.metrics.tails.find((tail) => tail.threshold === threshold) ?? null;
  const tailCell = (set: (typeof valid)[number] | undefined, threshold: number) => {
    const tail = tailValue(set, threshold);
    return tail && tail.count > 0
      ? formatOneIn(tail.frequency, locale, l.oneInFormat)
      : l.notObserved;
  };
  const tailDelta = (threshold: number) => {
    const base = tailValue(valid[0], threshold);
    const current = tailValue(valid[1], threshold);
    const delta = tailFrequencyDelta(base?.frequency ?? null, current?.frequency ?? null);
    if (delta.kind === 'notComparable') return l.notComparable;
    if (delta.kind === 'unchanged') return l.unchanged;
    return `${formatDecimal(delta.factor, locale, 2)}\u00d7 ${delta.kind === 'rarer' ? l.rarer : l.moreFrequent}`;
  };
  const tailTable = tableThresholds.length
    ? `<div class="tail-frequency-block"><h3>${esc(l.tailFrequencyTable)}</h3><div class="table-scroll"><table class="comparison-grid-table comparison-table tail-frequency-table">${COMPARISON_COLGROUP}<thead><tr><th>${esc(l.threshold)}</th><th>${esc(valid[0]?.label ?? 'Sim 1')}</th><th>${esc(valid[1]?.label ?? 'Sim 2')}</th><th class="comparison-delta-heading">${esc(l.deltaSymbol)}</th></tr></thead><tbody>${tableThresholds.map((threshold) => `<tr><th>${formatInteger(threshold, locale)}\u00d7+</th><td><strong>${esc(tailCell(valid[0], threshold))}</strong></td><td><strong>${esc(tailCell(valid[1], threshold))}</strong></td><td class="comparison-delta-cell"><strong>${esc(tailDelta(threshold))}</strong></td></tr>`).join('')}</tbody></table></div></div>`
    : '';
  const endpointNotes = valid
    .flatMap((set) => {
      const absent = set.report.metrics.tails.find((tail) => tail.count === 0);
      return absent
        ? [
            `<p><strong>${esc(set.label)}:</strong> ${esc(l.findingTailAbsent.replace('{threshold}', formatInteger(absent.threshold, locale)))}</p>`,
          ]
        : [];
    })
    .join('');
  return `<section class="report-section comparison-tail-section"><div class="section-heading"><h2>${esc(l.tailComparison)}</h2></div><p class="tail-chart-subtitle">${esc(l.reciprocalLogScale)}</p><div class="chart-legend">${valid.map((set) => `<span class="legend-${seriesNumberForSet(set.id)}">${esc(set.label)}</span>`).join('')}</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(l.tailComparison)}"><text class="y-axis-title" x="${left}" y="17">${esc(l.logFrequencyLabel)}</text>${gridlines}<line class="chart-axis y-axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="chart-axis x-axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>${seriesLines}${seriesMarkers}${yLabels}${xLabels}</svg>${tailTable}${endpointNotes ? `<div class="tail-endpoint-notes">${endpointNotes}</div>` : ''}</section>`;
}

export function renderCompareDashboard(
  workspace: SimulationWorkspace,
  locale: DashboardLocale,
  l: Labels,
): string {
  return `<main id="dashboard-content" class="compare-dashboard">${comparisonHeader(workspace, locale, l)}${comparisonInsights(workspace, locale, l)}${comparisonTable(workspace, locale, l, EXECUTIVE_COMPARISON_SECTIONS, { executive: true })}${comparisonTable(workspace, locale, l, DETAILED_COMPARISON_SECTIONS)}${comparisonTail(workspace, locale, l)}<footer>${esc(l.footer)}</footer></main>`;
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
  return `<main class="export-report compare-export-document"><section class="export-page compare-export-executive">${header}${comparisonHeader(workspace, locale, l)}${comparisonInsights(workspace, locale, l)}${comparisonTable(workspace, locale, l, EXECUTIVE_COMPARISON_SECTIONS, { executive: true, exportMode: true })}${exportPageFooter(l, 1, 3)}</section><section class="export-page compare-export-details"><header class="export-section-header"><span>Lucky888</span><h2>${esc(l.detailedComparison)}</h2></header>${comparisonTable(workspace, locale, l, DETAILED_COMPARISON_SECTIONS, { exportMode: true })}${exportPageFooter(l, 2, 3)}</section><section class="export-page compare-export-charts"><header class="export-section-header"><span>Lucky888</span><h2>${esc(l.comparativeDistribution)}</h2></header>${comparisonTail(workspace, locale, l)}${exportPageFooter(l, 3, 3)}</section></main>`;
}

export function renderEmptyDetail(set: SimulationSet, l: Labels): string {
  return `<main id="dashboard-content"><section class="empty-detail"><p class="eyebrow">${esc(set.label)}</p><h2>${esc(l.noReportConfigured)}</h2><p>${esc(l.emptyDetailInstruction)}</p></section></main>`;
}
