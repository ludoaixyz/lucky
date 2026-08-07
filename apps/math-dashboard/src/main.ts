import './style.css';
import { renderBarChart, renderConfidenceChart, renderConvergenceChart } from './charts.js';
import { MANAGEMENT_TARGETS } from './config/management-targets.js';
import { createExportOptions, exportDashboard } from './export.js';
import type { ExportFormat } from './export.js';
import {
  dictionary,
  persistDashboardLocale,
  readReportLocale,
  readStoredLocale,
  resolveDashboardLocale,
  t,
} from './i18n/index.js';
import {
  formatCompact,
  formatDate,
  formatDecimal,
  formatInteger,
  formatPercent,
} from './i18n/format.js';
import type { DashboardLocale, DashboardTranslations } from './i18n/types.js';
import {
  baseBetCredits,
  comparisonRows,
  evaluateTargets,
  featureFrequencyOdds,
  isNestedDeterministicSamples,
  maximumWinMultiple,
  meetsAllTargets,
  netReturnFrequency,
  overallStatus,
  reconcileReport,
  riskFlags,
  sampleSizeGuidance,
} from './reports/analysis.js';
import type {
  ComparisonMetricKey,
  ComparisonRow,
  ReconciliationCheck,
  RiskFlag,
  TargetEvaluation,
} from './reports/analysis.js';
import { parseSimulationReport, validateSimulationReport } from './reports/validation.js';
import type { ValidationIssue } from './reports/validation.js';
import type {
  LoadedReport,
  ReportIndexEntry,
  SimulationReport,
  Status,
} from './types/simulation-report.js';

const app = document.querySelector<HTMLElement>('#app') ?? failMissingRoot();
const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
const browserLanguage = typeof navigator === 'undefined' ? undefined : navigator.language;
let reports: LoadedReport[] = [];
let activeReportId = '';
const comparisonIds = new Set<string>();
let currentLocale: DashboardLocale = resolveDashboardLocale(
  readStoredLocale(storage),
  null,
  browserLanguage,
);
let hasExplicitUserLocale = readStoredLocale(storage) !== null;
let visibleError:
  readonly ValidationIssue[] | 'reportIndex' | 'loadFailed' | 'exportFailed' | null = null;
let exportInProgress = false;

function failMissingRoot(): never {
  throw new Error('Dashboard root is missing.');
}

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

function localizedReportLabel(entry: LoadedReport, translations: DashboardTranslations): string {
  if (entry.id.endsWith('simulation-2026-1000.json')) return translations.dashboard.builtInThousand;
  if (entry.id.endsWith('simulation-2026-1000000.json'))
    return translations.dashboard.builtInMillion;
  return `${entry.label} (${translations.dashboard.uploadedSuffix})`;
}

function statusBadge(status: Status, translations: DashboardTranslations): string {
  return `<span class="status-badge status-${status.toLowerCase()}">${escapeHtml(translations.status[status])}</span>`;
}

function targetMetric(key: TargetEvaluation['key'], translations: DashboardTranslations): string {
  if (key === 'creditedRtp') return translations.metrics.creditedRtp;
  if (key === 'baseHitFrequency') return translations.metrics.baseHitFrequency;
  if (key === 'featureOccurrence') return translations.metrics.featureFrequency;
  if (key === 'averageFeatureLength') return translations.metrics.averageFeatureLength;
  if (key === 'p95FeatureLength') return translations.metrics.p95FeatureLength;
  return translations.metrics.capHitFrequency;
}

function targetValue(
  target: TargetEvaluation,
  locale: DashboardLocale,
  translations: DashboardTranslations,
): string {
  if (target.key === 'creditedRtp' || target.key === 'baseHitFrequency')
    return formatPercent(target.value, locale);
  if (target.key === 'featureOccurrence')
    return translations.templates.ratio(formatDecimal(target.value, locale, 1));
  if (target.key === 'capHitFrequency') return formatPercent(target.value, locale, 4);
  return formatDecimal(target.value, locale, target.key === 'p95FeatureLength' ? 0 : 2);
}

