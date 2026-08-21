const CENTERED_PARAGRAPHS = new Set([
  'SYMBOL WEIGHTS AND PAYOUT DATA',
  'MULTIPLIER WEIGHTS',
  'DASHBOARD SUMMARY',
  'RTP COMPOSITION',
  'MECHANICS OVERVIEW',
  'SYMBOL SET',
  'GAME BOARD (6×5 REEL)',
  'GAME BOARD (6×5 REEL) SYMBOL REFILL TUMBLE LOGIC',
  'SYMBOL REFILL TUMBLE LOGIC',
  'FILE INGESTION WORKSPACE',
  'PROFILE COMPARISON BY CHARACTERISTICS',
  'DEFAULT MULTIPLIER STATISTICS',
  'MULTIPLIER STATISTICS',
  'MULTIPLIER WEIGHTS MULTIPLIER STATISTICS',
  'NEW PAYTABLE PAYOUTS',
  'NEW BASE GAME SYMBOL WEIGHTS',
  'NEW FREE GAME SYMBOL WEIGHTS',
  'NEW BASE GAME SYMBOL WEIGHTS NEW FREE GAME SYMBOL WEIGHTS',
  'HEADLINE FINDINGS',
  'TUMBLE MECHANIC',
  'BATHALA SKILL FEATURE',
  'BATHALA SKILL',
  'SCATTERS',
  'FREE SPINS',
  'MULTIPLIERS',
  'MAX WIN',
  '≥8 REGULAR SYMBOL  BATHALA ELIMINATION  REFILL  ≥8 REGULAR SYMBOL REACTIVATION',
]);

interface PageFrame extends HTMLElement {
  dataset: DOMStringMap & {
    reportWidth?: string;
    reportHeight?: string;
  };
}

function paragraphText(paragraph: HTMLParagraphElement): string {
  return (paragraph.textContent ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function repairInheritedParagraphAlignment(host: HTMLElement): void {
  host.querySelectorAll<HTMLParagraphElement>('section.docx p').forEach((paragraph) => {
    if (paragraph.closest('header, footer') || paragraph.style.textAlign) return;
    paragraph.classList.add('report-default-align');
    if (CENTERED_PARAGRAPHS.has(paragraphText(paragraph))) {
      paragraph.classList.add('report-centered-align');
    }
  });
}

function repairPageHeaders(host: HTMLElement): void {
  host.querySelectorAll<HTMLParagraphElement>('section.docx header p').forEach((paragraph) => {
    const spans = Array.from(paragraph.querySelectorAll<HTMLSpanElement>(':scope > span'));
    const rightStart = spans.findIndex((span) => span.textContent?.includes('LEON'));
    if (!paragraph.textContent?.includes('LUCKY888') || rightStart < 1) return;

    const left = document.createElement('span');
    const right = document.createElement('span');
    left.className = 'report-header-left';
    right.className = 'report-header-right';
    spans.slice(0, rightStart).forEach((span) => {
      if (span.textContent?.trim()) left.append(span);
    });
    spans.slice(rightStart).forEach((span) => right.append(span));
    paragraph.replaceChildren(left, right);
    paragraph.classList.add('report-header-line');
  });
}

function frameRenderedPages(host: HTMLElement): PageFrame[] {
  return Array.from(host.querySelectorAll<HTMLElement>('.docx-wrapper > section.docx')).map(
    (page) => {
      const bounds = page.getBoundingClientRect();
      const frame = document.createElement('div') as PageFrame;
      frame.className = 'report-page-frame';
      frame.dataset.reportWidth = String(bounds.width);
      frame.dataset.reportHeight = String(bounds.height);
      page.before(frame);
      frame.append(page);
      frame.dataset.reportWidth = String(page.offsetWidth);
      frame.dataset.reportHeight = String(page.offsetHeight);
      return frame;
    },
  );
}

function targetPageWidth(viewportWidth: number): number {
  if (viewportWidth <= 900) {
    const gutter = viewportWidth <= 480 ? 10 : 14;
    return viewportWidth - gutter * 2;
  }
  return Math.min(1450, viewportWidth * 0.82);
}

function resizeFrames(frames: readonly PageFrame[]): void {
  frames.forEach((frame) => {
    const page = frame.firstElementChild;
    if (!(page instanceof HTMLElement)) return;
    frame.dataset.reportWidth = String(page.offsetWidth);
    frame.dataset.reportHeight = String(page.offsetHeight);
  });
  const firstFrame = frames[0];
  if (!firstFrame) return;
  const intrinsicWidth = Number(firstFrame.dataset.reportWidth);
  const scale = targetPageWidth(window.innerWidth) / intrinsicWidth;
  document.documentElement.style.setProperty('--report-scale', String(scale));
  frames.forEach((frame) => {
    const width = Number(frame.dataset.reportWidth);
    const height = Number(frame.dataset.reportHeight);
    frame.style.width = `${width * scale}px`;
    frame.style.height = `${height * scale}px`;
  });
}

export function enhanceReportPresentation(host: HTMLElement): void {
  repairPageHeaders(host);
  repairInheritedParagraphAlignment(host);
  const frames = frameRenderedPages(host);
  resizeFrames(frames);

  let resizeFrame = 0;
  const scheduleResize = (): void => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => resizeFrames(frames));
  };
  window.addEventListener('resize', scheduleResize, { passive: true });
  window.addEventListener('orientationchange', scheduleResize, { passive: true });
  requestAnimationFrame(scheduleResize);
}
