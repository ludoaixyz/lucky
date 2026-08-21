import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const canonical = resolve(root, 'Lucky888_Bathala_Prototype_Analysis_HTML.docx');
const output = resolve(root, 'apps/report/public/report');

if (!existsSync(canonical)) throw new Error(`Canonical report DOCX is missing: ${canonical}`);
const bytes = readFileSync(canonical);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const source = `lucky888-bathala-report.${sha256.slice(0, 16)}.docx`;

mkdirSync(output, { recursive: true });
for (const entry of readdirSync(output)) {
  if (/^lucky888-bathala-report\.[a-f\d]{16}\.docx$/u.test(entry) && entry !== source)
    rmSync(resolve(output, entry), { force: true });
}
copyFileSync(canonical, resolve(output, source));
writeFileSync(
  resolve(output, 'report-manifest.json'),
  `${JSON.stringify({ source, sha256, generatedAt: new Date().toISOString() }, null, 2)}\n`,
);
console.info(`[report] Prepared ${source}`);
