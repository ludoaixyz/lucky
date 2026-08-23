import type * as PdfJsTypes from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { parseReportManifest, type ReportManifest } from './report-manifest.js';
import type { ReportLocale } from './report-localization.js';

type PDFDocumentLoadingTask = PdfJsTypes.PDFDocumentLoadingTask;
type PDFDocumentProxy = PdfJsTypes.PDFDocumentProxy;
type PDFPageProxy = PdfJsTypes.PDFPageProxy;
type PageViewport = PdfJsTypes.PageViewport;
type RenderTask = PdfJsTypes.RenderTask;
type TextLayer = PdfJsTypes.TextLayer;
type PdfJsModule = typeof PdfJsTypes;

let pdfJsPromise: Promise<PdfJsModule> | undefined;

async function loadPdfJs(): Promise<PdfJsModule> {
  pdfJsPromise ??= import('pdfjs-dist/legacy/build/pdf.mjs')
    .then((pdfJs) => {
      pdfJs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfJs;
    })
    .catch((error: unknown) => {
      pdfJsPromise = undefined;
      throw error;
    });
  return pdfJsPromise;
}

type PageStatus = 'pending' | 'queued' | 'rendering' | 'rendered' | 'error';

interface PageState {
  readonly pageNumber: number;
  readonly shell: HTMLElement;
  status: PageStatus;
  intrinsicWidth: number;
  intrinsicHeight: number;
  renderTask: RenderTask | undefined;
  textLayer: TextLayer | undefined;
}

export interface PdfViewerMessages {
  readonly openPdf: string;
  readonly pageError: string;
}

const PAGE_STATE_CLASSES = [
  'pdf-page--pending',
  'pdf-page--queued',
  'pdf-page--loading',
  'pdf-page--rendered',
  'pdf-page--error',
] as const;

async function fetchManifest(): Promise<ReportManifest> {
  const response = await fetch(`${import.meta.env.BASE_URL}reports/report-manifest.json`, {
    cache: 'no-cache',
  });
  if (!response.ok) throw new Error(`Report manifest request failed: ${response.status}`);
  return parseReportManifest(await response.json());
}

export function calculatePageTargetWidth(
  hostWidth: number,
  viewportWidth: number,
  intrinsicWidth: number,
): number {
  const safeViewportWidth = Math.max(1, viewportWidth);
  const containerWidth = hostWidth > 0 ? Math.min(hostWidth, safeViewportWidth) : safeViewportWidth;
  const horizontalMargin = safeViewportWidth <= 520 ? 12 : 32;
  const availableWidth = Math.max(1, containerWidth - horizontalMargin);
  return Math.min(1450, availableWidth, intrinsicWidth * 2.15);
}

export function calculateRenderPixelRatio(devicePixelRatio: number, mobile: boolean): number {
  const safeRatio = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
  return Math.min(safeRatio, mobile ? 1.5 : 2);
}

function pageTargetWidth(host: HTMLElement, intrinsicWidth: number): number {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  return calculatePageTargetWidth(host.clientWidth, viewportWidth, intrinsicWidth);
}

function renderPixelRatio(): number {
  return calculateRenderPixelRatio(
    window.devicePixelRatio || 1,
    window.matchMedia('(max-width: 820px)').matches,
  );
}

function renderConcurrency(): number {
  return window.matchMedia('(max-width: 820px)').matches ? 1 : 2;
}

function isCancellation(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'RenderingCancelledException' ||
      error.name === 'AbortException' ||
      /cancelled|canceled|worker was destroyed/iu.test(error.message))
  );
}

function setPageStatus(state: PageState, status: PageStatus): void {
  state.status = status;
  state.shell.classList.remove(...PAGE_STATE_CLASSES);
  state.shell.classList.add(status === 'rendering' ? 'pdf-page--loading' : `pdf-page--${status}`);
}

function createPageShell(
  host: HTMLElement,
  pageNumber: number,
  intrinsicWidth: number,
  intrinsicHeight: number,
): PageState {
  const shell = document.createElement('section');
  shell.className = 'pdf-page pdf-page--pending';
  shell.dataset.pageNumber = String(pageNumber);
  shell.setAttribute('aria-label', `Page ${pageNumber}`);
  const state: PageState = {
    pageNumber,
    shell,
    status: 'pending',
    intrinsicWidth,
    intrinsicHeight,
    renderTask: undefined,
    textLayer: undefined,
  };
  sizePageShell(host, state);
  return state;
}

