import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { parseReportManifest, type ReportManifest } from './report-manifest.js';
import type { ReportLocale } from './report-localization.js';

GlobalWorkerOptions.workerSrc = workerUrl;

async function fetchManifest(): Promise<ReportManifest> {
  const response = await fetch(`${import.meta.env.BASE_URL}reports/report-manifest.json`, {
    cache: 'no-cache',
  });
  if (!response.ok) throw new Error(`Report manifest request failed: ${response.status}`);
  return parseReportManifest(await response.json());
}

function pageTargetWidth(host: HTMLElement, intrinsicWidth: number): number {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const available = Math.max(
    280,
    Math.min(host.clientWidth, viewportWidth) - (viewportWidth <= 520 ? 12 : 32),
  );
  return Math.min(1450, available, intrinsicWidth * 2.15);
}

async function renderPage(
  page: PDFPageProxy,
  host: HTMLElement,
  generationIsCurrent: () => boolean,
): Promise<RenderTask | undefined> {
  const intrinsic = page.getViewport({ scale: 1 });
  const cssScale = pageTargetWidth(host, intrinsic.width) / intrinsic.width;
  const cssViewport = page.getViewport({ scale: cssScale });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
  const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });

  const shell = document.createElement('section');
  shell.className = 'pdf-page';
  shell.dataset.pageNumber = String(page.pageNumber);
  shell.setAttribute('aria-label', `Page ${page.pageNumber}`);
  shell.style.setProperty('--pdf-page-ratio', `${intrinsic.width} / ${intrinsic.height}`);
  shell.style.width = `${cssViewport.width}px`;
  shell.style.height = `${cssViewport.height}px`;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(renderViewport.width);
  canvas.height = Math.ceil(renderViewport.height);
  canvas.style.width = `${cssViewport.width}px`;
  canvas.style.height = `${cssViewport.height}px`;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D rendering is unavailable.');
  shell.append(canvas);

  const textContainer = document.createElement('div');
  textContainer.className = 'textLayer';
  shell.append(textContainer);
  host.append(shell);

  const renderTask = page.render({ canvasContext: context, viewport: renderViewport, canvas });
  await renderTask.promise;
  if (!generationIsCurrent()) return renderTask;
  const textContent = await page.getTextContent();
  if (!generationIsCurrent()) return renderTask;
  await new TextLayer({
    textContentSource: textContent,
    container: textContainer,
    viewport: cssViewport,
  }).render();
  return renderTask;
}

export class PdfReportViewer {
  readonly #host: HTMLElement;
  #loadingTask?: PDFDocumentLoadingTask;
  #generation = 0;
  #manifest?: ReportManifest;
  #currentUrl?: string;

  public constructor(host: HTMLElement) {
    this.#host = host;
  }

  public get currentUrl(): string | undefined {
    return this.#currentUrl;
  }

  public async load(locale: ReportLocale): Promise<void> {
    const generation = ++this.#generation;
    if (!this.#manifest) this.#manifest = await fetchManifest();
    const entry = this.#manifest.documents[locale];
    const url = `${import.meta.env.BASE_URL}reports/${entry.file}`;
    this.#currentUrl = url;
    this.#host.replaceChildren();
    await this.#loadingTask?.destroy();
    const task = getDocument({ url });
    this.#loadingTask = task;
    const document = await task.promise;
    if (generation !== this.#generation) {
      await task.destroy();
      return;
    }
    if (document.numPages !== entry.pages) {
      await task.destroy();
      throw new Error(`Manifest expected ${entry.pages} pages; PDF contains ${document.numPages}.`);
    }
    const current = (): boolean => generation === this.#generation;
    for (let pageNumber = 1; pageNumber <= document.numPages && current(); pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      await renderPage(page, this.#host, current);
      page.cleanup();
    }
  }
}
