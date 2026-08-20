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
  formatNullableMetric,
  formatOneIn,
  formatPercent,
  formatPercentRange,
} from '../i18n/format.js';
import type { DashboardAnalysisReport, ProfileStatus, Status } from '../types/simulation-report.js';
import { evaluateTargets, reconcileReport, type TargetEvaluation } from '../reports/analysis.js';
import { deriveAnalytics } from '../reports/derived.js';
import { metricDefinition, type MetricId, type MetricUnit } from '../reports/metric-registry.js';
import {
  formatReciprocalTailTick,
  reciprocalTailScale,
  reciprocalTailY,
} from '../reports/tail-axis.js';

type Labels = DashboardLabels;
const label = (labels: Labels, key: string): string =>
  (labels as Readonly<Record<string, string>>)[key] ?? key;
const esc = (value: unknown): string =>
  String(value).replace(
    /[&<>'"]/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c,
  );

const numberMetric = (
  amount: number | null,
  formatter: (value: number) => string,
  l: Labels,
): string => esc(formatNullableMetric(amount, (value) => formatter(Number(value)), l.na));

const textMetric = (amount: string | null | undefined, l: Labels): string =>
  esc(formatNullableMetric(amount, String, l.na));

const addMetrics = (...values: readonly (number | null)[]): number | null =>
  values.some((item) => item === null)
    ? null
    : (values as readonly number[]).reduce((total, item) => total + item, 0);

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
  report: DashboardAnalysisReport,
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
    numberMetric(credits as number | null, (value) => formatInteger(Math.round(value), locale), l),
    numberMetric(rtp as number | null, (value) => formatAdaptivePercent(value, locale), l),
  ]);
};

