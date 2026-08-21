import { renderAsync } from 'docx-preview';

interface ReportManifest {
  readonly source: string;
  readonly sha256: string;
  readonly generatedAt: string;
}

export async function renderReport(host: HTMLElement): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const manifestResponse = await fetch(`${base}report/report-manifest.json`, { cache: 'no-cache' });
  if (!manifestResponse.ok)
    throw new Error(`Report manifest request failed: ${manifestResponse.status}`);
  const manifest = (await manifestResponse.json()) as ReportManifest;
  const documentResponse = await fetch(`${base}report/${manifest.source}`, {
    cache: 'force-cache',
  });
  if (!documentResponse.ok)
    throw new Error(`Report document request failed: ${documentResponse.status}`);
  await renderAsync(await documentResponse.arrayBuffer(), host, undefined, {
    className: 'docx',
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: false,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: false,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    useBase64URL: true,
    experimental: true,
  });
  host.dataset.documentSha256 = manifest.sha256;
}