function targetText(key: TargetEvaluation['key'], translations: DashboardTranslations): string {
  return translations.targets[key];
}

function targetInterpretation(
  key: TargetEvaluation['key'],
  translations: DashboardTranslations,
): string {
  if (key === 'creditedRtp') return translations.targets.creditedRtpInterpretation;
  if (key === 'baseHitFrequency') return translations.targets.baseHitInterpretation;
  if (key === 'featureOccurrence') return translations.targets.featureOccurrenceInterpretation;
  if (key === 'averageFeatureLength') return translations.targets.averageFeatureInterpretation;
  if (key === 'p95FeatureLength') return translations.targets.p95Interpretation;
  return translations.targets.capInterpretation;
}

function targetRows(
  targets: readonly TargetEvaluation[],
  locale: DashboardLocale,
  translations: DashboardTranslations,
): string {
  return targets
    .map(
      (row) => `<tr>
        <th scope="row">${escapeHtml(targetMetric(row.key, translations))}</th>
        <td>${escapeHtml(targetValue(row, locale, translations))}</td>
        <td>${escapeHtml(targetText(row.key, translations))}</td>
        <td>${statusBadge(row.status, translations)}</td>
        <td>${escapeHtml(targetInterpretation(row.key, translations))}</td>
      </tr>`,
    )
    .join('');
}

function reconciliationRows(
  checks: readonly ReconciliationCheck[],
  locale: DashboardLocale,
  translations: DashboardTranslations,
): string {
  return checks
    .map(
      (check) => `<tr>
        <th scope="row">${escapeHtml(translations.reconciliation[check.key])}</th>
        <td>${formatDecimal(check.reported, locale, 8)}</td>
        <td>${formatDecimal(check.expected, locale, 8)}</td>
        <td>${statusBadge(check.status, translations)}</td>
      </tr>`,
    )
    .join('');
}

function riskMessage(
  flag: RiskFlag,
  locale: DashboardLocale,
  translations: DashboardTranslations,
): string {
  if (flag.key === 'capApplications')
    return translations.templates.capApplicationsRisk(formatInteger(flag.count ?? 0, locale));
  return translations.risks[flag.key];
}

function riskItems(
  flags: readonly RiskFlag[],
  locale: DashboardLocale,
  translations: DashboardTranslations,
): string {
  return flags
    .map(
      (flag) => `<li class="risk-item risk-${flag.status.toLowerCase()}">
        ${statusBadge(flag.status, translations)} <span>${escapeHtml(riskMessage(flag, locale, translations))}</span>
      </li>`,
    )
    .join('');
}

function comparisonMetric(key: ComparisonMetricKey, translations: DashboardTranslations): string {
  return translations.metrics[key];
}

function comparisonValue(
  value: number,
  format: ComparisonRow['format'],
  locale: DashboardLocale,
  translations: DashboardTranslations,
): string {
  if (format === 'percent') return formatPercent(value, locale, 3);
  if (format === 'credits') return translations.templates.credits(formatInteger(value, locale));
  return formatDecimal(value, locale, 3);
}

