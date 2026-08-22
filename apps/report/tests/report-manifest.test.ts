import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseReportManifest } from '../src/report-manifest.js';

const hash = 'a'.repeat(64);

describe('report PDF manifest', () => {
  it('accepts both deployed locales', () => {
    const manifest = parseReportManifest({
      version: 1,
      generatedAt: '2026-08-22T00:00:00Z',
      documents: {
        en: { label: 'English', file: 'report-en.aaaaaaaaaaaa.pdf', sha256: hash, pages: 12 },
        'zh-CN': {
          label: '简体中文',
          file: 'report-zh-CN.aaaaaaaaaaaa.pdf',
          sha256: hash,
          pages: 12,
        },
      },
    });
    expect(Object.keys(manifest.documents)).toEqual(['en', 'zh-CN']);
  });

  it('rejects a missing locale', () => {
    expect(() =>
      parseReportManifest({ version: 1, generatedAt: '', documents: { en: {} } }),
    ).toThrow(/invalid schema/u);
  });

  it('points the deployed manifest at existing fingerprinted PDFs', () => {
    const reportsDirectory = resolve(import.meta.dirname, '../public/reports');
    const manifest = parseReportManifest(
      JSON.parse(readFileSync(resolve(reportsDirectory, 'report-manifest.json'), 'utf8')),
    );
    for (const entry of Object.values(manifest.documents)) {
      expect(readFileSync(resolve(reportsDirectory, entry.file)).byteLength).toBeGreaterThan(0);
    }
  });
});
