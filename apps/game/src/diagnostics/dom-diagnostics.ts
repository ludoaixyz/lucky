import type {
  CompletedSpin,
  SessionDiagnostics,
  SpinDiagnosticsRecorder,
  SpinHistoryEntry,
} from './types.js';
import { SessionDiagnosticsStore } from './session-diagnostics.js';
import { buildSpinHistoryCsv, spinHistoryFilename } from './csv.js';
import { formatLineWins, formatVisibleWindow } from './format.js';
import {
  formatNumber,
  formatPercent,
  formatTime,
  type Localization,
  type TranslationDictionary,
} from '../i18n/index.js';

function element<T extends HTMLElement>(id: string): T {
  const found = document.querySelector<T>(`#${id}`);
  if (!found) throw new Error(`Required diagnostics element '#${id}' is missing`);
  return found;
}

function textElement(label: string, value: string, className?: string): HTMLSpanElement {
  const span = document.createElement('span');
  if (className) span.className = className;
  const strong = document.createElement('strong');
  strong.textContent = value;
  span.append(`${label} `, strong);
  return span;
}

function paragraph(label: string, value: string, className: string): HTMLParagraphElement {
  const node = document.createElement('p');
  node.className = className;
  const labelNode = document.createElement('span');
  labelNode.className = 'history-detail-label';
  labelNode.textContent = `${label} `;
  node.append(labelNode, value);
  return node;
}

export function renderDiagnosticsEntry(
  entry: SpinHistoryEntry,
  localization: Localization,
): HTMLLIElement {
  const dictionary: TranslationDictionary['diagnostics'] = localization.dictionary.diagnostics;
  const number = (value: number): string => formatNumber(localization.locale, value);
  const item = document.createElement('li');
  item.className = 'history-card';
  item.dataset.spinNumber = String(entry.spinNumber);

  const header = document.createElement('div');
  header.className = 'history-card-header';
  const title = document.createElement('strong');
  title.textContent = dictionary.spinNumber(entry.spinNumber);
  const time = document.createElement('time');
  time.dateTime = entry.timestamp;
  time.textContent = formatTime(localization.locale, new Date(entry.timestamp));
  header.append(title, time);

  const metrics = document.createElement('div');
  metrics.className = 'history-metrics';
  const netClass = entry.netCredits >= 0 ? 'positive' : 'negative';
  metrics.append(
    textElement(dictionary.bet, number(entry.betCredits)),
    textElement(dictionary.base, number(entry.uncappedBaseWinCredits)),
    textElement(dictionary.feature, number(entry.uncappedFeatureWinCredits)),
    textElement(dictionary.credited, number(entry.creditedTotalWinCredits)),
    textElement(
      dictionary.net,
      `${entry.netCredits >= 0 ? '+' : ''}${number(entry.netCredits)}`,
      netClass,
    ),
  );

  item.append(
    header,
    metrics,
    paragraph(
      dictionary.credits,
      `${number(entry.creditsBefore)} → ${number(entry.creditsAfter)}`,
      'history-detail',
    ),
    paragraph(
      dictionary.outcome,
      formatVisibleWindow(entry.outcome.visibleWindow),
      'history-outcome',
    ),
    paragraph(dictionary.stops, entry.outcome.reelStops.join('|'), 'history-detail'),
    paragraph(
      dictionary.lineWins,
      formatLineWins(entry.outcome.lineWins, number),
      'history-detail',
    ),
    paragraph(
      dictionary.feature,
      entry.featureTriggered
        ? dictionary.featureSummary({
            initial: entry.initialFreeSpins,
            played: entry.totalFreeSpinsPlayed,
            added: entry.totalRetriggeredSpins,
            retriggers: entry.retriggerCount,
          })
        : dictionary.no,
      'history-detail',
    ),
    paragraph(
      dictionary.scattersAndCap,
      `${number(entry.scatterCount)} / ${entry.maximumWinApplied ? dictionary.applied : dictionary.notApplied}`,
      'history-detail',
    ),
  );
  return item;
}

export interface DiagnosticsController extends SpinDiagnosticsRecorder {
  dispose(): void;
}

export function attachDiagnostics(localization: Localization): DiagnosticsController {
  const store = new SessionDiagnosticsStore();
  const spins = element<HTMLElement>('diagnostics-spins');
  const wagered = element<HTMLElement>('diagnostics-wagered');
  const won = element<HTMLElement>('diagnostics-won');
  const rtp = element<HTMLElement>('diagnostics-rtp');
  const uncapped = element<HTMLElement>('diagnostics-uncapped');
  const capReduction = element<HTMLElement>('diagnostics-cap-reduction');
  const triggerRate = element<HTMLElement>('diagnostics-trigger-rate');
  const featureLength = element<HTMLElement>('diagnostics-feature-length');
  const history = element<HTMLOListElement>('spin-history');
  const empty = element<HTMLElement>('history-empty');
  const download = element<HTMLAnchorElement>('download-csv');
  let downloadUrl: string | undefined;

  const updateDownload = (snapshot: SessionDiagnostics): void => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = undefined;
    if (snapshot.history.length === 0) {
      download.removeAttribute('href');
      download.removeAttribute('download');
      download.setAttribute('aria-disabled', 'true');
      return;
    }
    downloadUrl = URL.createObjectURL(
      new Blob([buildSpinHistoryCsv(snapshot.history)], { type: 'text/csv;charset=utf-8' }),
    );
    download.href = downloadUrl;
    download.download = spinHistoryFilename(new Date());
    download.setAttribute('aria-disabled', 'false');
  };

  const render = (): void => {
    const snapshot = store.snapshot();
    const number = (value: number): string => formatNumber(localization.locale, value);
    spins.textContent = number(snapshot.totalSpins);
    wagered.textContent = number(snapshot.totalWagered);
    won.textContent = number(snapshot.totalWon);
    rtp.textContent = formatPercent(localization.locale, snapshot.creditedRtp);
    uncapped.textContent = formatPercent(localization.locale, snapshot.uncappedReturn);
    capReduction.textContent = number(snapshot.totalCapReduction);
    triggerRate.textContent = formatPercent(localization.locale, snapshot.featureTriggerRate);
    featureLength.textContent = new Intl.NumberFormat(localization.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(snapshot.averageFeatureLength);
    empty.hidden = snapshot.recentSpins.length > 0;
    history.replaceChildren(
      ...snapshot.recentSpins.map((entry) => renderDiagnosticsEntry(entry, localization)),
    );
    updateDownload(snapshot);
  };
  render();
  const unsubscribeLocale = localization.subscribe(render);

  return {
    recordCompletedSpin(spin: CompletedSpin): void {
      store.record(spin);
      render();
    },
    dispose(): void {
      unsubscribeLocale();
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = undefined;
    },
  };
}