function comparisonSection(
  selected: readonly LoadedReport[],
  locale: DashboardLocale,
  translations: DashboardTranslations,
): string {
  if (selected.length < 2)
    return `<p class="empty-state">${escapeHtml(translations.dashboard.selectTwoReports)}</p>`;
  const [first, second] = selected;
  if (!first || !second) return '';
  const rows = comparisonRows(first.report, second.report)
    .map(
      (row) => `<tr>
        <th scope="row">${escapeHtml(comparisonMetric(row.key, translations))}</th>
        <td>${comparisonValue(row.a, row.format, locale, translations)}</td>
        <td>${comparisonValue(row.b, row.format, locale, translations)}</td>
        <td>${comparisonValue(row.absoluteDifference, row.format, locale, translations)}</td>
        <td>${row.relativeDifference === null ? translations.dashboard.notAvailable : formatPercent(row.relativeDifference, locale)}</td>
      </tr>`,
    )
    .join('');
  const nested = isNestedDeterministicSamples(selected);
  const incompatible = new Set(selected.map((entry) => entry.report.configurationId)).size > 1;
  return `${nested ? `<p class="notice">${escapeHtml(translations.templates.nestedSamples)}</p>` : ''}
    ${selected.length > 2 ? `<p class="microcopy">${escapeHtml(translations.dashboard.firstTwoDifference)}</p>` : ''}
    <div class="table-scroll"><table>
      <thead><tr><th>${escapeHtml(translations.dashboard.metric)}</th><th>${escapeHtml(localizedReportLabel(first, translations))}</th><th>${escapeHtml(localizedReportLabel(second, translations))}</th><th>${escapeHtml(translations.dashboard.absoluteDifference)}</th><th>${escapeHtml(translations.dashboard.relativeDifference)}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${incompatible ? `<p class="notice">${escapeHtml(translations.dashboard.incompatibleConvergence)}</p>` : `<article class="chart-card comparison-chart"><h3>${escapeHtml(translations.charts.convergence)}</h3><div id="convergence-chart" class="chart-surface"></div></article>`}`;
}

function validationErrorText(
  issues: readonly ValidationIssue[],
  translations: DashboardTranslations,
): string {
  return issues
    .map((issue) => `${issue.field ? `${issue.field}: ` : ''}${translations.errors[issue.key]}`)
    .join(' ');
}

function visibleErrorText(translations: DashboardTranslations): string {
  if (Array.isArray(visibleError)) return validationErrorText(visibleError, translations);
  if (visibleError === 'reportIndex') return translations.errors.reportIndex;
  if (visibleError === 'exportFailed') return translations.errors.exportFailed;
  return translations.errors.loadFailed;
}

function languageButtons(locale: DashboardLocale): string {
  const options: readonly [DashboardLocale, string][] = [
    ['en', 'gb.svg'],
    ['pt-BR', 'br.svg'],
    ['zh-CN', 'cn.svg'],
  ];
  return options
    .map(([code, flag]) => {
      const label = dictionary(code).languageName;
      return `<button type="button" data-locale="${code}" aria-label="${label}" title="${label}" aria-pressed="${String(code === locale)}"><img src="${import.meta.env.BASE_URL}flags/${flag}" alt=""> <span>${label}</span></button>`;
    })
    .join('');
}

