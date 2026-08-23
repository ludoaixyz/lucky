import './style.css';
import {
  initialLocale,
  isReportLocale,
  languageButtons,
  persistLocale,
  SHELL_TRANSLATIONS,
  type ReportLocale,
} from './report-localization.js';
import { createDirectPdfLink, PdfReportViewer } from './report-renderer.js';

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
let loadGeneration = 0;

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
  const generation = ++loadGeneration;
  status.hidden = false;
  status.classList.remove('report-status--error');
  status.textContent = SHELL_TRANSLATIONS[nextLocale].loading;
  try {
    const translation = SHELL_TRANSLATIONS[nextLocale];
    await viewer.load(nextLocale, {
      openPdf: translation.openPdf,
      pageError: translation.pageError,
    });
    if (generation !== loadGeneration) return;
    status.hidden = true;
  } catch (error) {
    if (generation !== loadGeneration) return;
    const translation = SHELL_TRANSLATIONS[nextLocale];
    console.error('[report] Unable to initialize the interactive report', {
      locale: nextLocale,
      url: viewer.currentUrl,
      stage: viewer.currentUrl ? 'pdf' : 'manifest',
      error,
    });
    const message = document.createElement('p');
    message.textContent = viewer.currentUrl ? translation.interactiveError : translation.error;
    status.replaceChildren(message);
    if (viewer.currentUrl) {
      status.append(createDirectPdfLink(viewer.currentUrl, translation.openPdf));
    }
    status.classList.add('report-status--error');
  }
}

openButton.addEventListener('click', () => {
  const currentUrl = viewer.currentUrl;
  if (currentUrl) window.open(currentUrl, '_blank', 'noopener,noreferrer');
});

applyShellLocale(locale);
void loadLocale(locale);
