import './style.css';
import { createExportOptions, exportDashboard, type ExportFormat } from './export.js';
import {
  dictionary,
  persistDashboardLocale,
  readStoredLocale,
  resolveDashboardLocale,
} from './i18n/index.js';
import { formatDate, formatDecimal, formatInteger, formatPercent } from './i18n/format.js';
import { bindLanguageButtons, languageButtons } from './i18n/language-selector.js';
import type { DashboardLocale } from './i18n/types.js';
import {
  componentRtp,
  evaluateTargets,
  frequencyOdds,
  overallStatus,
  reconcileReport,
} from './reports/analysis.js';
import {
  normalizeReport,
  parseSimulationReport,
  type NormalizationResult,
} from './reports/report-normalizer.js';
import type { LoadedReport, ReportIndexEntry } from './types/simulation-report.js';
function requiredApp(): HTMLElement {
  const value = document.querySelector<HTMLElement>('#app');
  if (!value) throw new Error('Dashboard root is missing.');
  return value;
}
const app = requiredApp();
const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
let locale: DashboardLocale = resolveDashboardLocale(
  readStoredLocale(storage),
  null,
  navigator.language,
);
let reports: LoadedReport[] = [];
let active = '';
let errors: string[] = [];
let exporting = false;
const esc = (v: unknown) =>
  String(v).replace(
    /[&<>'"]/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c,
  );
const pct = (v: number) => formatPercent(v, locale);
const num = (v: number, d = 2) => formatDecimal(v, locale, d);
const integer = (v: number) => formatInteger(v, locale);
const odds = (v: number, l: string | undefined) =>
  frequencyOdds(v) === null ? (l ?? 'N/A') : `1 in ${integer(frequencyOdds(v)!)}`;
function badge(status: string | undefined) {
  const value = status ?? 'N/A';
  return `<span class="status-badge status-${value.toLowerCase()}">${esc(value)}</span>`;
}
function card(
  label: string | undefined,
  value: string | undefined,
  note = '',
  tip: string | undefined = '',
) {
  return `<article class="kpi-card"${tip ? ` title="${esc(tip)}"` : ''}><h3>${esc(label ?? '')}</h3><strong>${value ?? ''}</strong>${note ? `<p>${note}</p>` : ''}</article>`;
}
function section(title: string | undefined, content: string) {
  return `<section><div class="section-heading"><h2>${esc(title ?? '')}</h2></div>${content}</section>`;
}
function grid(cards: string[]) {
  return `<div class="kpi-grid">${cards.join('')}</div>`;
}
function render() {
  const t = dictionary(locale);
  const l = t.labels;
  document.documentElement.lang = locale;
  document.title = `LUCKY888 — ${l.title}`;
  const loaded = reports.find((r) => r.id === active);
  if (!loaded) {
    app.innerHTML = `<main class="loading-shell"><h1>LUCKY888 — ${esc(l.title)}</h1>${errors.length ? `<div class="error-banner"><strong>${l.reportRejected}</strong><br>${errors.map(esc).join('<br>')}</div>` : '<p>Loading…</p>'}${upload(l)}</main>`;
    bind();
    return;
  }
  const r = loaded.report,
    m = r.metrics,
    c = m.components,
    status = overallStatus(r);
  const componentRows = (Object.entries(c) as [keyof typeof c, number][])
    .map(
      ([k, v]) =>
        `<tr><td>${esc(componentLabel(k, l))}</td><td>${num(v)} ${l.credits}</td><td>${pct(componentRtp(r, v))}</td></tr>`,
    )
    .join('');
  const tailRows = m.tails
    .map(
      (x) =>
        `<tr><td>${integer(x.threshold)}×+</td><td>${integer(x.count)}</td><td>${pct(x.frequency)}</td><td>${x.count === 0 ? l.notObserved : odds(x.frequency, l.notObserved)}</td></tr>`,
    )
    .join('');
  const recRows = reconcileReport(r)
    .map(
      (x) =>
        `<tr><td>${esc(l[x.key] ?? x.key)}</td><td>${num(x.expected, 6)}</td><td>${num(x.actual, 6)}</td><td>${badge(x.status)}</td></tr>`,
    )
    .join('');
  const targetRows = evaluateTargets(r)
    .map(
      (x) =>
        `<tr><td>${esc(l[x.key] ?? x.key)}</td><td>${num(x.value, 6)}</td><td>${x.range ? `${x.range.minimum ?? '–'} – ${x.range.maximum ?? '–'}` : l.na}</td><td>${badge(x.status)}</td></tr>`,
    )
    .join('');
  app.innerHTML = `<header class="dashboard-header"><div><p class="eyebrow">SIMULATION MANAGEMENT</p><h1>LUCKY888 <span>— ${esc(l.title)}</span></h1></div><div class="header-actions"><div class="header-status">${badge(status)}</div><nav class="language-selector no-export">${languageButtons(locale, import.meta.env.BASE_URL)}</nav><div class="export-actions no-export"><button id="export-pdf" class="button button-gold">${l.exportPdf}</button><button id="export-png" class="button">${l.exportPng}</button></div></div></header>${upload(l)}${errors.length ? `<div class="error-banner"><strong>${l.reportRejected}</strong><br>${errors.map(esc).join('<br>')}</div>` : ''}<main id="dashboard-content"><section class="summary-card"><div class="section-heading"><p class="eyebrow">ACTIVE REPORT</p><h2>${esc(r.metadata.configurationId)}</h2></div>${r.metadata.calibrationProfile?.toLowerCase().includes('placeholder') ? `<p>${esc(l.calibration)} ${badge(l.prototype)}</p>` : ''}</section>
${section(l.overview, grid([card(l.creditedRtp, pct(m.rtp)), card(l.winningFrequency, pct(m.winningSpinFrequency)), card(l.featureFrequency, pct(m.featureFrequency), `${odds(m.featureFrequency, l.notObserved)} · ${integer(m.freeGameTriggerCount)}`), card(l.averageWin, num(m.averageWinPerWinningSpin) + '×'), card(l.maximumWin, num(m.maximumObservedWin) + '×'), card(l.spins, integer(r.simulation.spins)), card(l.seed, integer(r.simulation.seed)), card(l.configuration, esc(r.metadata.configurationId))]))}
${section(l.rtpComposition, `<table><thead><tr><th>${l.metric}</th><th>${l.credits}</th><th>${l.rtpPoints}</th></tr></thead><tbody>${componentRows}<tr><th>${l.totalRtp}</th><th>${num(m.totalCreditedWin)} ${l.credits}</th><th>${pct(m.rtp)}</th></tr></tbody></table>${grid([card(l.baseContribution, pct(m.baseGameWinContribution)), card(l.freeContribution, pct(m.freeGameWinContribution)), card(l.totalRtp, pct(m.rtp))])}`)}
${section(l.tumble, grid([card(l.baseTumbleFrequency, pct(m.baseGameTumbleTriggerFrequency)), card(l.freeTumbleFrequency, pct(m.freeGameTumbleTriggerFrequency)), card(l.baseTumbleAverage, num(m.averageBaseGameTumbleRoundsPerTrigger)), card(l.freeTumbleAverage, num(m.averageFreeGameTumbleRoundsPerTrigger)), card(l.roundsPerSpin, num(m.tumbleRoundsPerPaidSpin)), card(l.maxBaseDepth, integer(m.maximumObservedBaseGameTumbleDepth)), card(l.maxFreeDepth, integer(m.maximumObservedFreeGameTumbleDepth)), card(l.maxDepth, integer(m.maximumObservedTumbleDepth))]))}
${section(l.bathala, grid([card(l.bathalaActivations, integer(m.bathalaActivations)), card(l.bathalaFrequency, pct(m.bathalaActivationFrequency), '', l.bathalaFrequencyTip), card(l.averageRemoved, num(m.averageSymbolsRemoved)), card(l.bathalaConversion, pct(m.bathalaToNextWinConversionRate), '', l.bathalaConversionTip)]))}
${section(l.multiplier, grid([card(l.multiplierFrequency, pct(m.multiplierAppearanceFrequency)), card(l.averageMultiplier, num(m.averageMultiplierValue) + '×'), card(l.effectiveMultiplier, num(m.averageSummedMultiplierOnMultipliedWins) + '×'), card(l.maximumMultiplier, integer(m.maximumSummedMultiplier) + '×'), card(l.baseMultiplierRtp, pct(componentRtp(r, c.baseGameMultiplierUplift))), card(l.freeMultiplierRtp, pct(componentRtp(r, c.freeGameMultiplierUplift)))]))}
${section(l.freeGames, grid([card(l.triggerCount, integer(m.freeGameTriggerCount)), card(l.featureFrequency, pct(m.featureFrequency), odds(m.featureFrequency, l.notObserved)), card(l.initialFreeGames, num(m.averageInitiallyAwardedFreeGames)), card(l.averageFreeGames, num(m.averageFreeGamesPlayed)), card(l.maximumFeatureLength, integer(m.maximumObservedFeatureLength)), card(l.retriggerCount, integer(m.retriggerCount)), card(l.averageRetriggers, num(m.averageRetriggersPerFeature)), card(l.endingMultiplier, num(m.averageEndingFreeGameMultiplier) + '×'), card(l.freeGameRtp, pct(m.freeGameWinContribution))]))}
${section(l.scatter, grid([card(l.baseScatter, `${num(c.baseGameScatterPayout)} ${l.credits}`, pct(componentRtp(r, c.baseGameScatterPayout))), card(l.freeScatter, `${num(c.freeGameScatterPayout)} ${l.credits}`, pct(componentRtp(r, c.freeGameScatterPayout))), card(l.featureFrequency, pct(m.featureFrequency), odds(m.featureFrequency, l.notObserved)), card(l.retriggerFrequency, m.freeGameTriggerCount ? num(m.retriggerCount / m.freeGameTriggerCount) : l.notObserved)]))}
${section(l.tails, `<div class="table-scroll"><table><thead><tr><th>${l.metric}</th><th>${l.count}</th><th>${l.frequency}</th><th>${l.odds}</th></tr></thead><tbody>${tailRows}</tbody></table></div>`)}
${section(l.statistics, grid([card(l.mean, num(m.meanWinPerPaidSpin, 6)), card(l.variance, num(m.variance, 6)), card(l.sd, num(m.standardDeviation, 6)), card(l.cv, num(m.coefficientOfVariation, 4)), card(l.se, num(m.standardError, 6)), card(l.ci, `${pct(m.confidenceInterval95[0])} – ${pct(m.confidenceInterval95[1])}`)]))}
${section(l.targets, `<div class="table-scroll"><table><thead><tr><th>${l.metric}</th><th>${l.result}</th><th>${l.target}</th><th>${l.status}</th></tr></thead><tbody>${targetRows}</tbody></table></div>`)}
${section(l.reconciliation, `<div class="table-scroll"><table><thead><tr><th>${l.metric}</th><th>${l.expected}</th><th>${l.actual}</th><th>${l.status}</th></tr></thead><tbody>${recRows}</tbody></table></div>`)}
${section(l.metadata, grid([card(l.schema, esc(r.metadata.schemaVersion)), card(l.gameVersion, esc(r.metadata.gameVersion)), card(l.configuration, esc(r.metadata.configurationId)), card(l.generated, esc(formatDate(r.metadata.generatedAt, locale))), card(l.methodology, esc(r.simulation.methodology)), card(l.seed, integer(r.simulation.seed)), card(l.spins, integer(r.simulation.spins))]))}<footer><p>${esc(l.footer)}</p></footer></main>`;
  bind();
}
function componentLabel(k: string, l: Readonly<Record<string, string>>) {
  const map: Record<string, string | undefined> = {
    baseGameRegularPayout: 'Base Game Regular Payout',
    baseGameScatterPayout: l.baseScatter,
    baseGameMultiplierUplift: l.baseMultiplierRtp,
    freeGameRegularPayout: 'Free Game Regular Payout',
    freeGameScatterPayout: l.freeScatter,
    freeGameMultiplierUplift: l.freeMultiplierRtp,
  };
  return map[k] ?? k;
}
function upload(l: Readonly<Record<string, string>>) {
  return `<nav class="dashboard-nav no-print"><label>Active Report<select id="report-select">${reports.map((r) => `<option value="${esc(r.id)}"${r.id === active ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label><div id="upload-zone" class="upload-zone" tabindex="0"><strong>${l.drop ?? ''}</strong><span>${l.choose ?? ''}</span><input id="file-input" type="file" accept="application/json,.json"></div></nav>`;
}
function bind() {
  bindLanguageButtons(app, (next) => {
    locale = next;
    persistDashboardLocale(storage, next);
    render();
  });
  app.querySelector<HTMLSelectElement>('#report-select')?.addEventListener('change', (e) => {
    active = (e.target as HTMLSelectElement).value;
    errors = [];
    render();
  });
  const input = app.querySelector<HTMLInputElement>('#file-input');
  input?.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void loadFile(file);
  });
  const zone = app.querySelector<HTMLElement>('#upload-zone');
  zone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-dragging');
  });
  zone?.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone?.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-dragging');
    const file = e.dataTransfer?.files[0];
    if (file) void loadFile(file);
  });
  for (const format of ['pdf', 'png'] as ExportFormat[])
    app.querySelector(`#export-${format}`)?.addEventListener('click', () => void doExport(format));
}
async function loadFile(file: File) {
  accept(parseSimulationReport(await file.text()), file.name, 'upload');
}
function accept(result: NormalizationResult, label: string, source: LoadedReport['source']) {
  if (!result.ok) {
    errors = result.errors.map((e) => e.message);
    render();
    return;
  }
  const id = source === 'upload' ? `${label}-${Date.now()}` : label;
  reports = [...reports.filter((r) => r.id !== id), { id, label, source, report: result.report }];
  active = id;
  errors = [];
  render();
}
async function doExport(format: ExportFormat) {
  if (exporting) return;
  exporting = true;
  try {
    await exportDashboard(
      createExportOptions(locale, active, format),
      app,
      dictionary(locale).languageName,
      (at) =>
        `${dictionary(locale).labels.schema}: ${reports.find((r) => r.id === active)?.report.metadata.schemaVersion} · ${at}`,
    );
  } catch {
    errors = ['Export failed.'];
  } finally {
    exporting = false;
    render();
  }
}
async function boot() {
  try {
    const index = (await fetch(`${import.meta.env.BASE_URL}reports/index.json`).then((x) =>
      x.json(),
    )) as ReportIndexEntry[];
    for (const entry of index) {
      const raw = (await fetch(`${import.meta.env.BASE_URL}reports/${entry.file}`).then((x) =>
        x.json(),
      )) as unknown;
      const result = normalizeReport(raw);
      if (result.ok) {
        reports.push({
          id: entry.file,
          label: entry.label,
          source: 'built-in',
          report: result.report,
        });
        if (entry.default) active = entry.file;
      }
    }
    if (!active) active = reports[0]?.id ?? '';
    if (!reports.length) errors = ['No valid bundled Bathala reports were found.'];
  } catch {
    errors = ['Unable to load bundled reports.'];
  }
  render();
}
void boot();
