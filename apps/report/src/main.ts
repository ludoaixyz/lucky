import './style.css';
import { buildReportNavigation, renderContents } from './report-navigation.js';
import {
  initialLocale,
  isReportLocale,
  languageButtons,
  persistLocale,
  SHELL_TRANSLATIONS,
  type ReportLocale,
} from './report-localization.js';
import { renderReport } from './report-renderer.js';
import { enhanceReportPresentation } from './report-presentation.js';

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Required report control '${selector}' is missing`);
  return node;
}

const host = required<HTMLElement>('#report');
const status = required<HTMLElement>('#report-status');
const languageSelector = required<HTMLElement>('.language-selector');
const contentsButton = required<HTMLButtonElement>('#contents-button');
const contentsPanel = required<HTMLElement>('#contents-panel');
const printButton = required<HTMLButtonElement>('#print-button');
const announcement = document.querySelector<HTMLElement>('#language-announcement');

let locale = initialLocale();

function applyShellLocale(nextLocale: ReportLocale): void {
  locale = nextLocale;
  const translation = SHELL_TRANSLATIONS[locale];
  document.documentElement.lang = locale;
  languageSelector.innerHTML = languageButtons(locale);
  languageSelector.setAttribute('aria-label', translation.languageName);
  contentsButton.textContent = translation.contents;
  printButton.textContent = translation.print;
  host.setAttribute('aria-label', translation.reportLabel);
  languageSelector.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = button.dataset.locale;
      if (!isReportLocale(selected)) return;
      persistLocale(selected);
      applyShellLocale(selected);
      if (announcement) announcement.textContent = SHELL_TRANSLATIONS[selected].selected;
    });
  });
}

contentsButton.addEventListener('click', () => {
  const open = contentsPanel.hidden;
  contentsPanel.hidden = !open;
  contentsButton.setAttribute('aria-expanded', String(open));
});
contentsPanel.addEventListener('click', (event) => {
  if (!(event.target instanceof HTMLAnchorElement)) return;
  contentsPanel.hidden = true;
  contentsButton.setAttribute('aria-expanded', 'false');
});
printButton.addEventListener('click', () => window.print());

applyShellLocale(locale);
status.textContent = SHELL_TRANSLATIONS[locale].loading;

try {
  await renderReport(host);
  enhanceReportPresentation(host);
  renderContents(contentsPanel, buildReportNavigation(host));
  status.hidden = true;
  host.classList.add('is-ready');
} catch (error) {
  console.error('Unable to render the canonical report DOCX.', error);
  status.textContent = SHELL_TRANSLATIONS[locale].error;
  status.classList.add('report-status--error');
}