function rtpChart(report: DashboardAnalysisReport, locale: DashboardLocale, l: Labels): string {
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
  const available = values.filter((item): item is number => item !== null && item >= 0);
  if (!available.some((item) => item > 0))
    return `<figure class="chart-card pie-chart"><figcaption>${esc(l.rtpContributionChart)}</figcaption><div class="empty-state">${esc(l.na)}</div></figure>`;
  const total = available.reduce((sum, item) => sum + Math.max(0, item), 0);
  const cx = 310,
    cy = 128,
    radius = 78;
  let angle = -Math.PI / 2;
  const slices = values.map((rawValue, index) => {
    const value = rawValue ?? 0;
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
        .filter((slice) => values[slice.index] !== null && slice.side === side)
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

function rtpComposition(
  report: DashboardAnalysisReport,
  locale: DashboardLocale,
  l: Labels,
): string {
  const d = deriveAnalytics(report);
  const m = report.metrics;
  const c = m.components;
  const rows = componentRows(report, locale, l);
  const baseCredits = addMetrics(
    c.baseGameRegularPayout,
    c.baseGameScatterPayout,
    c.baseGameMultiplierUplift,
  );
  const featureCredits = addMetrics(
    c.freeGameRegularPayout,
    c.freeGameScatterPayout,
    c.freeGameMultiplierUplift,
  );
  rows.push([
    `<strong class="accent">${esc(l.baseTotal)}</strong>`,
    numberMetric(baseCredits, (value) => formatInteger(Math.round(value), locale), l),
    `<strong>${numberMetric(
      baseCredits === null || m.totalBet === null || m.totalBet <= 0
        ? null
        : baseCredits / m.totalBet,
      (value) => formatAdaptivePercent(value, locale),
      l,
    )}</strong>`,
  ]);
  rows.push([
    `<strong class="accent">${esc(l.featureTotal)}</strong>`,
    numberMetric(featureCredits, (value) => formatInteger(Math.round(value), locale), l),
    `<strong>${numberMetric(
      featureCredits === null || m.totalBet === null || m.totalBet <= 0
        ? null
        : featureCredits / m.totalBet,
      (value) => formatAdaptivePercent(value, locale),
      l,
    )}</strong>`,
  ]);
  rows.push([
    `<strong class="accent">${esc(l.totalRtp)}</strong>`,
    numberMetric(m.totalCreditedWin, (value) => formatInteger(Math.round(value), locale), l),
    `<strong>${numberMetric(m.rtp, (value) => formatAdaptivePercent(value, locale), l)}</strong>`,
  ]);
  const sourceMix = `<div class="source-mix">${[
    ['regularSymbols', d.totalRegularRtp],
    ['scatter', d.totalScatterRtp],
    ['multiplierSource', d.totalMultiplierRtp],
  ]
    .map(
      ([key, val]) =>
        `<div><span>${esc(label(l, String(key)))}</span><strong>${numberMetric(
          val as number | null,
          (value) => formatAdaptivePercent(value, locale),
          l,
        )}</strong></div>`,
    )
    .join('')}</div>`;
  return section(
    l.rtpComposition,
    `<div class="split-panel">${rtpChart(report, locale, l)}${comparisonTable([l.winningMechanic, l.payoutCredits, l.rtpPoints], rows)}</div><h3 class="subheading">${esc(l.rtpSourceMix)}</h3>${sourceMix}`,
    'rtp-section',
  );
}

function baseFeatureTable(
  report: DashboardAnalysisReport,
  locale: DashboardLocale,
  l: Labels,
): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  const rows = [
    [
      l.rtpContribution,
      numberMetric(m.baseGameWinContribution, (value) => formatAdaptivePercent(value, locale), l),
      numberMetric(m.freeGameWinContribution, (value) => formatAdaptivePercent(value, locale), l),
    ],
    [
      l.tumbleTrigger,
      numberMetric(
        m.baseGameTumbleTriggerFrequency,
        (value) => formatAdaptivePercent(value, locale),
        l,
      ),
      numberMetric(
        m.freeGameTumbleTriggerFrequency,
        (value) => formatAdaptivePercent(value, locale),
        l,
      ),
    ],
    [
      l.averageTumbleRounds,
      numberMetric(
        m.averageBaseGameTumbleRoundsPerTrigger,
        (value) => formatDecimal(value, locale),
        l,
      ),
      numberMetric(
        m.averageFreeGameTumbleRoundsPerTrigger,
        (value) => formatDecimal(value, locale),
        l,
      ),
    ],
    [
      l.maximumTumbleDepth,
      numberMetric(
        m.maximumObservedBaseGameTumbleDepth,
        (value) => formatInteger(value, locale),
        l,
      ),
      numberMetric(
        m.maximumObservedFreeGameTumbleDepth,
        (value) => formatInteger(value, locale),
        l,
      ),
    ],
    [
      l.multiplierRtp,
      numberMetric(d.baseMultiplierRtp, (value) => formatAdaptivePercent(value, locale), l),
      numberMetric(d.freeMultiplierRtp, (value) => formatAdaptivePercent(value, locale), l),
    ],
    [
      l.scatterRtp,
      numberMetric(d.baseScatterRtp, (value) => formatAdaptivePercent(value, locale), l),
      numberMetric(d.freeScatterRtp, (value) => formatAdaptivePercent(value, locale), l),
    ],
  ].map((row) => [esc(String(row[0])), ...row.slice(1).map(String)]);
  return comparisonTable([l.metric, l.baseGame, l.freeGame], rows);
}

function executiveSubsection(title: string, content: string, classes = ''): string {
  return `<section class="executive-subsection ${classes}"><h3>${esc(title)}</h3>${content}</section>`;
}

function executiveSummary(
  report: DashboardAnalysisReport,
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

function mechanicOverview(
  report: DashboardAnalysisReport,
  locale: DashboardLocale,
  l: Labels,
): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  const tumble = `<article><h3>${esc(l.tumble)}</h3><dl><div><dt>${esc(l.roundsPerSpin)}</dt><dd>${formatDecimal(m.tumbleRoundsPerPaidSpin, locale)}</dd></div><div><dt>${esc(l.overallTumbleFrequency)}</dt><dd>${formatAdaptivePercent(m.tumbleTriggerFrequency, locale)}</dd></div><div><dt>${esc(l.averageRoundsTriggeringSpin)}</dt><dd>${formatDecimal(m.averageTumbleRoundsPerTriggeringSpin, locale)}</dd></div><div><dt>${esc(l.maxDepth)}</dt><dd>${formatInteger(m.maximumObservedTumbleDepth, locale)}</dd></div></dl></article>`;
  const bathala = `<article><h3>${esc(l.bathala)}</h3><dl><div><dt>${esc(l.bathalaActivations)}</dt><dd>${formatInteger(m.bathalaActivations, locale)}</dd></div><div><dt>${esc(l.bathalaConversion)}</dt><dd>${formatAdaptivePercent(m.bathalaToNextWinConversionRate, locale)}</dd></div><div><dt>${esc(l.activationsPaidSpin)}</dt><dd>${formatDecimal(d.bathalaActivationsPerPaidSpin, locale, 3)}</dd></div><div><dt>${esc(l.symbolsRemovedPaidSpin)}</dt><dd>${formatDecimal(d.bathalaSymbolsRemovedPerPaidSpin, locale, 3)}</dd></div></dl></article>`;
  const mult = `<article><h3>${esc(l.multiplier)}</h3><dl><div><dt>${esc(l.multiplierFrequency)}</dt><dd>${formatAdaptivePercent(m.multiplierAppearanceFrequency, locale)}</dd></div><div><dt>${esc(l.averageMultiplier)}</dt><dd>${formatMultiplier(m.averageMultiplierValue, locale)}</dd></div><div><dt>${esc(l.effectiveMultiplier)}</dt><dd>${formatMultiplier(m.averageSummedMultiplierOnMultipliedWins, locale)}</dd></div><div><dt>${esc(l.maximumMultiplier)}</dt><dd>${formatMultiplier(m.maximumSummedMultiplier, locale, 0)}</dd></div><div><dt>${esc(l.totalMultiplierRtp)}</dt><dd>${formatAdaptivePercent(d.totalMultiplierRtp, locale)}</dd></div></dl></article>`;
  const featureFrequency =
    m.featureFrequency === null
      ? l.na
      : `${formatAdaptivePercent(m.featureFrequency, locale)} · ${formatOneIn(m.featureFrequency, locale, l.oneIn)}`;
  const feature = `<article><h3>${esc(l.freeGames)}</h3><dl><div><dt>${esc(l.triggerCount)}</dt><dd>${formatInteger(m.freeGameTriggerCount, locale)}</dd></div><div><dt>${esc(l.featureFrequency)}</dt><dd>${featureFrequency}</dd></div><div><dt>${esc(l.averageFreeGames)}</dt><dd>${formatDecimal(m.averageFreeGamesPlayed, locale)}</dd></div><div><dt>${esc(l.freeContribution)}</dt><dd>${formatAdaptivePercent(m.freeGameWinContribution, locale)}</dd></div></dl></article>`;
  return section(
    l.mechanicHealth,
    `<div class="mechanic-grid">${tumble}${bathala}${mult}${scatterPanel(report, locale, l)}${feature}${featureActivationsPanel(report, locale, l)}${payoutPercentilesPanel(report, locale, l)}${volatilityPanel(report, locale, l)}</div>`,
    'mechanic-section',
  );
}

function featureActivationsPanel(
  report: DashboardAnalysisReport,
  locale: DashboardLocale,
  l: Labels,
): string {
  const m = report.metrics;
  return `<article><h3>${esc(l.featureActivations)}</h3><dl><div><dt>${esc(l.initialFreeGames)}</dt><dd>${formatDecimal(m.averageInitiallyAwardedFreeGames, locale)}</dd></div><div><dt>${esc(l.retriggerCount)}</dt><dd>${formatInteger(m.retriggerCount, locale)}</dd></div><div><dt>${esc(l.averageRetriggers)}</dt><dd>${formatDecimal(m.averageRetriggersPerFeature, locale, 3)}</dd></div><div><dt>${esc(l.endingMultiplier)}</dt><dd>${formatMultiplier(m.averageEndingFreeGameMultiplier, locale)}</dd></div></dl></article>`;
}

function payoutPercentilesPanel(
  report: DashboardAnalysisReport,
  locale: DashboardLocale,
  l: Labels,
): string {
  const p = report.metrics.featureLengthPercentiles;
  const values = [
    ['P50', p.p50],
    ['P75', p.p75],
    ['P90', p.p90],
    ['P95', p.p95],
    ['P99', p.p99],
    [l.maximum, report.metrics.maximumObservedFeatureLength],
  ] as const;
  const available = values
    .map(([, amount]) => amount)
    .filter((amount): amount is number => amount !== null);
  const max = Math.max(...available, 1);
  return `<article class="percentile-panel"><h3>${esc(l.payoutPercentiles)}</h3><div class="percentile-chart" role="img" aria-label="${esc(l.payoutPercentiles)}">${values.map(([key, amount]) => `<div><span>${esc(key)}</span><i><b style="width:${amount === null ? 0 : (amount / max) * 100}%"></b></i><strong>${formatInteger(amount, locale)}</strong></div>`).join('')}</div></article>`;
}

function tailChart(report: DashboardAnalysisReport, locale: DashboardLocale, l: Labels): string {
  const observed = report.metrics.tails.filter((x) => x.frequency > 0);
  const width = 620,
    height = 320,
    left = 76,
    right = 18,
    top = 18,
    bottom = 40;
  if (!observed.length) return `<div class="empty-state">${esc(l.notObserved)}</div>`;
  const scale = reciprocalTailScale(observed.map((tail) => tail.frequency));
  if (!scale) return `<div class="empty-state">${esc(l.notObserved)}</div>`;
  const plotHeight = height - top - bottom;
  const points = observed.map((tail, i) => {
    const px = left + (i / Math.max(1, observed.length - 1)) * (width - left - right);
    const py = reciprocalTailY(scale, tail.frequency, top, plotHeight) ?? top;
    return { x: px, y: py, t: tail.threshold, f: tail.frequency };
  });
  const yTicks = scale.ticks
    .map((tick) => {
      const y = reciprocalTailY(scale, tick.frequency, top, plotHeight) ?? top;
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
		  >${esc(formatReciprocalTailTick(tick.frequency, l.oneIn, l.oneMillion))}</text>
		`;
    })
    .join('');
  return `<figure class="chart-card tail-chart"><figcaption>${esc(l.tailDecayChart)}</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(l.tailDecayChart)}"><line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}"/><line class="axis" x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}"/>${yTicks}<polyline class="tail-line" points="${points.map((p) => `${p.x},${p.y}`).join(' ')}"/>${points.map((p) => `<circle class="tail-point" cx="${p.x}" cy="${p.y}" r="4"><title>${formatInteger(p.t, locale)}×+\n${esc(l.frequency)}: ${formatAdaptivePercent(p.f, locale)}\n${esc(l.occurrence)}: ${esc(formatOneIn(p.f, locale, l.oneIn))}</title></circle><text class="axis-label" x="${p.x}" y="${height - 16}">${formatInteger(p.t, locale)}×</text>`).join('')}<text class="chart-note" x="${left}" y="12">${esc(l.occurrence)}</text></svg></figure>`;
}

function tailPerformance(
  report: DashboardAnalysisReport,
  locale: DashboardLocale,
  l: Labels,
): string {
  const m = report.metrics;
  const rows = m.tails.map((x) =>
    [
      `${formatInteger(x.threshold, locale)}×+`,
      formatInteger(x.count, locale),
      formatAdaptivePercent(x.frequency, locale),
      x.count === 0 ? l.notObserved : formatOneIn(x.frequency, locale, l.oneIn),
    ].map(esc),
  );
  return section(
    l.tails,
    `<div class="split-panel">
		${tailChart(report, locale, l)}
		${comparisonTable([l.threshold, l.count, l.frequency, l.odds], rows)}
	  </div>`,
    'tail-section',
  );
}

function targets(
  report: DashboardAnalysisReport,
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

function volatilityPanel(
  report: DashboardAnalysisReport,
  locale: DashboardLocale,
  l: Labels,
): string {
  const m = report.metrics;
  return `<article><h3>${esc(l.volatilityProfile)}</h3><dl>${[
    ['mean', formatDecimal(m.meanWinPerPaidSpin, locale, 3)],
    ['variance', formatDecimal(m.variance, locale, 2)],
    ['sd', formatDecimal(m.standardDeviation, locale, 2)],
    ['cv', formatDecimal(m.coefficientOfVariation, locale, 2)],
    ['maximumWin', formatMultiplier(m.maximumObservedWin, locale, 0)],
  ]
    .map(([key, val]) => `<div><dt>${esc(label(l, key!))}</dt><dd>${val}</dd></div>`)
    .join('')}</dl></article>`;
}

function confidencePanel(
  report: DashboardAnalysisReport,
  locale: DashboardLocale,
  l: Labels,
): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  return `<article><h3>${esc(l.simulationConfidence)}</h3><dl>${[
    ['spins', formatInteger(report.simulation.spins, locale)],
    ['seed', formatInteger(report.simulation.seed, locale)],
    ['mean', formatDecimal(m.meanWinPerPaidSpin, locale, 6)],
    ['se', formatDecimal(m.standardError, locale, 6)],
    ['ci', formatPercentRange(m.confidenceInterval95[0], m.confidenceInterval95[1], locale)],
    ['ciWidth', formatPercent(d.ciWidth, locale)],
    ['ciMargin', d.ciMargin === null ? l.na : `± ${formatPercent(d.ciMargin, locale)}`],
  ]
    .map(([key, val]) => `<div><dt>${esc(label(l, key!))}</dt><dd>${val}</dd></div>`)
    .join('')}</dl></article>`;
}

function scatterPanel(report: DashboardAnalysisReport, locale: DashboardLocale, l: Labels): string {
  const m = report.metrics,
    d = deriveAnalytics(report);
  const combined = (first: number | null, second: number | null, render: () => string): string =>
    first === null || second === null ? l.na : render();
  return `<article><h3>${esc(l.scatter)}</h3><dl>${[
    [
      'baseScatter',
      combined(
        m.components.baseGameScatterPayout,
        d.baseScatterRtp,
        () =>
          `${formatCredits(m.components.baseGameScatterPayout, locale).replace('credits', l.credits)} · ${formatAdaptivePercent(d.baseScatterRtp, locale)}`,
      ),
    ],
    [
      'freeScatter',
      combined(
        m.components.freeGameScatterPayout,
        d.freeScatterRtp,
        () =>
          `${formatCredits(m.components.freeGameScatterPayout, locale).replace('credits', l.credits)} · ${formatAdaptivePercent(d.freeScatterRtp, locale)}`,
      ),
    ],
    [
      'featureFrequency',
      m.featureFrequency === null
        ? l.na
        : `${formatAdaptivePercent(m.featureFrequency, locale)} · ${formatOneIn(m.featureFrequency, locale, l.oneIn)}`,
    ],
    ['retriggerCount', formatInteger(m.retriggerCount, locale)],
  ]
    .map(([key, val]) => `<div><dt>${esc(label(l, key!))}</dt><dd>${val}</dd></div>`)
    .join('')}</dl></article>`;
}

function validation(report: DashboardAnalysisReport, locale: DashboardLocale, l: Labels): string {
  const rec = reconcileReport(report);
  const checks = `<article><h3>${esc(l.reconciliation)}</h3><ul class="validation-list">${rec.map((x) => `<li><span>${esc(label(l, x.key))}</span>${badge(x.status, l)}</li>`).join('')}</ul></article>`;
  const csv = report.sourceType === 'workbench-session';
  const metadata = `<article><h3>${esc(l.metadata)}</h3><dl>${[
    ['schema', csv ? l.na : report.metadata.schemaVersion],
    ['gameVersion', report.metadata.gameVersion === 'unknown' ? l.na : report.metadata.gameVersion],
    [
      'configuration',
      report.metadata.configurationId === 'unknown' ? l.na : report.metadata.configurationId,
    ],
    ['generated', formatDate(report.metadata.generatedAt, locale)],
    ...(csv ? ([['source', label(l, 'workbenchCsv')]] as const) : []),
  ]
    .map(([key, val]) => `<div><dt>${esc(label(l, key))}</dt><dd>${esc(val)}</dd></div>`)
    .join('')}</dl></article>`;
  return section(
    l.validationAndMetadata,
    `<div class="validation-grid">${confidencePanel(report, locale, l)}${checks}${metadata}</div>`,
    'validation-section',
  );
}

export interface RenderDashboardOptions {
  readonly locale: DashboardLocale;
  readonly labels: Labels;
  readonly targets?: ManagementTargets;
}

function identityCard(
  report: DashboardAnalysisReport,
  locale: DashboardLocale,
  l: Labels,
  exportMode = false,
): string {
  const csv = report.sourceType === 'workbench-session';
  const configuration =
    report.metadata.configurationId === 'unknown' ? l.na : report.metadata.configurationId;
  const gameVersion =
    report.metadata.gameVersion === 'unknown' ? l.na : report.metadata.gameVersion;
  const detail = csv
    ? `${esc(l.gameVersion)}: ${esc(gameVersion)} · ${esc(label(l, 'source'))}: ${esc(
        label(l, 'workbenchCsv'),
      )} · ${esc(label(l, 'partialData'))}`
    : exportMode
      ? `${esc(l.gameVersion)}: ${esc(gameVersion)}`
      : `${esc(l.gameVersion)}: ${esc(gameVersion)} · ${esc(l.calibration)}: ${textMetric(
          report.metadata.calibrationProfile,
          l,
        )}`;
  return `<section class="identity-card"><div><p class="eyebrow">${esc(l.activeReport)}</p><h2>${esc(report.metadata.gameName)} — ${esc(configuration)}</h2><p>${detail}</p></div><time>${esc(formatDate(report.metadata.generatedAt, locale))}</time></section>`;
}

export function renderDashboard(
  report: DashboardAnalysisReport,
  options: RenderDashboardOptions,
): string {
  const { locale, labels: l } = options;
  const configured = options.targets ?? MANAGEMENT_TARGETS;
  const identity = identityCard(report, locale, l);
  return `<main id="dashboard-content">${identity}<div class="report-page report-page-one">${executiveSummary(report, locale, l, configured)}${rtpComposition(report, locale, l)}${mechanicOverview(report, locale, l)}</div><div class="report-page report-page-two">${targets(report, locale, l, configured)}${tailPerformance(report, locale, l)}${validation(report, locale, l)}</div></main>`;
}

function exportPageFooter(l: Labels, page: number, total: number): string {
  return `<footer class="export-page-footer"><span>${esc(l.page)} ${page} / ${total}</span></footer>`;
}

export function renderDetailedExportDocument(
  report: DashboardAnalysisReport,
  options: RenderDashboardOptions,
): string {
  const { locale, labels: l } = options;
  const configured = options.targets ?? MANAGEMENT_TARGETS;
  const identity = identityCard(report, locale, l, true);
  const header = `<header class="export-report-header"><p class="eyebrow">Lucky888</p><h1>${esc(l.title)}</h1><strong>${esc(l.detailedReport)}</strong></header>`;
  return `<main class="export-report detailed-export-document"><section class="export-page detailed-export-executive">${header}${identity}${executiveSummary(report, locale, l, configured)}${exportPageFooter(l, 1, 3)}</section><section class="export-page detailed-export-mechanics"><header class="export-section-header"><span>Lucky888</span><h2>${esc(l.mechanicHealth)}</h2></header>${rtpComposition(report, locale, l)}${mechanicOverview(report, locale, l)}${exportPageFooter(l, 2, 3)}</section><section class="export-page detailed-export-diagnostics"><header class="export-section-header"><span>Lucky888</span><h2>${esc(l.tails)}</h2></header>${tailPerformance(report, locale, l)}${targets(report, locale, l, configured)}${validation(report, locale, l)}${exportPageFooter(l, 3, 3)}</section></main>`;
}