function renderDashboard(): void {
  const translations = dictionary(currentLocale);
  document.documentElement.lang = currentLocale;
  document.title = `LUCKY888 — ${translations.dashboard.title}`;
  const active = reports.find((entry) => entry.id === activeReportId);
  if (!active) {
    app.innerHTML = `<main class="loading-shell"><h1>LUCKY888 — ${escapeHtml(t(currentLocale, 'dashboard.title'))}</h1><p>${visibleError ? escapeHtml(visibleErrorText(translations)) : escapeHtml(translations.dashboard.loading)}</p></main>`;
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
        `<option value="${escapeHtml(entry.id)}" ${entry.id === active.id ? 'selected' : ''}>${escapeHtml(localizedReportLabel(entry, translations))}</option>`,
    )
    .join('');
  const comparisonOptions = reports
    .map(
      (entry) =>
        `<label class="check-option"><input type="checkbox" data-compare-id="${escapeHtml(entry.id)}" ${comparisonIds.has(entry.id) ? 'checked' : ''}> <span>${escapeHtml(localizedReportLabel(entry, translations))}</span></label>`,
    )
    .join('');
  const summary = translations.templates.summary({
    rtp: formatPercent(report.creditedTotalRtp, currentLocale),
    spins: formatInteger(report.paidSpins, currentLocale),
    awardFrequency: formatPercent(report.featureInclusiveHitFrequency, currentLocale),
    featureOdds: formatDecimal(featureFrequencyOdds(report), currentLocale, 1),
    averageLength: formatDecimal(report.averageTotalFreeSpinsPerTrigger, currentLocale, 1),
    metTargets: meetsAllTargets(report),
    overallStatus: overallStatus(report),
    hasFeatureTriggers: report.featureTriggerFrequency > 0,
    comparisonSelected: selectedComparisons.some((entry) => entry.id !== active.id),
  });
  const kpis: readonly [string, string, string][] = [
    [
      translations.metrics.creditedRtp,
      formatPercent(report.creditedTotalRtp, currentLocale),
      translations.metricDescriptions.creditedRtp,
    ],
    [
      translations.metrics.uncappedRtp,
      formatPercent(report.uncappedTotalRtp, currentLocale),
      translations.metricDescriptions.uncappedRtp,
    ],
    [
      translations.metrics.baseRtp,
      formatPercent(report.uncappedBaseLineRtp, currentLocale),
      translations.metricDescriptions.baseRtp,
    ],
    [
      translations.metrics.featureRtp,
      formatPercent(report.uncappedFeatureRtp, currentLocale),
      translations.metricDescriptions.featureRtp,
    ],
    [
      translations.metrics.awardFrequency,
      formatPercent(report.featureInclusiveHitFrequency, currentLocale),
      translations.metricDescriptions.awardFrequency,
    ],
    [
      translations.metrics.netReturnFrequency,
      formatPercent(netReturnFrequency(report), currentLocale),
      translations.metricDescriptions.netReturnFrequency,
    ],
    [
      translations.metrics.featureFrequency,
      formatPercent(report.featureTriggerFrequency, currentLocale, 3),
      translations.templates.ratio(formatDecimal(featureFrequencyOdds(report), currentLocale, 1)),
    ],
    [
      translations.metrics.averageFeatureLength,
      formatDecimal(report.averageTotalFreeSpinsPerTrigger, currentLocale, 2),
      translations.metricDescriptions.averageFeatureLength,
    ],
    [
      translations.metrics.p95FeatureLength,
      formatInteger(report.featureLengthPercentiles.p95, currentLocale),
      translations.metricDescriptions.p95FeatureLength,
    ],
    [
      translations.metrics.standardDeviation,
      formatDecimal(report.standardDeviation, currentLocale, 3),
      translations.metricDescriptions.standardDeviation,
    ],
    [
      translations.metrics.maximumObservedWin,
      translations.templates.credits(
        formatInteger(report.maximumObservedWinCredits, currentLocale),
      ),
      translations.templates.maxWinMultiple(
        formatDecimal(maximumWinMultiple(report), currentLocale, 1),
      ),
    ],
    [
      translations.metrics.capHitFrequency,
      formatPercent(report.capApplicationFrequency, currentLocale, 4),
      translations.templates.capApplications(formatInteger(report.capApplications, currentLocale)),
    ],
  ];
  app.innerHTML = `
    <header class="dashboard-header">
      <div><p class="eyebrow">${escapeHtml(translations.dashboard.simulationManagement)}</p><h1>LUCKY888 <span>— ${escapeHtml(t(currentLocale, 'dashboard.title'))}</span></h1></div>
      <div class="header-actions">
        <div class="header-status"><span>${escapeHtml(translations.dashboard.overallStatus)}</span>${statusBadge(status, translations)}</div>
        <nav class="language-selector no-export" aria-label="${escapeHtml(translations.dashboard.languageSelector)}">${languageButtons(currentLocale)}</nav>
        <div class="export-actions no-export"><button id="export-pdf" class="button button-gold" type="button" ${exportInProgress ? 'disabled' : ''}>${escapeHtml(translations.dashboard.exportPdf)}</button><button id="export-png" class="button" type="button" ${exportInProgress ? 'disabled' : ''}>${escapeHtml(translations.dashboard.exportPng)}</button></div>
      </div>
    </header>
    <p id="export-status" class="visually-hidden" aria-live="polite">${exportInProgress ? escapeHtml(translations.dashboard.exporting) : ''}</p>
    <nav class="dashboard-nav no-print" aria-label="${escapeHtml(translations.dashboard.reportControls)}">
      <label>${escapeHtml(t(currentLocale, 'dashboard.activeReport'))}<select id="report-select">${reportOptions}</select></label>
      <fieldset><legend>${escapeHtml(translations.dashboard.comparisonReports)}</legend><div class="comparison-options">${comparisonOptions}</div></fieldset>
      <div id="upload-zone" class="upload-zone" tabindex="0" role="button" aria-label="${escapeHtml(translations.dashboard.uploadAria)}">
        <strong>${escapeHtml(translations.dashboard.dropReport)}</strong><span>${escapeHtml(translations.dashboard.chooseFile)}</span>
        <input id="file-input" type="file" accept="application/json,.json" aria-label="${escapeHtml(translations.dashboard.uploadAria)}">
      </div>
    </nav>
    ${visibleError ? `<div class="error-banner" role="alert"><strong>${escapeHtml(translations.dashboard.reportRejected)}</strong> ${escapeHtml(visibleErrorText(translations))}</div>` : ''}
    <main>
      <section class="identity-card print-identity">
        <div><p class="eyebrow">${escapeHtml(translations.dashboard.activeReportEyebrow)}</p><h2>${escapeHtml(report.configurationId)}</h2><p class="guidance">${escapeHtml(translations.sampleGuidance[sampleSizeGuidance(report.paidSpins)])} · ${escapeHtml(translations.dashboard.monteCarloEstimated)}</p></div>
        <dl class="identity-grid">
          <div><dt>${escapeHtml(translations.dashboard.gameVersion)}</dt><dd>${escapeHtml(report.gameVersion)}</dd></div>
          <div><dt>${escapeHtml(translations.dashboard.simulationSize)}</dt><dd>${escapeHtml(translations.templates.paidSpins(formatInteger(report.paidSpins, currentLocale)))}</dd></div>
          <div><dt>${escapeHtml(translations.dashboard.seed)}</dt><dd>${String(report.seed)}</dd></div>
          <div><dt>${escapeHtml(translations.dashboard.generated)}</dt><dd>${escapeHtml(formatDate(report.generatedAt, currentLocale))}</dd></div>
          <div><dt>${escapeHtml(translations.dashboard.methodology)}</dt><dd>${escapeHtml(report.methodology)}</dd></div>
          <div><dt>${escapeHtml(translations.dashboard.baseBetAssumption)}</dt><dd>${escapeHtml(translations.templates.baseBet(formatInteger(baseBetCredits(report), currentLocale), report.baseBetCredits === undefined))}</dd></div>
        </dl>
      </section>
      <section aria-labelledby="kpi-heading"><div class="section-heading"><p class="eyebrow">${escapeHtml(translations.dashboard.executiveView)}</p><h2 id="kpi-heading">${escapeHtml(t(currentLocale, 'dashboard.keyPerformanceIndicators'))}</h2></div>
        <div class="kpi-grid">${kpis.map(([label, value, detail]) => `<article class="kpi-card"><h3>${escapeHtml(label)}</h3><strong>${escapeHtml(value)}</strong><p>${escapeHtml(detail)}</p></article>`).join('')}</div>
      </section>
      <section class="summary-card"><p class="eyebrow">${escapeHtml(translations.dashboard.plainLanguageSummary)}</p><p>${escapeHtml(summary)}</p></section>
      <section aria-labelledby="targets-heading"><div class="section-heading"><p class="eyebrow">${escapeHtml(translations.dashboard.provisionalTargets)}</p><h2 id="targets-heading">${escapeHtml(translations.dashboard.managementTargetAssessment)}</h2><p>${escapeHtml(translations.dashboard.complianceNote)}</p></div>
        <div class="table-scroll"><table><thead><tr><th>${escapeHtml(translations.dashboard.metric)}</th><th>${escapeHtml(translations.dashboard.result)}</th><th>${escapeHtml(translations.dashboard.target)}</th><th>${escapeHtml(translations.dashboard.status)}</th><th>${escapeHtml(translations.dashboard.interpretation)}</th></tr></thead><tbody>${targetRows(targets, currentLocale, translations)}</tbody></table></div>
      </section>
      <section aria-labelledby="charts-heading"><div class="section-heading"><p class="eyebrow">${escapeHtml(translations.dashboard.distributionAndUncertainty)}</p><h2 id="charts-heading">${escapeHtml(t(currentLocale, 'dashboard.performanceCharts'))}</h2></div>
        <div class="chart-grid">
          <article class="chart-card"><h3>${escapeHtml(t(currentLocale, 'charts.rtpContribution'))}</h3><div id="rtp-chart" class="chart-surface"></div></article>
          <article class="chart-card"><h3>${escapeHtml(translations.charts.payoutDistribution)}</h3><div id="payout-chart" class="chart-surface"></div></article>
          <article class="chart-card"><h3>${escapeHtml(translations.charts.featureTriggerComposition)}</h3><div id="trigger-chart" class="chart-surface"></div></article>
          <article class="chart-card"><h3>${escapeHtml(translations.charts.featureLengthPercentiles)}</h3><div id="length-chart" class="chart-surface"></div></article>
          <article class="chart-card chart-wide"><h3>${escapeHtml(translations.charts.confidenceInterval)}</h3><div id="confidence-chart" class="chart-surface"></div></article>
        </div>
      </section>
      <section class="review-grid">
        <article><div class="section-heading"><p class="eyebrow">${escapeHtml(translations.dashboard.riskReview)}</p><h2>${escapeHtml(translations.dashboard.riskFlags)}</h2></div><ul class="risk-list">${riskItems(risks, currentLocale, translations)}</ul></article>
        <article><div class="section-heading"><p class="eyebrow">${escapeHtml(translations.dashboard.dataIntegrity)}</p><h2>${escapeHtml(translations.dashboard.reconciliation)}</h2></div><div class="table-scroll"><table><thead><tr><th>${escapeHtml(translations.dashboard.check)}</th><th>${escapeHtml(translations.dashboard.reported)}</th><th>${escapeHtml(translations.dashboard.calculated)}</th><th>${escapeHtml(translations.dashboard.status)}</th></tr></thead><tbody>${reconciliationRows(reconciliations, currentLocale, translations)}</tbody></table></div></article>
      </section>
      <section id="comparison" aria-labelledby="comparison-heading"><div class="section-heading"><p class="eyebrow">${escapeHtml(translations.dashboard.reportComparison)}</p><h2 id="comparison-heading">${escapeHtml(translations.dashboard.comparisonMode)}</h2></div>${comparisonSection(selectedComparisons, currentLocale, translations)}</section>
    </main>
    <footer><p>${escapeHtml(translations.dashboard.footer)}</p></footer>`;

  wireInteractions(active);
  renderCharts(report, selectedComparisons, currentLocale, translations);
}

