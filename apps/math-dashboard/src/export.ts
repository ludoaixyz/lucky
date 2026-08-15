import type { DashboardLocale } from './i18n/types.js';

export type ExportFormat = 'pdf' | 'png';

export interface DashboardExportOptions {
  readonly locale: DashboardLocale;
  readonly reportId: string;
  readonly format: ExportFormat;
}

export interface DashboardExportMetadata {
  readonly reportId: string;
  readonly locale: DashboardLocale;
  readonly exportedAt: string;
}

export function createExportOptions(
  locale: DashboardLocale,
  reportId: string,
  format: ExportFormat,
): Readonly<DashboardExportOptions> {
  return Object.freeze({ locale, reportId, format });
}

export function exportFilename(options: DashboardExportOptions): string {
  return `lucky888_math-performance_${options.locale}.${options.format}`;
}

export function createExportSnapshot(
  source: HTMLElement,
  options: DashboardExportOptions,
  languageName: string,
  footerText: string,
  exportedAt = new Date().toISOString(),
): { readonly element: HTMLElement; readonly metadata: DashboardExportMetadata } {
  const snapshot = source.cloneNode(true) as HTMLElement;
  snapshot.removeAttribute('id');
  snapshot.classList.add('export-document');
  snapshot.querySelectorAll('.no-export, .no-print').forEach((node) => node.remove());
  const metadata = Object.freeze({
    reportId: options.reportId,
    locale: options.locale,
    exportedAt,
  });
  snapshot.dataset.exportMetadata = JSON.stringify(metadata);
  snapshot.dataset.exportLocale = options.locale;
  snapshot.setAttribute('lang', options.locale);
  const pageFooters = [...snapshot.querySelectorAll<HTMLElement>('.export-page-footer')];
  if (pageFooters.length) {
    for (const footer of pageFooters) {
      const language = document.createElement('strong');
      language.textContent = languageName;
      const details = document.createElement('span');
      details.textContent = footerText;
      footer.append(language, details);
    }
  } else {
    const footer = document.createElement('footer');
    footer.className = 'export-metadata';
    const language = document.createElement('strong');
    language.textContent = languageName;
    const details = document.createElement('span');
    details.textContent = footerText;
    footer.append(language, details);
    snapshot.append(footer);
  }
  return { element: snapshot, metadata };
}

async function waitForExportReady(): Promise<void> {
  await document.fonts.ready;
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function collectCss(): string {
  const rules: string[] = [];
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) rules.push(rule.cssText);
    } catch {
      // Cross-origin sheets are not used by the dashboard and can be omitted safely.
    }
  }
  return rules.join('\n');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function renderPng(snapshot: HTMLElement, filename: string): Promise<void> {
  const width = snapshot.scrollWidth;
  const height = snapshot.scrollHeight;
  const serialized = new XMLSerializer().serializeToString(snapshot);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style>${collectCss()}</style>${serialized}</div></foreignObject></svg>`;
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.decoding = 'sync';
  await new Promise<void>((resolve, reject) => {
    image.addEventListener('load', () => resolve(), { once: true });
    image.addEventListener('error', () => reject(new Error('Unable to render PNG export.')), {
      once: true,
    });
    image.src = svgUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PNG canvas context is unavailable.');
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Unable to encode PNG export.'))),
      'image/png',
    ),
  );
  downloadBlob(blob, filename);
}

export async function exportDashboard(
  options: Readonly<DashboardExportOptions>,
  source: HTMLElement,
  languageName: string,
  footerText: (exportedAt: string) => string,
): Promise<DashboardExportMetadata> {
  const immutableOptions = createExportOptions(options.locale, options.reportId, options.format);
  const exportedAt = new Date().toISOString();
  const { element, metadata } = createExportSnapshot(
    source,
    immutableOptions,
    languageName,
    footerText(exportedAt),
    exportedAt,
  );
  const host = document.createElement('div');
  host.id = 'export-snapshot';
  host.append(element);
  document.body.append(host);
  document.body.classList.add('exporting');
  try {
    await waitForExportReady();
    const filename = exportFilename(immutableOptions);
    if (immutableOptions.format === 'png') await renderPng(element, filename);
    else {
      const previousTitle = document.title;
      document.title = filename.replace(/\.pdf$/u, '');
      window.print();
      document.title = previousTitle;
    }
    return metadata;
  } finally {
    host.remove();
    document.body.classList.remove('exporting');
  }
}
