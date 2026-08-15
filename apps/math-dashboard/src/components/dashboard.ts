import type { ManagementTarget, ManagementTargets } from '../config/management-targets.js';
import { MANAGEMENT_TARGETS } from '../config/management-targets.js';
import type { DashboardLocale } from '../i18n/types.js';
import type { DashboardLabels } from '../i18n/dictionaries.js';
import {
  formatAdaptivePercent,
  formatCredits,
  formatDate,
  formatDecimal,
  formatFixedDecimal,
  formatInteger,
  formatMultiplier,
  formatOneIn,
  formatPercent,
  formatPercentRange,
} from '../i18n/format.js';
import type { ProfileStatus, SimulationReport, Status } from '../types/simulation-report.js';
import {
  dataQualityIssues,
  evaluateTargets,
  overallStatus,
  reconcileReport,
  type TargetEvaluation,
} from '../reports/analysis.js';
import { simulationAssessment, type AssessmentFinding } from '../reports/assessment.js';
import { deriveAnalytics, tailAt } from '../reports/derived.js';
import {
  METRIC_REGISTRY,
  metricDefinition,
  type MetricId,
  type MetricUnit,
} from '../reports/metric-registry.js';

type Labels = DashboardLabels;
const label = (labels: Labels, key: string): string =>
  (labels as Readonly<Record<string, string>>)[key] ?? key;
