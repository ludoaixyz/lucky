import type { ReportLocale } from './report-localization.js';

export interface ReportDocumentManifestEntry {
  readonly label: string;
  readonly file: string;
  readonly sha256: string;
  readonly pages: number;
}

export interface ReportManifest {
  readonly version: 1;
  readonly generatedAt: string;
  readonly documents: Record<ReportLocale, ReportDocumentManifestEntry>;
}

function isEntry(value: unknown): value is ReportDocumentManifestEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ReportDocumentManifestEntry>;
  return (
    typeof candidate.label === 'string' &&
    typeof candidate.file === 'string' &&
    /^report-(?:en|zh-CN)\.[a-f0-9]{12}\.pdf$/u.test(candidate.file) &&
    typeof candidate.sha256 === 'string' &&
    /^[a-f0-9]{64}$/u.test(candidate.sha256) &&
    Number.isInteger(candidate.pages) &&
    Number(candidate.pages) > 0
  );
}

export function parseReportManifest(value: unknown): ReportManifest {
  if (!value || typeof value !== 'object') throw new Error('Report manifest is not an object.');
  const manifest = value as Partial<ReportManifest>;
  if (
    manifest.version !== 1 ||
    typeof manifest.generatedAt !== 'string' ||
    !manifest.documents ||
    !isEntry(manifest.documents.en) ||
    !isEntry(manifest.documents['zh-CN'])
  ) {
    throw new Error('Report manifest has an invalid schema.');
  }
  return manifest as ReportManifest;
}