function sizePageShell(host: HTMLElement, state: PageState): void {
  state.shell.style.setProperty(
    '--pdf-page-ratio',
    `${state.intrinsicWidth} / ${state.intrinsicHeight}`,
  );
  state.shell.style.width = `${pageTargetWidth(host, state.intrinsicWidth)}px`;
}

export function createDirectPdfLink(url: string, label: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

function showPageError(state: PageState, message: string, openPdf: string, url: string): void {
  setPageStatus(state, 'error');
  const text = document.createElement('p');
  text.textContent = message;
  const link = createDirectPdfLink(url, openPdf);
  state.shell.replaceChildren(text, link);
}

export class PdfReportViewer {
  readonly #host: HTMLElement;
  #loadingTask: PDFDocumentLoadingTask | undefined;
  #document: PDFDocumentProxy | undefined;
  #pdfJs: PdfJsModule | undefined;
  #generation = 0;
  #manifest?: ReportManifest;
  #manifestPromise: Promise<ReportManifest> | undefined;
  #currentUrl?: string;
  #currentLocale?: ReportLocale;
  #currentMessages?: PdfViewerMessages;
  #observer: IntersectionObserver | undefined;
  #fallbackViewportListener: (() => void) | undefined;
  #resizeListener: (() => void) | undefined;
  #resizeTimer: number | undefined;
  #states: PageState[] = [];
  #queue: PageState[] = [];
  #activeRenderCount = 0;
  #maxConcurrentRenders = 1;

  public constructor(host: HTMLElement) {
    this.#host = host;
  }

  public get currentUrl(): string | undefined {
    return this.#currentUrl;
  }

  public async load(locale: ReportLocale, messages: PdfViewerMessages): Promise<void> {
    const generation = ++this.#generation;
    const knownEntry = this.#manifest?.documents[locale];
    if (knownEntry) {
      this.#currentUrl = `${import.meta.env.BASE_URL}reports/${knownEntry.file}`;
    }
    await this.#cancelCurrentDocument();
    if (generation !== this.#generation) return;
    this.#host.replaceChildren();
    this.#currentLocale = locale;
    this.#currentMessages = messages;

    let manifest: ReportManifest;
    try {
      this.#manifestPromise ??= fetchManifest();
      manifest = this.#manifest ?? (await this.#manifestPromise);
      this.#manifest = manifest;
    } catch (error) {
      this.#manifestPromise = undefined;
      if (generation === this.#generation) {
        console.error('[report] Failed to load report manifest', {
          locale,
          stage: 'manifest',
          error,
        });
      }
      throw error;
    }
    if (generation !== this.#generation) return;

    const entry = manifest.documents[locale];
    const url = `${import.meta.env.BASE_URL}reports/${entry.file}`;
    this.#currentUrl = url;

    let pdfJs: PdfJsModule;
    try {
      pdfJs = await loadPdfJs();
    } catch (error) {
      if (generation !== this.#generation) return;
      console.error('[report] Failed to initialize PDF.js', {
        locale,
        url,
        stage: 'pdfjs-initialization',
        error,
      });
      throw error;
    }
    if (generation !== this.#generation) return;
    this.#pdfJs = pdfJs;

    const loadingTask = pdfJs.getDocument({ url });
    this.#loadingTask = loadingTask;
    let pdfDocument: PDFDocumentProxy;
    try {
      pdfDocument = await loadingTask.promise;
    } catch (error) {
      if (generation !== this.#generation || isCancellation(error)) return;
      console.error('[report] Failed to load report PDF', {
        locale,
        url,
        stage: 'document',
        error,
      });
      throw error;
    }
    if (generation !== this.#generation) return;
    this.#document = pdfDocument;

    if (pdfDocument.numPages !== entry.pages) {
      const error = new Error(
        `Manifest expected ${entry.pages} pages; PDF contains ${pdfDocument.numPages}.`,
      );
      console.error('[report] Report page-count mismatch', {
        locale,
        url,
        stage: 'page-count',
        error,
      });
      throw error;
    }

    const firstPage = await pdfDocument.getPage(1);
    if (generation !== this.#generation) {
      firstPage.cleanup();
      return;
    }
    const firstViewport = firstPage.getViewport({ scale: 1 });
    this.#states = Array.from({ length: pdfDocument.numPages }, (_, index) =>
      createPageShell(this.#host, index + 1, firstViewport.width, firstViewport.height),
    );
    this.#host.append(...this.#states.map((state) => state.shell));
    this.#maxConcurrentRenders = renderConcurrency();

    const firstState = this.#states[0];
    if (!firstState) throw new Error('The report PDF did not create a first-page shell.');
    try {
      await this.#renderPage(firstState, generation, firstPage);
    } catch (error) {
      if (generation !== this.#generation || isCancellation(error)) return;
      this.#logPageError(1, 'canvas', error);
      showPageError(firstState, messages.pageError, messages.openPdf, url);
      throw error;
    }
    if (generation !== this.#generation) return;

    this.#debug(`page 1 rendered; ${pdfDocument.numPages} pages available`, {
      locale,
      dpr: renderPixelRatio(),
      viewportWidth: document.documentElement.clientWidth || window.innerWidth,
    });
    this.#observePendingPages(generation);
    this.#watchViewportChanges(generation);
  }

  public async destroy(): Promise<void> {
    ++this.#generation;
    await this.#cancelCurrentDocument();
    this.#host.replaceChildren();
  }

  async #renderPage(
    state: PageState,
    generation: number,
    suppliedPage?: PDFPageProxy,
  ): Promise<void> {
    if (generation !== this.#generation || !this.#document) return;
    setPageStatus(state, 'rendering');
    let page: PDFPageProxy | undefined = suppliedPage;
    try {
      page ??= await this.#document.getPage(state.pageNumber);
      if (generation !== this.#generation) return;

      const intrinsic = page.getViewport({ scale: 1 });
      state.intrinsicWidth = intrinsic.width;
      state.intrinsicHeight = intrinsic.height;
      sizePageShell(this.#host, state);
      const cssScale = pageTargetWidth(this.#host, intrinsic.width) / intrinsic.width;
      const cssViewport = page.getViewport({ scale: cssScale });
      const pixelRatio = renderPixelRatio();
      const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(renderViewport.width);
      canvas.height = Math.ceil(renderViewport.height);
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Canvas 2D rendering is unavailable.');

      const textContainer = document.createElement('div');
      textContainer.className = 'textLayer';
      state.shell.replaceChildren(canvas, textContainer);

      const renderTask = page.render({ canvasContext: context, viewport: renderViewport, canvas });
      state.renderTask = renderTask;
      await renderTask.promise;
      state.renderTask = undefined;
      if (generation !== this.#generation) return;

      setPageStatus(state, 'rendered');
      this.#debug(`page ${state.pageNumber} canvas rendered`);
      void this.#renderTextLayer(page, state, cssViewport, generation, textContainer);
      page = undefined;
    } finally {
      state.renderTask = undefined;
      page?.cleanup();
    }
  }

  async #renderTextLayer(
    page: PDFPageProxy,
    state: PageState,
    viewport: PageViewport,
    generation: number,
    container: HTMLElement,
  ): Promise<void> {
    try {
      const textContent = await page.getTextContent();
      if (generation !== this.#generation) return;
      const TextLayerConstructor = this.#pdfJs?.TextLayer;
      if (!TextLayerConstructor) return;
      const textLayer = new TextLayerConstructor({
        textContentSource: textContent,
        container,
        viewport,
      });
      state.textLayer = textLayer;
      await textLayer.render();
      if (generation === this.#generation) this.#debug(`page ${state.pageNumber} text rendered`);
    } catch (error) {
      if (generation === this.#generation && !isCancellation(error)) {
        console.warn('[report] Failed to render PDF page text layer', {
          locale: this.#currentLocale,
          url: this.#currentUrl,
          page: state.pageNumber,
          stage: 'text-layer',
          error,
        });
      }
    } finally {
      state.textLayer = undefined;
      page.cleanup();
    }
  }

  #observePendingPages(generation: number): void {
    const preloadMargin = Math.max(600, Math.round(window.innerHeight * 1.5));
    if (typeof IntersectionObserver === 'function') {
      this.#observer = new IntersectionObserver(
        (entries) => {
          if (generation !== this.#generation) return;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
            const state = this.#states[pageNumber - 1];
            if (state) this.#queuePage(state, generation);
            this.#observer?.unobserve(entry.target);
          }
        },
        { rootMargin: `${preloadMargin}px 0px`, threshold: 0.01 },
      );
      for (const state of this.#states.slice(1)) this.#observer.observe(state.shell);
      return;
    }

    const inspectViewport = (): void => {
      if (generation !== this.#generation) return;
      for (const state of this.#states.slice(1)) {
        if (state.status !== 'pending') continue;
        const bounds = state.shell.getBoundingClientRect();
        if (bounds.top <= window.innerHeight + preloadMargin && bounds.bottom >= -preloadMargin) {
          this.#queuePage(state, generation);
        }
      }
    };
    this.#fallbackViewportListener = inspectViewport;
    window.addEventListener('scroll', inspectViewport, { passive: true });
    inspectViewport();
  }

  #queuePage(state: PageState, generation: number): void {
    if (generation !== this.#generation || state.status !== 'pending') return;
    setPageStatus(state, 'queued');
    this.#queue.push(state);
    this.#debug(`page ${state.pageNumber} entered preload zone`);
    this.#drainQueue(generation);
  }

  #drainQueue(generation: number): void {
    while (
      generation === this.#generation &&
      this.#activeRenderCount < this.#maxConcurrentRenders &&
      this.#queue.length > 0
    ) {
      const state = this.#queue.shift();
      if (!state || state.status !== 'queued') continue;
      this.#activeRenderCount += 1;
      void this.#renderQueuedPage(state, generation);
    }
  }

  async #renderQueuedPage(state: PageState, generation: number): Promise<void> {
    try {
      await this.#renderPage(state, generation);
    } catch (error) {
      if (generation === this.#generation && !isCancellation(error)) {
        this.#logPageError(state.pageNumber, 'canvas', error);
        if (this.#currentMessages && this.#currentUrl) {
          showPageError(
            state,
            this.#currentMessages.pageError,
            this.#currentMessages.openPdf,
            this.#currentUrl,
          );
        }
      }
    } finally {
      if (generation === this.#generation) {
        this.#activeRenderCount = Math.max(0, this.#activeRenderCount - 1);
        this.#drainQueue(generation);
      }
    }
  }

  #watchViewportChanges(generation: number): void {
    const handleResize = (): void => {
      if (this.#resizeTimer) window.clearTimeout(this.#resizeTimer);
      this.#resizeTimer = window.setTimeout(() => {
        if (generation !== this.#generation) return;
        for (const state of this.#states) {
          if (state.status === 'pending' || state.status === 'queued') {
            sizePageShell(this.#host, state);
          }
        }
        this.#fallbackViewportListener?.();
      }, 160);
    };
    this.#resizeListener = handleResize;
    window.addEventListener('resize', handleResize, { passive: true });
  }

  async #cancelCurrentDocument(): Promise<void> {
    this.#observer?.disconnect();
    this.#observer = undefined;
    if (this.#fallbackViewportListener) {
      window.removeEventListener('scroll', this.#fallbackViewportListener);
      this.#fallbackViewportListener = undefined;
    }
    if (this.#resizeListener) {
      window.removeEventListener('resize', this.#resizeListener);
      this.#resizeListener = undefined;
    }
    if (this.#resizeTimer) {
      window.clearTimeout(this.#resizeTimer);
      this.#resizeTimer = undefined;
    }
    for (const state of this.#states) {
      state.renderTask?.cancel();
      state.textLayer?.cancel();
    }
    this.#states = [];
    this.#queue = [];
    this.#activeRenderCount = 0;
    this.#document = undefined;
    this.#pdfJs = undefined;
    const loadingTask = this.#loadingTask;
    this.#loadingTask = undefined;
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch (error) {
        if (!isCancellation(error)) {
          console.warn('[report] Failed to cleanly destroy the previous PDF document', { error });
        }
      }
    }
  }

  #logPageError(page: number, stage: 'canvas', error: unknown): void {
    console.error('[report] Failed to render PDF page', {
      locale: this.#currentLocale,
      url: this.#currentUrl,
      page,
      stage,
      error,
    });
  }

  #debug(message: string, details?: object): void {
    if (import.meta.env.DEV) console.debug(`[report] ${message}`, details ?? '');
  }
}
