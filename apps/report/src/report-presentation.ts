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

// Word stored these as rendered page boundaries. docx-preview drops those markers because the
// report is nested in layout tables, so they are restored only for paged-media output.
const PRINT_PAGE_STARTS = [
  { page: 2, prefix: 'CORE MECHANICS AND REEL LOGIC SPECIFIC TO THE BATHALA SLOT MACHINE' },
  { page: 3, prefix: 'TUMBLE WIN:' },
  { page: 4, prefix: 'C. APPRAISAL' },
  { page: 5, prefix: 'DASHBOARD SUMMARY' },
  { page: 6, prefix: '2. SUMMARY OF OBSERVATIONS' },
  { page: 7, prefix: 'C. SYMBOL ELIMINATION (BATHALA SKILL)' },
  { page: 8, prefix: '3. EVALUATION & RTP TUNING' },
  { page: 9, prefix: 'B. MULTIPLIER TUNING' },
  { page: 11, prefix: 'NEW BASE GAME SYMBOL WEIGHTS NEW FREE GAME SYMBOL WEIGHTS' },
  { page: 12, prefix: 'SIM2 (TUMBLE-LED) DELIVERS A MUCH MORE ACTIVE CORE LOOP' },
] as const;

interface PageFrame extends HTMLElement {
  dataset: DOMStringMap & {
    reportWidth?: string;
    reportHeight?: string;
  };
}

