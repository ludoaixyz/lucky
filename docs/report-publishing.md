# Lucky888 report publishing

The canonical editorial source remains `Lucky888_Bathala_Prototype_Analysis_HTML.docx` at the repository root. The website does not render that DOCX or translate content at runtime. It displays committed, fingerprinted PDFs through PDF.js.

## Prerequisites

- Windows with Microsoft Word desktop installed and licensed
- Node.js 22 or newer
- Python 3 with `pypdf` (`python -m pip install -r scripts/report-i18n/requirements.txt`)

Word automation is intentionally local-only. CI and GitHub Pages consume the already published PDFs and never need Office.

## Editing and translation workflow

1. Edit and save `Lucky888_Bathala_Prototype_Analysis_HTML.docx`.
2. Run `npm run report:i18n:extract`. This re-extracts English units and safely synchronizes `report-i18n/zh-CN.json`: unchanged translations are retained, changed source is marked `stale`, and new source is marked `missing`.
3. Run `npm run report:i18n:status` and update every `missing` or `stale` Chinese entry. Preserve the numbered formatting markers embedded in `taggedSource`; validation rejects reordered or missing markers and changed protected numbers, percentages, multipliers, or URLs.
4. Run `npm run report:i18n:validate`.
5. Run `npm run report:publish:local` on Windows. The command builds localized DOCX files, asks Word to export both PDFs, fingerprints them, and updates `apps/report/public/reports/report-manifest.json`.
6. Visually inspect both PDFs in `generated/report-pdf/`, especially page breaks, tables, images, headers, and footers.
7. Commit the JSON memories, fingerprinted PDFs, and manifest. Do not commit `generated/`.

The publisher fails before replacing public assets if translations are missing/stale, protected values change, Word is unavailable, a generated DOCX is invalid, or PDF export fails. It never falls back to a lower-fidelity converter.

## Commands

- `npm run report:i18n:status` — show translated, missing, stale, and obsolete unit counts
- `npm run report:i18n:test` — test deterministic extraction, synchronization, invariants, and DOCX integrity
- `npm run report:publish:local` — complete local translation and PDF publication pipeline
- `npm run report:dev` — run the static PDF.js viewer only
- `npm run report:build` — build the static report viewer only
- `npm run deploy:build` — build `/`, `/dashboard/`, and `/report/`

## Deployment contract

`apps/report/public/reports/report-manifest.json` is the sole runtime document index. Its entries point to hashed PDF filenames, preventing stale browser caches after a report update. The report viewer supports only English and Simplified Chinese; the saved locale uses the existing `lucky888.locale` browser-storage key.