function renderCharts(
  report: SimulationReport,
  selected: readonly LoadedReport[],
  locale: DashboardLocale,
  translations: DashboardTranslations,
): void {
  const rtp = document.querySelector<HTMLElement>('#rtp-chart');
  if (rtp)
    renderBarChart(rtp, [
      {
        label: translations.charts.base,
        value: report.uncappedBaseLineRtp,
        displayValue: formatPercent(report.uncappedBaseLineRtp, locale),
      },
      {
        label: translations.charts.feature,
        value: report.uncappedFeatureRtp,
        displayValue: formatPercent(report.uncappedFeatureRtp, locale),
      },
      {
        label: translations.charts.scatter,
        value: report.uncappedBaseScatterRtp,
        displayValue: formatPercent(report.uncappedBaseScatterRtp, locale),
      },
    ]);
  const payout = document.querySelector<HTMLElement>('#payout-chart');
  if (payout)
    renderBarChart(
      payout,
      report.payoutDistribution.map((bucket) => ({
        label: bucket.label,
        value: bucket.probability,
        displayValue: formatPercent(bucket.probability, locale, 1),
      })),
    );
  const trigger = document.querySelector<HTMLElement>('#trigger-chart');
  if (trigger)
    renderBarChart(
      trigger,
      (['3', '4', '5'] as const).map((count, index) => {
        const value = report.featureTriggerFrequencyByScatterCount[count] ?? 0;
        const labels = [
          translations.charts.threeScatter,
          translations.charts.fourScatter,
          translations.charts.fiveScatter,
        ];
        return {
          label: labels[index] ?? count,
          value,
          displayValue: formatPercent(value, locale, 3),
        };
      }),
    );
  const length = document.querySelector<HTMLElement>('#length-chart');
  if (length) {
    const percentiles = report.featureLengthPercentiles;
    renderBarChart(length, [
      {
        label: translations.charts.median,
        value: percentiles.median,
        displayValue: formatInteger(percentiles.median, locale),
      },
      {
        label: translations.charts.p75,
        value: percentiles.p75,
        displayValue: formatInteger(percentiles.p75, locale),
      },
      {
        label: translations.charts.p90,
        value: percentiles.p90,
        displayValue: formatInteger(percentiles.p90, locale),
      },
      {
        label: translations.charts.p95,
        value: percentiles.p95,
        displayValue: formatInteger(percentiles.p95, locale),
      },
      {
        label: translations.charts.p99,
        value: percentiles.p99,
        displayValue: formatInteger(percentiles.p99, locale),
      },
    ]);
  }
  const confidence = document.querySelector<HTMLElement>('#confidence-chart');
  if (confidence) {
    const estimate = formatPercent(report.creditedTotalRtp, locale);
    const low = formatPercent(report.confidenceInterval95[0], locale);
    const high = formatPercent(report.confidenceInterval95[1], locale);
    renderConfidenceChart(
      confidence,
      report.creditedTotalRtp,
      report.confidenceInterval95,
      [MANAGEMENT_TARGETS.creditedRtp.minimum, MANAGEMENT_TARGETS.creditedRtp.maximum],
      {
        ariaLabel: translations.templates.confidenceAria(estimate, low, high),
        estimate: `${translations.charts.estimate} ${estimate}`,
        low,
        high,
        targetBand: translations.charts.targetBand,
      },
    );
  }
  const convergence = document.querySelector<HTMLElement>('#convergence-chart');
  if (convergence)
    renderConvergenceChart(
      convergence,
      selected.map((entry) => {
        const label = localizedReportLabel(entry, translations);
        const spins = formatInteger(entry.report.paidSpins, locale);
        const rtpValue = formatPercent(entry.report.creditedTotalRtp, locale);
        return {
          label,
          spins: entry.report.paidSpins,
          rtp: entry.report.creditedTotalRtp,
          spinsDisplay: spins,
          compactSpinsDisplay: formatCompact(entry.report.paidSpins, locale),
          rtpDisplay: rtpValue,
          ariaLabel: translations.templates.convergenceAria(label, spins, rtpValue),
        };
      }),
    );
}

