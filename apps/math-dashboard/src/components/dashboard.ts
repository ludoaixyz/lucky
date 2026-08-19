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
import type {
  DashboardAnalysisReport,
  ProfileStatus,
  SimulationReport,
  Status,
  WorkbenchSessionReport,
} from '../types/simulation-report.js';
import { evaluateTargets, reconcileReport, type TargetEvaluation } from '../reports/analysis.js';
import { deriveAnalytics, tailAt } from '../reports/derived.js';
import { metricDefinition, type MetricId, type MetricUnit } from '../reports/metric-registry.js';

type Labels = DashboardLabels;
const label = (labels: Labels, key: string): string =>
  (labels as Readonly<Record<string, string>>)[key] ?? key;
const esc = (value: unknown): string =>
  String(value).replace(
    /[&<>'"]/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c,
  );

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
  report: DashboardAnalysisReport,
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
  report: DashboardAnalysisReport,
  id: MetricId,
  locale: DashboardLocale,
  l: Labels,
  evaluation?: TargetEvaluation,
  extra = '',
): string {
  const d = metricDefinition(id);
  const target = evaluation?.target ?? null;
  return `<article class="kpi-card"><h3>${esc(label(l, d.labelKey))}</h3><strong>${metricValue(report, id, locale, l)}</strong>${extra ? `<p>${extra}</p>` : ''}${evaluation?.target ? `<div class="kpi-target"><span>${esc(l.target)}: ${targetText(target, locale, l, d.unit)}</span>${badge(evaluation.status, l)}</div>` : ''}</article>`;
}

function section(title: string, content: string, classes = ''): string {
  return `<section class="report-section ${classes}"><div class="section-heading"><h2>${esc(title)}</h2></div>${content}</section>`;
}

function comparisonTable(headers: string[], rows: string[][], classes = ''): string {
  return `<div class="table-scroll ${classes}"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, i) => `<${i === 0 ? 'th' : 'td'}>${cell}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
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
    esc(`${formatInteger(Math.round(Number(credits)), locale)} ${l.credits}`),
    esc(formatAdaptivePercent(Number(rtp), locale)),
  ]);
};

function rtpChart(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const values = [
    deriveAnalytics(report).baseRegularRtp,
    deriveAnalytics(report).baseScatterRtp,
    deriveAnalytics(report).baseMultiplierRtp,
    deriveAnalytics(report).freeRegularRtp,
    deriveAnalytics(report).freeScatterRtp,
    deriveAnalytics(report).freeMultiplierRtp,
  ];
  const names = [
    l.baseRegular,
    l.baseScatter,
    l.baseMultiplier,
    l.freeRegular,
    l.freeScatter,
    l.freeMultiplier,
  ];
  const colors = ['#d9b45a', '#52b9b0', '#9883d1', '#d07b55', '#69a4d4', '#b7cf73'];
  const total = values.reduce((sum, item) => sum + Math.max(0, item), 0) || 1;
  const cx = 310,
    cy = 128,
    radius = 78;
  let angle = -Math.PI / 2;
  const slices = values.map((value, index) => {
    const sweep = (Math.max(0, value) / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    const end = angle;
    const x1 = cx + radius * Math.cos(start),
      y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end),
      y2 = cy + radius * Math.sin(end);
    const path = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
    const mid = start + sweep / 2;
    return { index, value, path, mid, side: Math.cos(mid) >= 0 ? 'right' : 'left' };
  });
  const labels = ['left', 'right']
    .flatMap((side) => {
      const sideSlices = slices
        .filter((slice) => slice.side === side)
        .sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid));
      return sideSlices.map((slice, lane) => {
        const y = 45 + lane * (166 / Math.max(1, sideSlices.length - 1));
        const edgeX = cx + radius * Math.cos(slice.mid),
          edgeY = cy + radius * Math.sin(slice.mid);
        const elbowX = side === 'right' ? 405 : 215;
        const textX = side === 'right' ? 416 : 204;
        const anchor = side === 'right' ? 'start' : 'end';
        return `<polyline class="pie-leader" points="${edgeX.toFixed(1)},${edgeY.toFixed(1)} ${elbowX},${y} ${side === 'right' ? 411 : 209},${y}"/><circle class="pie-label-dot" cx="${edgeX.toFixed(1)}" cy="${edgeY.toFixed(1)}" r="2" fill="${colors[slice.index]}"/><text class="pie-label" x="${textX}" y="${y + 3}" text-anchor="${anchor}">${esc(names[slice.index]!)} — ${esc(formatAdaptivePercent(slice.value, locale))}</text>`;
      });
    })
    .join('');
  return `<figure class="chart-card pie-chart"><figcaption>${esc(l.rtpContributionChart)}</figcaption><svg viewBox="0 0 620 250" role="img" aria-label="${esc(l.rtpContributionChart)}">${slices.map((slice) => `<path class="pie-slice" d="${slice.path}" fill="${colors[slice.index]}"><title>${esc(names[slice.index]!)} — ${esc(formatAdaptivePercent(slice.value, locale))}</title></path>`).join('')}${labels}</svg></figure>`;
}