function paragraphText(paragraph: HTMLParagraphElement): string {
  return (paragraph.textContent ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function repairDrawingAnchors(host: HTMLElement): void {
  host.querySelectorAll<HTMLParagraphElement>('section.docx p').forEach((paragraph) => {
    const hasPositionedDrawing = Array.from(paragraph.querySelectorAll('img')).some((image) => {
      const wrapper = image.parentElement;
      return wrapper instanceof HTMLElement && wrapper.offsetWidth === 0;
    });
    if (hasPositionedDrawing) paragraph.classList.add('report-drawing-anchor');
  });
}

function repairSplitDrawings(host: HTMLElement): void {
  const images = Array.from(host.querySelectorAll<HTMLImageElement>('section.docx img'));
  images.forEach((image, index) => {
    const preceding = images
      .slice(0, index)
      .reverse()
      .find((candidate) => candidate.src === image.src);
    if (!preceding) return;
    const targetAnchor = preceding.closest<HTMLParagraphElement>('p.report-drawing-anchor');
    const sourceAnchor = image.closest<HTMLParagraphElement>('p.report-drawing-anchor');
    const wrapper = image.parentElement;
    if (
      !targetAnchor ||
      !sourceAnchor ||
      sourceAnchor === targetAnchor ||
      sourceAnchor.textContent?.trim()
    )
      return;
    if (wrapper instanceof HTMLElement) targetAnchor.append(wrapper);
    if (!sourceAnchor.querySelector('img, svg')) sourceAnchor.remove();
  });
}

function repairNarrativeFloats(host: HTMLElement): void {
  host.querySelectorAll<HTMLImageElement>('section.docx img').forEach((image) => {
    const wrapper = image.parentElement;
    if (!(wrapper instanceof HTMLElement) || getComputedStyle(wrapper).float !== 'left') return;
    wrapper.style.float = 'right';
    wrapper.classList.add('report-narrative-float');
  });
}

function drawingCaptionParts(text: string): string[] | undefined {
  if (text.startsWith('GAME BOARD (6×5 REEL)'))
    return ['GAME BOARD (6×5 REEL)', 'SYMBOL REFILL TUMBLE LOGIC'];
  if (text.startsWith('TUMBLE WIN:')) {
    const split = text.indexOf('POST-WIN');
    return split > 0 ? [text.slice(0, split).trim(), text.slice(split)] : [text];
  }
  if (text.startsWith('AGGREGATED DATA'))
    return ['AGGREGATED DATA', 'INDIVIDUAL SPIN DATA', 'SPIN HISTORY'];
  if (
    [
      'FILE INGESTION WORKSPACE',
      'DASHBOARD SUMMARY',
      'RTP COMPOSITION',
      'MECHANICS OVERVIEW',
    ].includes(text)
  )
    return [text];
  return undefined;
}

function repairDrawingCaptions(host: HTMLElement): void {
  host
    .querySelectorAll<HTMLParagraphElement>('section.docx p.report-drawing-anchor')
    .forEach((anchor) => {
      const text = paragraphText(anchor);
      const parts = drawingCaptionParts(text);
      if (!parts) return;
      Array.from(anchor.childNodes).forEach((node) => {
        if (
          node instanceof HTMLElement &&
          (node.matches('img, svg') || node.querySelector('img, svg'))
        )
          return;
        node.remove();
      });
      const caption = document.createElement('span');
      caption.className = 'report-drawing-caption';
      caption.style.setProperty('--report-caption-columns', String(parts.length));
      parts.forEach((part) => {
        const segment = document.createElement('span');
        segment.textContent = part;
        caption.append(segment);
      });
      anchor.prepend(caption);
    });
}

function repairDrawingSpacerRuns(host: HTMLElement): void {
  host
    .querySelectorAll<HTMLParagraphElement>('section.docx p.report-drawing-anchor')
    .forEach((anchor) => {
      const spacers: HTMLParagraphElement[] = [];
      let sibling = anchor.nextElementSibling;
      while (
        sibling instanceof HTMLParagraphElement &&
        !sibling.textContent?.trim() &&
        !sibling.querySelector('img, svg')
      ) {
        spacers.push(sibling);
        sibling = sibling.nextElementSibling;
      }
      const firstSpacer = spacers[0];
      if (!firstSpacer) return;

      const anchorBottom = anchor.getBoundingClientRect().bottom;
      const mediaBottom = Math.max(
        anchorBottom,
        ...Array.from(anchor.querySelectorAll('img, svg')).map(
          (media) => media.getBoundingClientRect().bottom,
        ),
      );
      firstSpacer.classList.add('report-drawing-spacer');
      firstSpacer.style.setProperty(
        '--report-spacer-height',
        `${Math.ceil(mediaBottom - anchorBottom) + 14}px`,
      );
      spacers.slice(1).forEach((spacer) => spacer.classList.add('report-drawing-spacer--empty'));
    });
}

function markPrintPageStarts(host: HTMLElement): void {
  const paragraphs = Array.from(host.querySelectorAll<HTMLParagraphElement>('section.docx p'));
  PRINT_PAGE_STARTS.forEach(({ page, prefix }) => {
    const paragraph = paragraphs.find((candidate) => paragraphText(candidate).startsWith(prefix));
    if (!paragraph) return;
    paragraph.classList.add('report-print-page-start');
    paragraph.dataset.reportPage = String(page);
    let ancestor = paragraph.parentElement;
    while (ancestor && !ancestor.matches('article')) {
      if (ancestor instanceof HTMLTableElement) ancestor.classList.add('report-breakable-layout');
      ancestor = ancestor.parentElement;
    }
  });
}

function repairOverflowingMedia(page: HTMLElement): void {
  const pageRect = page.getBoundingClientRect();
  const pageStyle = getComputedStyle(page);
  const leftLimit = pageRect.left + Number.parseFloat(pageStyle.paddingLeft);
  const rightLimit = pageRect.right - Number.parseFloat(pageStyle.paddingRight);
  page.querySelectorAll<HTMLParagraphElement>('p.report-drawing-anchor').forEach((anchor) => {
    const media = Array.from(anchor.querySelectorAll<HTMLElement>('img, svg'));
    const wrappers = Array.from(
      new Set(
        media
          .map((element) => element.parentElement)
          .filter((element): element is HTMLElement => element instanceof HTMLElement),
      ),
    );
    if (media.length === 0 || wrappers.length === 0) return;
    const bounds = media.map((element) => element.getBoundingClientRect());
    const groupLeft = Math.min(...bounds.map((bound) => bound.left));
    const groupRight = Math.max(...bounds.map((bound) => bound.right));
    const groupWidth = groupRight - groupLeft;
    const availableWidth = rightLimit - leftLimit;
    const scale = Math.min(1, availableWidth / groupWidth);
    const targetLeft = Math.min(Math.max(groupLeft, leftLimit), rightLimit - groupWidth * scale);
    if (scale === 1 && Math.abs(targetLeft - groupLeft) < 1) return;

    wrappers.forEach((wrapper) => {
      const origin = wrapper.getBoundingClientRect().left;
      const translatedOrigin = targetLeft + (origin - groupLeft) * scale;
      wrapper.style.transformOrigin = 'top left';
      wrapper.style.transform = `translateX(${translatedOrigin - origin}px) scale(${scale})`;
      wrapper.dataset.reportMediaRepaired = 'true';
    });
  });
}

function reportDevelopmentOverflow(page: HTMLElement): void {
  if (!import.meta.env.DEV) return;
  const pageRect = page.getBoundingClientRect();
  page.querySelectorAll<HTMLElement>('img, svg, table').forEach((element) => {
    const bounds = element.getBoundingClientRect();
    const horizontalOverflow = Math.max(
      pageRect.left - bounds.left,
      bounds.right - pageRect.right,
      0,
    );
    if (horizontalOverflow <= 1) return;
    const precedingStarts = Array.from(
      page.querySelectorAll<HTMLElement>('.report-print-page-start'),
    ).filter((start) =>
      Boolean(start.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
    const logicalPage = Number(precedingStarts.at(-1)?.dataset.reportPage ?? 1);
    console.warn(
      `[report] Page ${logicalPage} overflow: ${element.tagName} exceeds the page by ` +
        `${Math.ceil(horizontalOverflow)}px horizontally`,
      element,
    );
  });
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
  repairDrawingAnchors(host);
  repairSplitDrawings(host);
  repairNarrativeFloats(host);
  repairDrawingCaptions(host);
  repairInheritedParagraphAlignment(host);
  repairDrawingSpacerRuns(host);
  markPrintPageStarts(host);
  host.querySelectorAll<HTMLElement>('section.docx').forEach((page) => {
    repairOverflowingMedia(page);
    reportDevelopmentOverflow(page);
  });
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
