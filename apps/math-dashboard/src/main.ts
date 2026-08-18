import './style.css';
import { renderDashboard, renderDetailedExportDocument } from './components/dashboard.js';
import {
  renderCompareDashboard,
  renderCompareExportDocument,
  renderEmptyDetail,
  renderSetManager,
} from './components/workspace.js';
import { createExportOptions, exportDashboard, type ExportFormat } from './export.js';
import {
  dictionary,
  persistDashboardLocale,
  readStoredLocale,
  resolveDashboardLocale,
} from './i18n/index.js';
import { bindLanguageButtons, languageButtons } from './i18n/language-selector.js';
import type { DashboardLocale } from './i18n/types.js';
import { normalizeBundledReport } from './reports/report-normalizer.js';
import { importAnalysisArtifact } from './reports/spin-history-csv.js';
import type { LoadedReport, ReportIndexEntry } from './types/simulation-report.js';
import {
  createWorkspace,
  findSet,
  importIntoSet,
  persistWorkspace,
  removeSetReport,
  renameSet,
  restoreWorkspace,
  selectSet,
  setBaseline,
  setViewMode,
  type SimulationWorkspace,
} from './workspace/simulation-workspace.js';

function requiredApp(): HTMLElement {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) throw new Error('Dashboard root is missing.');
  return root;
}
const app = requiredApp();
const storage = typeof localStorage === 'undefined' ? undefined : localStorage;
let locale: DashboardLocale = resolveDashboardLocale(
  readStoredLocale(storage),
  null,
  navigator.language,
);
let workspace: SimulationWorkspace = createWorkspace();
const catalog: LoadedReport[] = [];
let exporting = false;
let bootError = '';
const esc = (value: unknown): string =>
  String(value).replace(
    /[&<>'"]/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] ?? c,
  );

function commit(next: SimulationWorkspace): void {
  workspace = next;
  persistWorkspace(storage, workspace);
  render();
}

function render(): void {
  const t = dictionary(locale),
    l = t.labels;
  document.documentElement.lang = locale;
  document.title = `Lucky888 — ${l.title}`;
  const selected = findSet(workspace, workspace.selectedSetId) ?? workspace.sets[0]!;
  const exportLabel =
    workspace.viewMode === 'compare' ? l.exportComparison : l.exportDetailedReport;
  const header = `<header class="dashboard-header"><div><p class="eyebrow">${esc(l.simulationManagement)}</p><h1>Lucky888 <span>— ${esc(l.title)}</span></h1></div><div class="header-actions"><nav class="language-selector no-export">${languageButtons(locale, import.meta.env.BASE_URL)}</nav><div class="export-actions no-export"><button id="export-pdf" class="button button-gold">${esc(exportLabel)}</button><button id="export-png" class="button">${esc(l.exportPng)}</button></div></div></header>`;
  const body =
    workspace.viewMode === 'compare'
      ? renderCompareDashboard(workspace, locale, l)
      : selected.report
        ? renderDashboard(selected.report, { locale, labels: l })
        : renderEmptyDetail(selected, l);
  app.innerHTML = `${header}${bootError ? `<div class="error-banner">${esc(bootError)}</div>` : ''}${renderSetManager(workspace, catalog, locale, l)}${body}`;
  bind();
}

function bind(): void {
  bindLanguageButtons(app, (next) => {
    locale = next;
    persistDashboardLocale(storage, next);
    render();
  });
  app
    .querySelectorAll<HTMLButtonElement>('[data-view-mode]')
    .forEach((button) =>
      button.addEventListener('click', () =>
        commit(setViewMode(workspace, button.dataset.viewMode === 'detail' ? 'detail' : 'compare')),
      ),
    );
  app.querySelectorAll<HTMLButtonElement>('[data-select-set]').forEach((button) =>
    button.addEventListener('click', () => {
      const id = button.dataset.selectSet;
      if (!id) return;
      let next = selectSet(workspace, id);
      if (button.dataset.detailSet) next = setViewMode(next, 'detail');
      commit(next);
    }),
  );
  app.querySelectorAll<HTMLInputElement>('[data-rename-set]').forEach((input) =>
    input.addEventListener('change', () => {
      const id = input.dataset.renameSet;
      if (id) commit(renameSet(workspace, id, input.value));
    }),
  );
  app.querySelectorAll<HTMLButtonElement>('[data-remove-set]').forEach((button) =>
    button.addEventListener('click', () => {
      const id = button.dataset.removeSet;
      if (id) commit(removeSetReport(workspace, id));
    }),
  );
  app.querySelectorAll<HTMLSelectElement>('[data-catalog-report]').forEach((select) =>
    select.addEventListener('change', () => {
      const setId = select.dataset.catalogReport,
        report = catalog.find((item) => item.id === select.value);
      if (setId && report)
        commit(importIntoSet(workspace, setId, { ok: true, report: report.report }, report.label));
    }),
  );
  app
    .querySelector<HTMLSelectElement>('#baseline-select')
    ?.addEventListener('change', (event) =>
      commit(setBaseline(workspace, (event.target as HTMLSelectElement).value || null)),
    );
  app.querySelectorAll<HTMLInputElement>('[data-file-set]').forEach((input) =>
    input.addEventListener('change', () => {
      const setId = input.dataset.fileSet,
        file = input.files?.[0];
      if (setId && file) void loadFileForSet(setId, file);
    }),
  );
  app.querySelectorAll<HTMLElement>('[data-drop-set]').forEach((zone) => {
    zone.addEventListener('dragover', (event) => {
      event.preventDefault();
      zone.classList.add('is-dragging');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('is-dragging');
      const setId = zone.dataset.dropSet,
        file = event.dataTransfer?.files[0];
      if (setId && file) void loadFileForSet(setId, file);
    });
  });
  for (const format of ['pdf', 'png'] as ExportFormat[])
    app.querySelector(`#export-${format}`)?.addEventListener('click', () => void doExport(format));
}

async function loadFileForSet(setId: string, file: File): Promise<void> {
  const result = importAnalysisArtifact(file.name, await file.text());
  commit(importIntoSet(workspace, setId, result, file.name));
}

async function doExport(format: ExportFormat): Promise<void> {
  if (exporting) return;
  exporting = true;
  try {
    const l = dictionary(locale).labels,
      reportId = workspace.viewMode === 'compare' ? 'comparison' : workspace.selectedSetId;
    const selected = findSet(workspace, workspace.selectedSetId) ?? workspace.sets[0]!;
    const exportSource = document.createElement('div');
    exportSource.className = 'export-source';
    exportSource.innerHTML =
      workspace.viewMode === 'compare'
        ? renderCompareExportDocument(workspace, locale, l)
        : selected.report
          ? renderDetailedExportDocument(selected.report, { locale, labels: l })
          : renderEmptyDetail(selected, l);
    await exportDashboard(
      createExportOptions(locale, reportId, format),
      exportSource,
      dictionary(locale).languageName,
      (at) =>
        `${workspace.viewMode === 'compare' ? l.comparisonWorkspace : l.detailedReport} · ${at}`,
    );
  } catch {
    bootError = dictionary(locale).labels.exportFailed;
  } finally {
    exporting = false;
    render();
  }
}

async function boot(): Promise<void> {
  const restored = restoreWorkspace(storage);
  try {
    const index = (await fetch(`${import.meta.env.BASE_URL}reports/index.json`).then((response) =>
      response.json(),
    )) as ReportIndexEntry[];
    for (const entry of index) {
      const raw = (await fetch(`${import.meta.env.BASE_URL}reports/${entry.file}`).then(
        (response) => response.json(),
      )) as unknown;
      const result = normalizeBundledReport(raw);
      if (result.ok)
        catalog.push({
          id: entry.file,
          label: entry.label,
          source: 'built-in',
          report: result.report,
        });
    }
    workspace = restored ?? createWorkspace();
    if (!restored) {
      const defaultEntry = index.find((entry) => entry.default),
        defaultReport = catalog.find((report) => report.id === defaultEntry?.file) ?? catalog[0];
      if (defaultReport)
        workspace = importIntoSet(
          workspace,
          'sim-1',
          { ok: true, report: defaultReport.report },
          defaultReport.label,
        );
    }
    persistWorkspace(storage, workspace);
    if (!catalog.length) bootError = dictionary(locale).labels.noReports;
  } catch {
    workspace = restored ?? createWorkspace();
    bootError = dictionary(locale).labels.loadFailed;
  }
  render();
}
void boot();