function rtpComposition(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const d = deriveAnalytics(report);
  const rows = componentRows(report, locale, l);
  rows.push([
    `<strong>${esc(l.baseTotal)}</strong>`,
    esc(
      `${formatInteger(Math.round(report.metrics.baseGameWinContribution * report.metrics.totalBet), locale)} ${l.credits}`,
    ),
    `<strong>${esc(formatAdaptivePercent(report.metrics.baseGameWinContribution, locale))}</strong>`,
  ]);
  rows.push([
    `<strong>${esc(l.featureTotal)}</strong>`,
    esc(
      `${formatInteger(Math.round(report.metrics.freeGameWinContribution * report.metrics.totalBet), locale)} ${l.credits}`,
    ),
    `<strong>${esc(formatAdaptivePercent(report.metrics.freeGameWinContribution, locale))}</strong>`,
  ]);
  rows.push([
    `<strong>${esc(l.totalRtp)}</strong>`,
    esc(`${formatInteger(Math.round(report.metrics.totalCreditedWin), locale)} ${l.credits}`),
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
    `<div class="split-panel">${rtpChart(report, locale, l)}${comparisonTable([l.winningMechanic, l.payoutCredits, l.rtpPoints], rows)}</div><h3 class="subheading">${esc(l.rtpSourceMix)}</h3>${sourceMix}`,
    'rtp-section',
  );
}

function baseFeatureTable(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
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
  return comparisonTable([l.metric, l.baseGame, l.freeGame], rows);
}

function executiveSubsection(title: string, content: string, classes = ''): string {
  return `<section class="executive-subsection ${classes}"><h3>${esc(title)}</h3>${content}</section>`;
}

function executiveSummary(
  report: SimulationReport,
  locale: DashboardLocale,
  l: Labels,
  configured: ManagementTargets,
): string {
  const healthIds: MetricId[] = [
    'rtp',
    'featureFrequency',
    'winningSpinFrequency',
    'maximumObservedWin',
    'coefficientOfVariation',
    'freeGameWinContribution',
  ];
  const profileIds: MetricId[] = [
    'rtp',
    'winningSpinFrequency',
    'featureFrequency',
    'maximumObservedWin',
    'baseGameWinContribution',
    'freeGameWinContribution',
    'multiplierRtpContribution',
  ];
  const evaluations = new Map(evaluateTargets(report, configured).map((item) => [item.key, item]));
  const profile = comparisonTable(
    [l.coreMetric, l.result],
    profileIds.map((id) => {
      const definition = metricDefinition(id);
      return [esc(label(l, definition.labelKey)), metricValue(report, id, locale, l)];
    }),
  );
  const analysis = `<div class="executive-analysis-grid">${executiveSubsection(l.profileDiagnosis, profile, 'simulation-profile-subsection')}${executiveSubsection(l.baseVsFeature, baseFeatureTable(report, locale, l), 'base-feature-subsection')}</div>`;
  return section(
    l.overview,
    `<div class="executive-strip">${healthIds.map((id) => kpi(report, id, locale, l, evaluations.get(id))).join('')}</div>${analysis}`,
    'executive-section',
  );
}

function mechanicOverview(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  const tumble = `<article><h3>${esc(l.tumble)}</h3><dl><div><dt>${esc(l.roundsPerSpin)}</dt><dd>${formatDecimal(m.tumbleRoundsPerPaidSpin, locale)}</dd></div><div><dt>${esc(l.overallTumbleFrequency)}</dt><dd>${formatAdaptivePercent(m.tumbleTriggerFrequency, locale)}</dd></div><div><dt>${esc(l.averageRoundsTriggeringSpin)}</dt><dd>${formatDecimal(m.averageTumbleRoundsPerTriggeringSpin, locale)}</dd></div><div><dt>${esc(l.maxDepth)}</dt><dd>${formatInteger(m.maximumObservedTumbleDepth, locale)}</dd></div></dl></article>`;
  const bathala = `<article><h3>${esc(l.bathala)}</h3><dl><div><dt>${esc(l.bathalaActivations)}</dt><dd>${formatInteger(m.bathalaActivations, locale)}</dd></div><div><dt>${esc(l.bathalaConversion)}</dt><dd class="accent">${formatAdaptivePercent(m.bathalaToNextWinConversionRate, locale)}</dd></div><div><dt>${esc(l.activationsPaidSpin)}</dt><dd>${formatDecimal(d.bathalaActivationsPerPaidSpin, locale, 3)}</dd></div><div><dt>${esc(l.symbolsRemovedPaidSpin)}</dt><dd>${formatDecimal(d.bathalaSymbolsRemovedPerPaidSpin, locale, 3)}</dd></div></dl></article>`;
  const mult = `<article><h3>${esc(l.multiplier)}</h3><dl><div><dt>${esc(l.multiplierFrequency)}</dt><dd>${formatAdaptivePercent(m.multiplierAppearanceFrequency, locale)}</dd></div><div><dt>${esc(l.averageMultiplier)}</dt><dd>${formatMultiplier(m.averageMultiplierValue, locale)}</dd></div><div><dt>${esc(l.effectiveMultiplier)}</dt><dd>${formatMultiplier(m.averageSummedMultiplierOnMultipliedWins, locale)}</dd></div><div><dt>${esc(l.maximumMultiplier)}</dt><dd>${formatMultiplier(m.maximumSummedMultiplier, locale, 0)}</dd></div><div><dt>${esc(l.totalMultiplierRtp)}</dt><dd class="accent">${formatAdaptivePercent(d.totalMultiplierRtp, locale)}</dd></div></dl></article>`;
  const feature = `<article><h3>${esc(l.freeGames)}</h3><dl><div><dt>${esc(l.triggerCount)}</dt><dd>${formatInteger(m.freeGameTriggerCount, locale)}</dd></div><div><dt>${esc(l.featureFrequency)}</dt><dd>${formatAdaptivePercent(m.featureFrequency, locale)} · ${formatOneIn(m.featureFrequency, locale, l.oneIn)}</dd></div><div><dt>${esc(l.averageFreeGames)}</dt><dd>${formatDecimal(m.averageFreeGamesPlayed, locale)}</dd></div><div><dt>${esc(l.freeContribution)}</dt><dd class="accent">${formatAdaptivePercent(m.freeGameWinContribution, locale)}</dd></div></dl></article>`;
  return section(
    l.mechanicHealth,
    `<div class="mechanic-grid">${tumble}${bathala}${mult}${feature}</div><div class="mechanic-detail-grid">${volatilityPanel(report, locale, l)}${scatterPanel(report, locale, l)}</div>`,
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
    height = 320,
    left = 50,
    right = 18,
    top = 18,
    bottom = 40;
  if (!observed.length) return `<div class="empty-state">${esc(l.notObserved)}</div>`;
  const logs = observed.map((x) => Math.log10(x.frequency));
  const min = Math.min(...logs),
    max = Math.max(...logs);
  const tickMin = Math.floor(min);
  const tickMax = Math.ceil(max);
  const ticks = Array.from({ length: tickMax - tickMin + 1 }, (_, index) => tickMin + index);
  const points = observed.map((tail, i) => {
    const px = left + (i / Math.max(1, observed.length - 1)) * (width - left - right);
    const py =
      top +
      ((max - Math.log10(tail.frequency)) / Math.max(0.0001, max - min)) * (height - top - bottom);
    return { x: px, y: py, t: tail.threshold, f: tail.frequency };
  });
  const yTicks = ticks
    .map((tick) => {
      const y = top + ((max - tick) / Math.max(0.0001, max - min)) * (height - top - bottom);
      if (y < top - 1 || y > height - bottom + 1) return '';
		return `
		  <line
			class="grid-line"
			x1="${left}"
			y1="${y}"
			x2="${width - right}"
			y2="${y}"
		  />
		  <line
			class="axis-tick"
			x1="${left - 4}"
			y1="${y}"
			x2="${left}"
			y2="${y}"
		  />
		  <text
			class="y-axis-label"
			x="${left - 8}"
			y="${y + 3}"
		  >${esc(formatOneIn(10 ** tick, locale, l.oneIn))}</text>
		`;
    })
    .join('');
  return `<figure class="chart-card tail-chart"><figcaption>${esc(l.tailDecayChart)}</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(l.tailDecayChart)}"><line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>${yTicks}<polyline class="tail-line" points="${points.map((p) => `${p.x},${p.y}`).join(' ')}"/>${points.map((p) => `<circle class="tail-point" cx="${p.x}" cy="${p.y}" r="4"><title>${formatInteger(p.t, locale)}×+: ${formatAdaptivePercent(p.f, locale)}</title></circle><text class="axis-label" x="${p.x}" y="${height - 16}">${formatInteger(p.t, locale)}×</text>`).join('')}<text class="chart-note" x="${left}" y="12">${esc(l.observedFrequency)}</text></svg></figure>`;
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
): string {
  if (Object.keys(configured).length === 0) return '';
  const rows = evaluateTargets(report, configured).map((item) => {
    const d = metricDefinition(item.key);
    return [
      esc(label(l, d.labelKey)),
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

function volatilityPanel(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const m = report.metrics;
  return `<article><h3>${esc(l.volatilityProfile)}</h3><dl>${[
    ['mean', formatDecimal(m.meanWinPerPaidSpin, locale, 6)],
    ['variance', formatDecimal(m.variance, locale, 6)],
    ['sd', formatDecimal(m.standardDeviation, locale, 6)],
    ['cv', formatDecimal(m.coefficientOfVariation, locale, 4)],
    ['maximumWin', formatMultiplier(m.maximumObservedWin, locale)],
  ]
    .map(([key, val]) => `<div><dt>${esc(label(l, key!))}</dt><dd>${val}</dd></div>`)
    .join('')}</dl></article>`;
}

function confidencePanel(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  return `<article><h3>${esc(l.simulationConfidence)}</h3><dl>${[
    ['spins', formatInteger(report.simulation.spins, locale)],
    ['seed', formatInteger(report.simulation.seed, locale)],
    ['mean', formatDecimal(m.meanWinPerPaidSpin, locale, 6)],
    ['se', formatDecimal(m.standardError, locale, 6)],
    ['ci', formatPercentRange(m.confidenceInterval95[0], m.confidenceInterval95[1], locale)],
    ['ciWidth', formatPercent(d.ciWidth, locale)],
    ['ciMargin', `± ${formatPercent(d.ciMargin, locale)}`],
  ]
    .map(([key, val]) => `<div><dt>${esc(label(l, key!))}</dt><dd>${val}</dd></div>`)
    .join('')}</dl></article>`;
}

function scatterPanel(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  return `<article><h3>${esc(l.scatter)}</h3><dl>${[
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
}

function validation(report: SimulationReport, locale: DashboardLocale, l: Labels): string {
  const rec = reconcileReport(report);
  const checks = `<article><h3>${esc(l.reconciliation)}</h3><ul class="validation-list">${rec.map((x) => `<li><span>${esc(label(l, x.key))}</span>${badge(x.status, l)}</li>`).join('')}</ul></article>`;
  const metadata = `<article><h3>${esc(l.metadata)}</h3><dl>${[
    ['schema', report.metadata.schemaVersion],
    ['gameVersion', report.metadata.gameVersion],
    ['configuration', report.metadata.configurationId],
    ['generated', formatDate(report.metadata.generatedAt, locale)],
  ]
    .map(([key, val]) => `<div><dt>${esc(label(l, key!))}</dt><dd>${esc(val)}</dd></div>`)
    .join('')}</dl></article>`;
  return section(
    l.validationAndMetadata,
    `<div class="validation-grid">${checks}${metadata}${confidencePanel(report, locale, l)}</div>`,
    'validation-section',
  );
}

export interface RenderDashboardOptions {
  readonly locale: DashboardLocale;
  readonly labels: Labels;
  readonly targets?: ManagementTargets;
}

function nullableNumber(
  amount: number | null,
  formatter: (value: number) => string,
  l: Labels,
): string {
  return amount === null ? esc(l.na) : esc(formatter(amount));
}

function renderWorkbenchDashboard(
  report: WorkbenchSessionReport,
  options: RenderDashboardOptions,
): string {
  const { locale, labels: l } = options;
  const m = report.metrics;
  const totalBet = m.totalBet ?? 0;
  const coverageValues = Object.values(report.metricAvailability);
  const covered = coverageValues.filter((availability) => availability !== 'unavailable').length;
  const identity = `<section class="identity-card analysis-source-card"><div><p class="eyebrow">${esc(label(l, 'workbenchSession'))}</p><h2>${esc(report.metadata.gameName)} — ${esc(report.metadata.configurationId)}</h2><p>${esc(label(l, 'source'))}: ${esc(label(l, 'workbenchCsv'))} · ${formatInteger(report.simulation.spins, locale)} ${esc(label(l, 'sessionSpins').toLowerCase())} · ${esc(label(l, 'partialData'))}</p></div><div class="analysis-coverage"><strong>${covered} / ${coverageValues.length}</strong><span>${esc(label(l, 'metricsAvailable'))}</span></div></section>`;
  const visibleWarnings = report.analysisWarnings.filter(
    (warning) => warning !== 'limitedSampleWarning',
  );
  const warnings = visibleWarnings.length
    ? `<div class="analysis-warning">${visibleWarnings.map((warning) => `<p>${esc(label(l, warning))}</p>`).join('')}</div>`
    : '';
  const coreIds: MetricId[] = [
    'rtp',
    'winningSpinFrequency',
    'averageWinPerWinningSpin',
    'maximumObservedWin',
    'coefficientOfVariation',
    'featureFrequency',
  ];
  const sessionLabels = { ...l, creditedRtp: l.sessionRtp };
  const core = section(
    label(l, 'sessionOverview'),
    `<div class="executive-strip">${coreIds.map((id) => kpi(report, id, locale, sessionLabels)).join('')}</div>`,
    'executive-section',
  );
  const rows = (
    items: readonly [string, number | null, 'integer' | 'decimal' | 'percent' | 'multiplier'][],
  ): string =>
    comparisonTable(
      [l.metric, l.result],
      items.map(([key, amount, format]) => [
        esc(label(l, key)),
        nullableNumber(
          amount,
          (value) =>
            format === 'integer'
              ? formatInteger(value, locale)
              : format === 'percent'
                ? formatAdaptivePercent(value, locale)
                : format === 'multiplier'
                  ? formatMultiplier(value, locale)
                  : formatDecimal(value, locale, 4),
          l,
        ),
      ]),
    );
  const mechanics = section(
    l.mechanicHealth,
    rows([
      ['roundsPerSpin', m.tumbleRoundsPerPaidSpin, 'decimal'],
      ['overallTumbleFrequency', m.tumbleTriggerFrequency, 'percent'],
      ['averageRoundsTriggeringSpin', m.averageTumbleRoundsPerTriggeringSpin, 'decimal'],
      ['maxDepth', m.maximumObservedTumbleDepth, 'integer'],
      ['bathalaActivations', m.bathalaActivations, 'integer'],
      ['averageRemoved', m.averageSymbolsRemoved, 'decimal'],
      ['bathalaConversion', m.bathalaToNextWinConversionRate, 'percent'],
      ['multiplierFrequency', m.multiplierAppearanceFrequency, 'percent'],
      ['averageMultiplier', m.averageMultiplierValue, 'multiplier'],
      ['effectiveMultiplier', m.averageSummedMultiplierOnMultipliedWins, 'multiplier'],
      ['maximumMultiplier', m.maximumSummedMultiplier, 'multiplier'],
    ]),
  );
  const feature = section(
    l.freeGames,
    rows([
      ['triggerCount', m.freeGameTriggerCount, 'integer'],
      ['featureFrequency', m.featureFrequency, 'percent'],
      ['averageFreeGames', m.averageFreeGamesPlayed, 'decimal'],
      ['initialFreeGames', m.averageInitiallyAwardedFreeGames, 'decimal'],
      ['maximumObservedFeatureLength', m.maximumObservedFeatureLength, 'integer'],
      ['retriggerCount', m.retriggerCount, 'integer'],
      ['averageRetriggers', m.averageRetriggersPerFeature, 'decimal'],
      ['endingMultiplier', m.averageEndingFreeGameMultiplier, 'multiplier'],
    ]),
  );
  const componentItems: readonly [string, number | null][] = report.capabilities
    .rtpCompositionDetailed
    ? [
        ['baseRegular', m.components.baseGameRegularPayout],
        ['baseScatter', m.components.baseGameScatterPayout],
        ['baseMultiplier', m.components.baseGameMultiplierUplift],
        ['freeRegular', m.components.freeGameRegularPayout],
        ['freeScatter', m.components.freeGameScatterPayout],
        ['freeMultiplier', m.components.freeGameMultiplierUplift],
      ]
    : [
        [
          'baseGame',
          m.baseGameWinContribution === null ? null : m.baseGameWinContribution * totalBet,
        ],
        [
          'freeGame',
          m.freeGameWinContribution === null ? null : m.freeGameWinContribution * totalBet,
        ],
      ];
  const composition = section(
    l.rtpComposition,
    comparisonTable(
      [l.dimension, l.payoutCredits, l.rtpContribution],
      componentItems.map(([key, credits]) => [
        esc(label(l, key)),
        nullableNumber(
          credits,
          (value) => formatCredits(value, locale).replace('credits', l.credits),
          l,
        ),
        nullableNumber(
          credits === null || totalBet <= 0 ? null : credits,
          (value) => formatAdaptivePercent(value / totalBet, locale),
          l,
        ),
      ]),
    ),
  );
  const volatility = section(
    l.volatilityProfile,
    rows([
      ['mean', m.meanWinPerPaidSpin, 'multiplier'],
      ['variance', m.variance, 'decimal'],
      ['sessionVolatility', m.standardDeviation, 'multiplier'],
      ['cv', m.coefficientOfVariation, 'decimal'],
      ['se', m.standardError, 'decimal'],
    ]),
  );
  const tails = section(
    l.tails,
    comparisonTable(
      [l.threshold, l.count, l.frequency],
      m.tails.map((tail) => [
        formatMultiplier(tail.threshold, locale, 0),
        formatInteger(tail.count, locale),
        formatAdaptivePercent(tail.frequency, locale),
      ]),
    ),
  );
  return `<main id="dashboard-content" class="workbench-analysis">${identity}${warnings}<div class="report-page report-page-one">${core}${composition}${mechanics}${feature}</div><div class="report-page report-page-two">${volatility}${tails}</div></main>`;
}

export function renderDashboard(
  report: DashboardAnalysisReport,
  options: RenderDashboardOptions,
): string {
  if (report.sourceType === 'workbench-session') return renderWorkbenchDashboard(report, options);
  const { locale, labels: l } = options;
  const configured = options.targets ?? MANAGEMENT_TARGETS;
  const identity = `<section class="identity-card"><div><p class="eyebrow">${esc(l.activeReport)}</p><h2>${esc(report.metadata.gameName)} — ${esc(report.metadata.configurationId)}</h2><p>${esc(l.gameVersion)}: ${esc(report.metadata.gameVersion)} · ${esc(l.calibration)}: ${esc(report.metadata.calibrationProfile ?? l.na)}</p></div><time>${esc(formatDate(report.metadata.generatedAt, locale))}</time></section>`;
  return `<main id="dashboard-content">${identity}<div class="report-page report-page-one">${executiveSummary(report, locale, l, configured)}${rtpComposition(report, locale, l)}${mechanicOverview(report, locale, l)}${featureLength(report, locale, l)}</div><div class="report-page report-page-two">${targets(report, locale, l, configured)}${tailPerformance(report, locale, l)}${validation(report, locale, l)}</div></main>`;
}

function exportPageFooter(l: Labels, page: number, total: number): string {
  return `<footer class="export-page-footer"><span>${esc(l.page)} ${page} / ${total}</span></footer>`;
}

export function renderDetailedExportDocument(
  report: DashboardAnalysisReport,
  options: RenderDashboardOptions,
): string {
  if (report.sourceType === 'workbench-session') return renderWorkbenchDashboard(report, options);
  const { locale, labels: l } = options;
  const configured = options.targets ?? MANAGEMENT_TARGETS;
  const identity = `<section class="identity-card"><div><p class="eyebrow">${esc(l.activeReport)}</p><h2>${esc(report.metadata.gameName)} \u2014 ${esc(report.metadata.configurationId)}</h2><p>${esc(l.gameVersion)}: ${esc(report.metadata.gameVersion)}</p></div><time>${esc(formatDate(report.metadata.generatedAt, locale))}</time></section>`;
  const header = `<header class="export-report-header"><p class="eyebrow">Lucky888</p><h1>${esc(l.title)}</h1><strong>${esc(l.detailedReport)}</strong></header>`;
  return `<main class="export-report detailed-export-document"><section class="export-page detailed-export-executive">${header}${identity}${executiveSummary(report, locale, l, configured)}${exportPageFooter(l, 1, 3)}</section><section class="export-page detailed-export-mechanics"><header class="export-section-header"><span>Lucky888</span><h2>${esc(l.mechanicHealth)}</h2></header>${rtpComposition(report, locale, l)}${mechanicOverview(report, locale, l)}${featureLength(report, locale, l)}${exportPageFooter(l, 2, 3)}</section><section class="export-page detailed-export-diagnostics"><header class="export-section-header"><span>Lucky888</span><h2>${esc(l.tails)}</h2></header>${tailPerformance(report, locale, l)}${targets(report, locale, l, configured)}${validation(report, locale, l)}${exportPageFooter(l, 3, 3)}</section></main>`;
}