async function addUpload(file: File): Promise<void> {
  const parsed = parseSimulationReport(await file.text());
  if (!parsed.ok) {
    for (const issue of parsed.errors)
      if (issue.technicalDetail) console.error(issue.technicalDetail);
    visibleError = parsed.errors;
    renderDashboard();
    return;
  }
  const id = `upload-${Date.now()}-${file.name}`;
  reports = [...reports, { id, label: file.name, source: 'upload', report: parsed.report }];
  activeReportId = id;
  comparisonIds.add(id);
  visibleError = null;
  renderDashboard();
}

async function runExport(format: ExportFormat, active: LoadedReport): Promise<void> {
  if (exportInProgress) return;
  const exportLocale = currentLocale;
  const translations = dictionary(exportLocale);
  const options = createExportOptions(exportLocale, active.report.configurationId, format);
  exportInProgress = true;
  renderDashboard();
  try {
    await exportDashboard(options, app, translations.languageName, (exportedAt) =>
      translations.templates.exportFooter(
        translations.languageName,
        active.report.configurationId,
        formatDate(exportedAt, exportLocale),
      ),
    );
  } catch (error) {
    console.error('Dashboard export failed', error);
    visibleError = 'exportFailed';
  } finally {
    exportInProgress = false;
    renderDashboard();
  }
}

