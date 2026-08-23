import { describe, expect, it } from 'vitest';
import {
  calculatePageTargetWidth,
  calculateRenderPixelRatio,
  createDirectPdfLink,
} from '../src/report-renderer.js';

describe('report PDF rendering policy', () => {
  it.each([320, 375, 390, 393, 430])(
    'keeps an A4 page inside a %dpx mobile viewport',
    (viewportWidth) => {
      const width = calculatePageTargetWidth(viewportWidth, viewportWidth, 595.28);
      expect(width).toBeLessThanOrEqual(viewportWidth - 12);
      expect(width).toBeGreaterThan(0);
    },
  );

  it('caps mobile DPR at 1.5 and desktop DPR at 2', () => {
    expect(calculateRenderPixelRatio(3, true)).toBe(1.5);
    expect(calculateRenderPixelRatio(3, false)).toBe(2);
    expect(calculateRenderPixelRatio(1, true)).toBe(1);
  });

  it('creates an exact raw-PDF fallback link', () => {
    const url = '/report/reports/report-en.aaaaaaaaaaaa.pdf';
    const link = createDirectPdfLink(url, 'Open PDF');
    expect(link.getAttribute('href')).toBe(url);
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.textContent).toBe('Open PDF');
  });
});