const esc = (value: unknown): string =>
  String(value).replace(
    /[&<>'"]/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c,
  );

function tip(label: string, text?: string): string {
  return text
    ? `${esc(label)} <button class="metric-tip no-print" type="button" title="${esc(text)}" aria-label="${esc(text)}">?</button>`
    : esc(label);
}

function statusLabel(status: Status | ProfileStatus | 'INFO', l: Labels): string {
  return label(l, `status${status === 'N/A' ? 'Na' : status[0] + status.slice(1).toLowerCase()}`);
}

function badge(status: Status | ProfileStatus | 'INFO', l: Labels): string {
  return `<span class="status-badge status-${status.toLowerCase().replace('/', '-')}">${esc(statusLabel(status, l))}</span>`;
}

function value(
  value: number,
  unit: MetricUnit,
  locale: DashboardLocale,
  l: Labels,
  precision = 2,
): string {
  if (unit === 'percent') return formatAdaptivePercent(value, locale);
  if (unit === 'frequency') return formatOneIn(value, locale, l.oneIn);
  if (unit === 'multiplier') return formatMultiplier(value, locale, precision);
  if (unit === 'credits') return formatCredits(value, locale).replace('credits', l.credits);
  if (unit === 'count') return formatInteger(value, locale);
  return formatFixedDecimal(value, locale, precision);
}

function metricValue(
  report: SimulationReport,
  id: MetricId,
  locale: DashboardLocale,
  l: Labels,
): string {
  const definition = metricDefinition(id);
  const result = definition.getter(report);
  return result === null ? l.na : value(result, definition.unit, locale, l, definition.precision);
}

function targetText(
  target: ManagementTarget | null,
  locale: DashboardLocale,
  l: Labels,
  unit: MetricUnit,
): string {
  if (!target) return l.noTarget;
  if (target.type === 'informational') return l.informational;
  const show = (v: number) => value(v, unit, locale, l);
  if (target.type === 'exact' && target.exact !== undefined) return show(target.exact);
  if (target.minimum !== undefined && target.maximum !== undefined)
    return `${show(target.minimum)}–${show(target.maximum)}`;
  if (target.minimum !== undefined) return `≥ ${show(target.minimum)}`;
  if (target.maximum !== undefined) return `≤ ${show(target.maximum)}`;
  return l.na;
}

function deltaText(item: TargetEvaluation, locale: DashboardLocale, l: Labels): string {
  if (item.delta === null) return '—';
  const unit = metricDefinition(item.key).unit;
  if (unit === 'percent')
    return `${item.delta >= 0 ? '+' : ''}${formatFixedDecimal(item.delta * 100, locale, 2)} pp`;
  return `${item.delta >= 0 ? '+' : ''}${value(item.delta, unit, locale, l)}`;
}

function kpi(
  report: SimulationReport,
  id: MetricId,
  locale: DashboardLocale,
  l: Labels,
  evaluation?: TargetEvaluation,
  extra = '',
): string {
  const d = metricDefinition(id);
  const target = evaluation?.target ?? null;
  return `<article class="kpi-card"><h3>${tip(label(l, d.labelKey), d.descriptionKey ? label(l, d.descriptionKey) : undefined)}</h3><strong>${metricValue(report, id, locale, l)}</strong>${extra ? `<p>${extra}</p>` : ''}${evaluation ? `<div class="kpi-target"><span>${esc(l.target)}: ${targetText(target, locale, l, d.unit)}</span>${badge(evaluation.status, l)}</div>` : ''}</article>`;
}

function section(title: string, content: string, classes = ''): string {
  return `<section class="report-section ${classes}"><div class="section-heading"><h2>${esc(title)}</h2></div>${content}</section>`;
}

function comparisonTable(headers: string[], rows: string[][], classes = ''): string {
  return `<div class="table-scroll ${classes}"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, i) => `<${i === 0 ? 'th' : 'td'}>${cell}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function health(
  report: SimulationReport,
  locale: DashboardLocale,
  l: Labels,
  targets: ManagementTargets,
): string {
  const ids: MetricId[] = [
    'rtp',
    'featureFrequency',
    'winningSpinFrequency',
    'maximumObservedWin',
    'coefficientOfVariation',
    'freeGameWinContribution',
  ];
  const evaluations = new Map(evaluateTargets(report, targets).map((x) => [x.key, x]));
  const cards = ids.map((id) => kpi(report, id, locale, l, evaluations.get(id))).join('');
  const status = overallStatus(report, targets);
  return section(
    l.mathematicalHealth,
    `<div class="health-heading"><div><span>${esc(l.profileStatus)}</span>${badge(status, l)}</div><p>${esc(status === 'UNCALIBRATED' ? l.uncalibratedNote : l.calibratedNote)}</p></div><div class="health-grid">${cards}</div>`,
    'health-section',
  );
}

function assessmentText(
  f: AssessmentFinding,
  report: SimulationReport,
  locale: DashboardLocale,
  l: Labels,
): string {
  const template = label(l, f.key);
  const metric =
    f.metric && f.metric in METRIC_REGISTRY
      ? label(l, metricDefinition(f.metric as MetricId).labelKey)
      : '';
  const replacements: Record<string, string> = {
    metric,
    value:
      f.metric && f.metric in METRIC_REGISTRY
        ? value(f.values[0]!, metricDefinition(f.metric as MetricId).unit, locale, l)
        : f.key === 'findingFeatureRtp' || f.key === 'findingMultiplierRtp'
          ? formatFixedDecimal((f.values[0] ?? 0) * 100, locale, 2)
          : formatAdaptivePercent(f.values[0] ?? 0, locale),
    delta: formatFixedDecimal((f.values[1] ?? 0) * 100, locale, 2),
    odds: formatInteger(f.values[1] ?? 0, locale),
    threshold: formatInteger(f.values[0] ?? 0, locale),
    lower: formatPercent(f.values[0] ?? 0, locale, 2),
    upper: formatPercent(f.values[1] ?? 0, locale, 2),
  };
  return Object.entries(replacements).reduce(
    (text, [key, replacement]) => text.replaceAll(`{${key}}`, replacement),
    template,
  );
}

function assessment(
  report: SimulationReport,
  locale: DashboardLocale,
  l: Labels,
  targets: ManagementTargets,
): string {
  const findings = simulationAssessment(report, targets);
  return section(
    l.simulationAssessment,
    `<ol class="findings">${findings.map((f) => `<li class="finding-${f.status.toLowerCase()}">${esc(assessmentText(f, report, locale, l))}</li>`).join('')}</ol>`,
    'assessment-section',
  );
}

const componentRows = (
  report: SimulationReport,
  locale: DashboardLocale,
  l: Labels,
): string[][] => {
  const c = report.metrics.components;
  const d = deriveAnalytics(report);
  return [
    ['baseRegular', c.baseGameRegularPayout, d.baseRegularRtp],
    ['baseScatter', c.baseGameScatterPayout, d.baseScatterRtp],
    ['baseMultiplier', c.baseGameMultiplierUplift, d.baseMultiplierRtp],
    ['freeRegular', c.freeGameRegularPayout, d.freeRegularRtp],
    ['freeScatter', c.freeGameScatterPayout, d.freeScatterRtp],
    ['freeMultiplier', c.freeGameMultiplierUplift, d.freeMultiplierRtp],
  ].map(([key, credits, rtp]) => [
    esc(label(l, String(key))),
    esc(formatCredits(Number(credits), locale).replace('credits', l.credits)),
    esc(formatAdaptivePercent(Number(rtp), locale)),
  ]);
};

function rtpChart(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const rows = componentRows(report, locale, l);
  const values = [
    deriveAnalytics(report).baseRegularRtp,
    deriveAnalytics(report).baseScatterRtp,
    deriveAnalytics(report).baseMultiplierRtp,
    deriveAnalytics(report).freeRegularRtp,
    deriveAnalytics(report).freeScatterRtp,
    deriveAnalytics(report).freeMultiplierRtp,
  ];
  const max = Math.max(...values, 0.0001);
  return `<figure class="chart-card"><figcaption>${esc(l.rtpContributionChart)}</figcaption><div class="horizontal-bars" role="img" aria-label="${esc(l.rtpContributionChart)}">${values.map((v, i) => `<div class="bar-row"><span>${rows[i]![0]}</span><i><b style="width:${Math.max(0.4, (v / max) * 100)}%"></b></i><strong>${esc(formatAdaptivePercent(v, locale))}</strong></div>`).join('')}</div></figure>`;
}

function rtpComposition(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const d = deriveAnalytics(report);
  const rows = componentRows(report, locale, l);
  rows.push([
    `<strong>${esc(l.baseTotal)}</strong>`,
    esc(
      formatCredits(
        report.metrics.baseGameWinContribution * report.metrics.totalBet,
        locale,
      ).replace('credits', l.credits),
    ),
    `<strong>${esc(formatAdaptivePercent(report.metrics.baseGameWinContribution, locale))}</strong>`,
  ]);
  rows.push([
    `<strong>${esc(l.featureTotal)}</strong>`,
    esc(
      formatCredits(
        report.metrics.freeGameWinContribution * report.metrics.totalBet,
        locale,
      ).replace('credits', l.credits),
    ),
    `<strong>${esc(formatAdaptivePercent(report.metrics.freeGameWinContribution, locale))}</strong>`,
  ]);
  rows.push([
    `<strong>${esc(l.totalRtp)}</strong>`,
    esc(formatCredits(report.metrics.totalCreditedWin, locale).replace('credits', l.credits)),
    `<strong>${esc(formatAdaptivePercent(report.metrics.rtp, locale))}</strong>`,
  ]);
  const sourceMix = `<div class="source-mix">${[
    ['regularSymbols', d.totalRegularRtp],
    ['scatter', d.totalScatterRtp],
    ['multiplierSource', d.totalMultiplierRtp],
  ]
    .map(
      ([key, val]) =>
        `<div><span>${esc(label(l, String(key)))}</span><strong>${formatAdaptivePercent(Number(val), locale)}</strong></div>`,
    )
    .join('')}</div>`;
  return section(
    l.rtpComposition,
    `<div class="split-panel">${rtpChart(report, locale, l)}${comparisonTable([l.metric, l.payoutCredits, l.rtpPoints], rows)}</div><h3 class="subheading">${esc(l.rtpSourceMix)}</h3>${sourceMix}`,
    'rtp-section',
  );
}

function baseFeature(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  const rows = [
    [
      l.rtpContribution,
      formatAdaptivePercent(m.baseGameWinContribution, locale),
      formatAdaptivePercent(m.freeGameWinContribution, locale),
    ],
    [
      l.tumbleTrigger,
      formatAdaptivePercent(m.baseGameTumbleTriggerFrequency, locale),
      formatAdaptivePercent(m.freeGameTumbleTriggerFrequency, locale),
    ],
    [
      l.averageTumbleRounds,
      formatDecimal(m.averageBaseGameTumbleRoundsPerTrigger, locale),
      formatDecimal(m.averageFreeGameTumbleRoundsPerTrigger, locale),
    ],
    [
      l.maximumTumbleDepth,
      formatInteger(m.maximumObservedBaseGameTumbleDepth, locale),
      formatInteger(m.maximumObservedFreeGameTumbleDepth, locale),
    ],
    [
      l.multiplierRtp,
      formatAdaptivePercent(d.baseMultiplierRtp, locale),
      formatAdaptivePercent(d.freeMultiplierRtp, locale),
    ],
    [
      l.scatterRtp,
      formatAdaptivePercent(d.baseScatterRtp, locale),
      formatAdaptivePercent(d.freeScatterRtp, locale),
    ],
  ].map((r) => r.map(esc));
  return section(
    l.baseVsFeature,
    comparisonTable([l.metric, l.baseGame, l.freeGame], rows),
    'base-feature-section',
  );
}

function mechanicOverview(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  const tumble = `<article><h3>${esc(l.tumble)}</h3><dl><div><dt>${esc(l.roundsPerSpin)}</dt><dd>${formatDecimal(m.tumbleRoundsPerPaidSpin, locale)}</dd></div><div><dt>${esc(l.overallTumbleFrequency)}</dt><dd>${formatAdaptivePercent(m.tumbleTriggerFrequency, locale)}</dd></div><div><dt>${esc(l.averageRoundsTriggeringSpin)}</dt><dd>${formatDecimal(m.averageTumbleRoundsPerTriggeringSpin, locale)}</dd></div><div><dt>${esc(l.maxDepth)}</dt><dd>${formatInteger(m.maximumObservedTumbleDepth, locale)}</dd></div></dl></article>`;
  const bathala = `<article><h3>${esc(l.bathala)}</h3><dl><div><dt>${esc(l.bathalaActivations)}</dt><dd>${formatInteger(m.bathalaActivations, locale)}</dd></div><div><dt>${tip(l.bathalaFrequency, l.bathalaFrequencyTip)}</dt><dd>${formatAdaptivePercent(m.bathalaActivationFrequency, locale)}</dd></div><div><dt>${esc(l.bathalaConversion)}</dt><dd class="accent">${formatAdaptivePercent(m.bathalaToNextWinConversionRate, locale)}</dd></div><div><dt>${esc(l.activationsPaidSpin)}</dt><dd>${formatDecimal(d.bathalaActivationsPerPaidSpin, locale, 3)}</dd></div><div><dt>${esc(l.symbolsRemovedPaidSpin)}</dt><dd>${formatDecimal(d.bathalaSymbolsRemovedPerPaidSpin, locale, 3)}</dd></div></dl></article>`;
  const mult = `<article><h3>${esc(l.multiplier)}</h3><dl><div><dt>${esc(l.multiplierFrequency)}</dt><dd>${formatAdaptivePercent(m.multiplierAppearanceFrequency, locale)}</dd></div><div><dt>${esc(l.averageMultiplier)}</dt><dd>${formatMultiplier(m.averageMultiplierValue, locale)}</dd></div><div><dt>${esc(l.effectiveMultiplier)}</dt><dd>${formatMultiplier(m.averageSummedMultiplierOnMultipliedWins, locale)}</dd></div><div><dt>${esc(l.maximumMultiplier)}</dt><dd>${formatMultiplier(m.maximumSummedMultiplier, locale, 0)}</dd></div><div><dt>${esc(l.totalMultiplierRtp)}</dt><dd class="accent">${formatAdaptivePercent(d.totalMultiplierRtp, locale)}</dd></div></dl></article>`;
  const feature = `<article><h3>${esc(l.freeGames)}</h3><dl><div><dt>${esc(l.triggerCount)}</dt><dd>${formatInteger(m.freeGameTriggerCount, locale)}</dd></div><div><dt>${esc(l.featureFrequency)}</dt><dd>${formatAdaptivePercent(m.featureFrequency, locale)} · ${formatOneIn(m.featureFrequency, locale, l.oneIn)}</dd></div><div><dt>${esc(l.averageFreeGames)}</dt><dd>${formatDecimal(m.averageFreeGamesPlayed, locale)}</dd></div><div><dt>${esc(l.freeContribution)}</dt><dd class="accent">${formatAdaptivePercent(m.freeGameWinContribution, locale)}</dd></div></dl></article>`;
  return section(
    l.mechanicHealth,
    `<div class="mechanic-grid">${tumble}${bathala}${mult}${feature}</div>`,
    'mechanic-section',
  );
}

function featureLength(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const p = report.metrics.featureLengthPercentiles;
  const values = [
    ['P50', p.p50],
    ['P75', p.p75],
    ['P90', p.p90],
    ['P95', p.p95],
    ['P99', p.p99],
    [l.maximum, report.metrics.maximumObservedFeatureLength],
  ] as const;
  const max = Math.max(...values.map(([, v]) => v), 1);
  return section(
    l.featureLength,
    `<div class="percentile-chart" role="img" aria-label="${esc(l.featureLength)}">${values.map(([key, v]) => `<div><span>${esc(key)}</span><i><b style="width:${(v / max) * 100}%"></b></i><strong>${formatInteger(v, locale)}</strong></div>`).join('')}</div><div class="compact-grid"><div><span>${esc(l.initialFreeGames)}</span><strong>${formatDecimal(report.metrics.averageInitiallyAwardedFreeGames, locale)}</strong></div><div><span>${esc(l.retriggerCount)}</span><strong>${formatInteger(report.metrics.retriggerCount, locale)}</strong></div><div><span>${esc(l.averageRetriggers)}</span><strong>${formatDecimal(report.metrics.averageRetriggersPerFeature, locale, 3)}</strong></div><div><span>${esc(l.endingMultiplier)}</span><strong>${formatMultiplier(report.metrics.averageEndingFreeGameMultiplier, locale)}</strong></div></div>`,
    'feature-length-section',
  );
}

function tailChart(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const observed = report.metrics.tails.filter((x) => x.frequency > 0);
  const width = 620,
    height = 190,
    left = 45,
    right = 18,
    top = 18,
    bottom = 40;
  if (!observed.length) return `<div class="empty-state">${esc(l.notObserved)}</div>`;
  const logs = observed.map((x) => Math.log10(x.frequency));
  const min = Math.min(...logs),
    max = Math.max(...logs);
  const points = observed.map((tail, i) => {
    const px = left + (i / Math.max(1, observed.length - 1)) * (width - left - right);
    const py =
      top +
      ((max - Math.log10(tail.frequency)) / Math.max(0.0001, max - min)) * (height - top - bottom);
    return { x: px, y: py, t: tail.threshold, f: tail.frequency };
  });
  return `<figure class="chart-card tail-chart"><figcaption>${esc(l.tailDecayChart)}</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(l.tailDecayChart)}"><line class="axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/><polyline class="tail-line" points="${points.map((p) => `${p.x},${p.y}`).join(' ')}"/>${points.map((p) => `<circle class="tail-point" cx="${p.x}" cy="${p.y}" r="4"><title>${formatInteger(p.t, locale)}×+: ${formatAdaptivePercent(p.f, locale)}</title></circle><text class="axis-label" x="${p.x}" y="${height - 16}">${formatInteger(p.t, locale)}×</text>`).join('')}<text class="chart-note" x="${left}" y="12">${esc(l.logFrequency)}</text></svg></figure>`;
}

function tailPerformance(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  const rows = m.tails.map((x) =>
    [
      `${formatInteger(x.threshold, locale)}×+`,
      formatInteger(x.count, locale),
      formatAdaptivePercent(x.frequency, locale),
      x.count === 0 ? l.notObserved : formatOneIn(x.frequency, locale, l.oneIn),
    ].map(esc),
  );
  const summary = [
    ['maximumWin', formatMultiplier(m.maximumObservedWin, locale)],
    [
      'tail100',
      tailAt(report, 100)?.count
        ? formatOneIn(tailAt(report, 100)!.frequency, locale, l.oneIn)
        : l.notObserved,
    ],
    [
      'tail250',
      tailAt(report, 250)?.count
        ? formatOneIn(tailAt(report, 250)!.frequency, locale, l.oneIn)
        : l.notObserved,
    ],
    [
      'tail500',
      tailAt(report, 500)?.count
        ? formatOneIn(tailAt(report, 500)!.frequency, locale, l.oneIn)
        : l.notObserved,
    ],
    [
      'tail1000',
      tailAt(report, 1000)?.count
        ? formatOneIn(tailAt(report, 1000)!.frequency, locale, l.oneIn)
        : l.notObserved,
    ],
    [
      'highestObserved',
      d.highestObservedTailThreshold === null
        ? l.notObserved
        : `${formatInteger(d.highestObservedTailThreshold, locale)}×+ (${formatInteger(d.highestObservedTailCount, locale)})`,
    ],
  ];
  return section(
    l.tails,
    `<div class="tail-summary">${summary.map(([key, val]) => `<div><span>${esc(label(l, key!))}</span><strong>${esc(val)}</strong></div>`).join('')}</div><div class="split-panel">${tailChart(report, locale, l)}${comparisonTable([l.threshold, l.count, l.frequency, l.odds], rows)}</div>`,
    'tail-section',
  );
}

function targets(
  report: SimulationReport,
  locale: DashboardLocale,
  l: Labels,
  configured: ManagementTargets,
  compactWhenUnconfigured = false,
): string {
  if (compactWhenUnconfigured && Object.keys(configured).length === 0)
    return section(
      l.targets,
      `<div class="management-target-summary"><strong>${esc(statusLabel('UNCALIBRATED', l))}</strong><p>${esc(l.uncalibratedNote)}</p></div>`,
      'targets-section targets-collapsed',
    );
  const rows = evaluateTargets(report, configured).map((item) => {
    const d = metricDefinition(item.key);
    return [
      tip(label(l, d.labelKey), d.descriptionKey ? label(l, d.descriptionKey) : undefined),
      metricValue(report, item.key, locale, l),
      targetText(item.target, locale, l, d.unit),
      deltaText(item, locale, l),
      badge(item.status, l),
    ];
  });
  return section(
    l.targets,
    comparisonTable([l.metric, l.result, l.target, l.delta, l.status], rows),
    'targets-section',
  );
}

function diagnostics(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  const volatility = `<article><h3>${esc(l.volatilityProfile)}</h3><dl>${[
    ['mean', formatDecimal(m.meanWinPerPaidSpin, locale, 6)],
    ['variance', formatDecimal(m.variance, locale, 6)],
    ['sd', formatDecimal(m.standardDeviation, locale, 6)],
    ['cv', formatDecimal(m.coefficientOfVariation, locale, 4)],
    ['maximumWin', formatMultiplier(m.maximumObservedWin, locale)],
  ]
    .map(([key, val]) => `<div><dt>${esc(label(l, key!))}</dt><dd>${val}</dd></div>`)
    .join('')}</dl></article>`;
  const confidence = `<article><h3>${esc(l.simulationConfidence)}</h3><dl>${[
    ['spins', formatInteger(report.simulation.spins, locale)],
    ['seed', formatInteger(report.simulation.seed, locale)],
    ['mean', formatDecimal(m.meanWinPerPaidSpin, locale, 6)],
    ['se', formatDecimal(m.standardError, locale, 6)],
    ['ci', formatPercentRange(m.confidenceInterval95[0], m.confidenceInterval95[1], locale)],
    ['ciWidth', formatPercent(d.ciWidth, locale)],
    ['ciMargin', `± ${formatPercent(d.ciMargin, locale)}`],
  ]
    .map(
      ([key, val]) =>
        `<div><dt>${tip(label(l, key!), key === 'se' ? l.tipSe : key === 'ci' ? l.tipCi : undefined)}</dt><dd>${val}</dd></div>`,
    )
    .join('')}</dl><p class="microcopy">${esc(l.confidenceNote)}</p></article>`;
  const scatter = `<article><h3>${esc(l.scatter)}</h3><dl>${[
    [
      'baseScatter',
      `${formatCredits(m.components.baseGameScatterPayout, locale).replace('credits', l.credits)} · ${formatAdaptivePercent(d.baseScatterRtp, locale)}`,
    ],
    [
      'freeScatter',
      `${formatCredits(m.components.freeGameScatterPayout, locale).replace('credits', l.credits)} · ${formatAdaptivePercent(d.freeScatterRtp, locale)}`,
    ],
    [
      'featureFrequency',
      `${formatAdaptivePercent(m.featureFrequency, locale)} · ${formatOneIn(m.featureFrequency, locale, l.oneIn)}`,
    ],
    ['retriggerCount', formatInteger(m.retriggerCount, locale)],
  ]
    .map(([key, val]) => `<div><dt>${esc(label(l, key!))}</dt><dd>${val}</dd></div>`)
    .join('')}</dl></article>`;
  return section(
    l.diagnostics,
    `<div class="diagnostic-grid">${volatility}${confidence}${scatter}</div>`,
    'diagnostics-section',
  );
}

function validation(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const rec = reconcileReport(report);
  const checks = `<article><h3>${esc(l.reconciliation)}</h3><ul class="validation-list">${rec.map((x) => `<li><span>${esc(label(l, x.key))}</span>${badge(x.status, l)}</li>`).join('')}</ul></article>`;
  const metadata = `<article><h3>${esc(l.metadata)}</h3><dl>${[
    ['schema', report.metadata.schemaVersion],
    ['gameVersion', report.metadata.gameVersion],
    ['configuration', report.metadata.configurationId],
    ['calibration', report.metadata.calibrationProfile ?? l.na],
    ['methodology', report.simulation.methodology],
    ['generated', formatDate(report.metadata.generatedAt, locale)],
  ]
    .map(([key, val]) => `<div><dt>${esc(label(l, key!))}</dt><dd>${esc(val)}</dd></div>`)
    .join('')}</dl></article>`;
  const issues = dataQualityIssues(report);
  const quality = issues.length
    ? `<article class="quality-warnings"><h3>${esc(l.dataQuality)}</h3><ul>${issues.map((x) => `<li>${badge(x.severity, l)} ${esc(label(l, x.key))}</li>`).join('')}</ul></article>`
    : `<article><h3>${esc(l.dataQuality)}</h3><p>${badge('PASS', l)} ${esc(l.noDataQualityIssues)}</p></article>`;
  return section(
    l.validationAndMetadata,
    `<div class="validation-grid">${checks}${quality}${metadata}</div>`,
    'validation-section',
  );
}

export interface RenderDashboardOptions {
  readonly locale: DashboardLocale;
  readonly labels: Labels;
  readonly targets?: ManagementTargets;
}

export function renderDashboard(report: SimulationReport, options: RenderDashboardOptions): string {
  const { locale, labels: l } = options;
  const configured = options.targets ?? MANAGEMENT_TARGETS;
  const evaluation = new Map(evaluateTargets(report, configured).map((x) => [x.key, x]));
  const executiveIds: MetricId[] = [
    'rtp',
    'winningSpinFrequency',
    'featureFrequency',
    'maximumObservedWin',
    'baseGameWinContribution',
    'freeGameWinContribution',
  ];
  const identity = `<section class="identity-card"><div><p class="eyebrow">${esc(l.activeReport)}</p><h2>${esc(report.metadata.gameName)} — ${esc(report.metadata.configurationId)}</h2><p>${esc(l.gameVersion)}: ${esc(report.metadata.gameVersion)} · ${esc(l.calibration)}: ${esc(report.metadata.calibrationProfile ?? l.na)}</p></div><time>${esc(formatDate(report.metadata.generatedAt, locale))}</time></section>`;
  const executive = section(
    l.overview,
    `<div class="executive-strip">${executiveIds.map((id) => kpi(report, id, locale, l, evaluation.get(id), id === 'featureFrequency' ? formatAdaptivePercent(report.metrics.featureFrequency, locale) : '')).join('')}</div><h3 class="subheading">${esc(l.profileDiagnosis)}</h3>${comparisonTable(
      [l.dimension, l.result, l.target, l.status],
      executiveIds
        .concat(['bathalaToNextWinConversionRate', 'multiplierRtpContribution'])
        .map((id) => {
          const x = evaluation.get(id)!;
          const d = metricDefinition(id);
          return [
            tip(label(l, d.labelKey), d.descriptionKey ? label(l, d.descriptionKey) : undefined),
            metricValue(report, id, locale, l),
            targetText(x.target, locale, l, d.unit),
            badge(x.status, l),
          ];
        }),
    )}`,
    'executive-section',
  );
  return `<main id="dashboard-content">${identity}<div class="report-page report-page-one">${health(report, locale, l, configured)}${executive}${assessment(report, locale, l, configured)}${rtpComposition(report, locale, l)}${baseFeature(report, locale, l)}${mechanicOverview(report, locale, l)}</div><div class="report-page report-page-two">${targets(report, locale, l, configured)}${tailPerformance(report, locale, l)}${featureLength(report, locale, l)}${diagnostics(report, locale, l)}${validation(report, locale, l)}</div><footer>${esc(l.footer)}</footer></main>`;
}

function exportPageFooter(l: Labels, page: number, total: number): string {
  return `<footer class="export-page-footer"><span>${esc(l.footer)}</span><span>${esc(l.page)} ${page} / ${total}</span></footer>`;
}

export function renderDetailedExportDocument(
  report: SimulationReport,
  options: RenderDashboardOptions,
): string {
  const { locale, labels: l } = options;
  const configured = options.targets ?? MANAGEMENT_TARGETS;
  const evaluation = new Map(evaluateTargets(report, configured).map((x) => [x.key, x]));
  const executiveIds: MetricId[] = [
    'rtp',
    'winningSpinFrequency',
    'featureFrequency',
    'maximumObservedWin',
    'baseGameWinContribution',
    'freeGameWinContribution',
  ];
  const executive = section(
    l.overview,
    `<div class="executive-strip">${executiveIds.map((id) => kpi(report, id, locale, l, evaluation.get(id))).join('')}</div>`,
    'executive-section',
  );
  const identity = `<section class="identity-card"><div><p class="eyebrow">${esc(l.activeReport)}</p><h2>${esc(report.metadata.gameName)} \u2014 ${esc(report.metadata.configurationId)}</h2><p>${esc(l.gameVersion)}: ${esc(report.metadata.gameVersion)}</p></div><time>${esc(formatDate(report.metadata.generatedAt, locale))}</time></section>`;
  const header = `<header class="export-report-header"><p class="eyebrow">Lucky888</p><h1>${esc(l.title)}</h1><strong>${esc(l.detailedReport)}</strong></header>`;
  return `<main class="export-report detailed-export-document"><section class="export-page detailed-export-executive">${header}${identity}${health(report, locale, l, configured)}${executive}${assessment(report, locale, l, configured)}${baseFeature(report, locale, l)}${exportPageFooter(l, 1, 3)}</section><section class="export-page detailed-export-mechanics"><header class="export-section-header"><span>Lucky888</span><h2>${esc(l.mechanicHealth)}</h2></header>${rtpComposition(report, locale, l)}${mechanicOverview(report, locale, l)}${featureLength(report, locale, l)}${exportPageFooter(l, 2, 3)}</section><section class="export-page detailed-export-diagnostics"><header class="export-section-header"><span>Lucky888</span><h2>${esc(l.diagnostics)}</h2></header>${tailPerformance(report, locale, l)}${diagnostics(report, locale, l)}${targets(report, locale, l, configured, true)}${validation(report, locale, l)}${exportPageFooter(l, 3, 3)}</section></main>`;
}