function wireInteractions(active: LoadedReport): void {
  document.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach((button) => {
    button.addEventListener('click', () => {
      const locale = button.dataset.locale;
      if (locale !== 'en' && locale !== 'pt-BR' && locale !== 'zh-CN') return;
      currentLocale = locale;
      hasExplicitUserLocale = true;
      persistDashboardLocale(storage, locale, activeReportId);
      renderDashboard();
    });
  });
  document
    .querySelector<HTMLSelectElement>('#report-select')
    ?.addEventListener('change', (event) => {
      activeReportId = (event.currentTarget as HTMLSelectElement).value;
      const next = reports.find((entry) => entry.id === activeReportId);
      if (next && !hasExplicitUserLocale)
        currentLocale = resolveDashboardLocale(
          null,
          readReportLocale(storage, next.id) ?? next.report.dashboardLocale,
          browserLanguage,
        );
      visibleError = null;
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
  document.querySelector<HTMLButtonElement>('#export-pdf')?.addEventListener('click', () => {
    void runExport('pdf', active);
  });
  document.querySelector<HTMLButtonElement>('#export-png')?.addEventListener('click', () => {
    void runExport('png', active);
  });
}

async function loadBuiltInReports(): Promise<void> {
  try {
    const indexResponse = await fetch(`${import.meta.env.BASE_URL}reports/index.json`);
    if (!indexResponse.ok) throw new Error(String(indexResponse.status));
    const index = (await indexResponse.json()) as unknown;
    if (!Array.isArray(index)) {
      visibleError = 'reportIndex';
      renderDashboard();
      return;
    }
    const entries = index as ReportIndexEntry[];
    const loaded = await Promise.all(
      entries.map(async (entry, order): Promise<LoadedReport> => {
        if (typeof entry.file !== 'string' || typeof entry.label !== 'string')
          throw new Error(`index:${order + 1}`);
        const response = await fetch(`${import.meta.env.BASE_URL}reports/${entry.file}`);
        if (!response.ok) throw new Error(`${entry.file}:${response.status}`);
        const validation = validateSimulationReport((await response.json()) as unknown);
        if (!validation.ok) {
          visibleError = validation.errors;
          throw new Error(entry.file);
        }
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
    const defaultReport = loaded.find((entry) => entry.id === activeReportId);
    currentLocale = resolveDashboardLocale(
      readStoredLocale(storage),
      (defaultReport &&
        (readReportLocale(storage, defaultReport.id) ?? defaultReport.report.dashboardLocale)) ||
        null,
      browserLanguage,
    );
    for (const entry of loaded) comparisonIds.add(entry.id);
    visibleError = null;
  } catch (error: unknown) {
    console.error('Dashboard report load failed', error);
    visibleError ??= 'loadFailed';
  }
  renderDashboard();
}

renderDashboard();
void loadBuiltInReports();
