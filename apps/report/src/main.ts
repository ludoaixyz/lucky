import './style.css';
import {
  initialLocale,
  isReportLocale,
  languageButtons,
  persistLocale,
  SHELL_TRANSLATIONS,
  type ReportLocale,
} from './report-localization.js';
import { PdfReportViewer } from './report-renderer.js';

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Required report control '${selector}' is missing`);
  return node;
}

const host = required<HTMLElement>('#report');
const status = required<HTMLElement>('#report-status');
const languageSelector = required<HTMLElement>('.language-selector');
const openButton = required<HTMLButtonElement>('#open-pdf-button');
const announcement = document.querySelector<HTMLElement>('#language-announcement');
const viewer = new PdfReportViewer(host);
let locale = initialLocale();

function applyShellLocale(nextLocale: ReportLocale): void {
  locale = nextLocale;
  const translation = SHELL_TRANSLATIONS[locale];
  document.documentElement.lang = locale;
  languageSelector.innerHTML = languageButtons(locale);
  languageSelector.setAttribute('aria-label', translation.languageSelector);
  openButton.textContent = translation.openPdf;
  host.setAttribute('aria-label', translation.reportLabel);
  languageSelector.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = button.dataset.locale;
      if (!isReportLocale(selected) || selected === locale) return;
      persistLocale(selected);
      applyShellLocale(selected);
      if (announcement) announcement.textContent = SHELL_TRANSLATIONS[selected].selected;
      void loadLocale(selected);
    });
  });
}

async function loadLocale(nextLocale: ReportLocale): Promise<void> {
  status.hidden = false;
  status.classList.remove('report-status--error');
  status.textContent = SHELL_TRANSLATIONS[nextLocale].loading;
  host.classList.remove('is-ready');
  try {
    await viewer.load(nextLocale);
    status.hidden = true;
    host.classList.add('is-ready');
  } catch (error) {
    console.error(`Unable to render the ${nextLocale} report PDF.`, error);
    status.textContent = SHELL_TRANSLATIONS[nextLocale].error;
    status.classList.add('report-status--error');
  }
}

openButton.addEventListener('click', () => {
  const currentUrl = viewer.currentUrl;
  if (currentUrl) window.open(currentUrl, '_blank', 'noopener,noreferrer');
});

applyShellLocale(locale);
await loadLocale(locale);
