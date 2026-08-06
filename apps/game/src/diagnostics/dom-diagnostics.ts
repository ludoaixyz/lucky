import type {
  CompletedSpin,
  SessionDiagnostics,
  SpinDiagnosticsRecorder,
  SpinHistoryEntry,
} from './types.js';
import { SessionDiagnosticsStore } from './session-diagnostics.js';
import { buildSpinHistoryCsv, spinHistoryFilename } from './csv.js';
import { formatLineWins, formatVisibleWindow } from './format.js';
import { formatPercentRatio } from '@lucky/shared-types';

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

function renderEntry(entry: SpinHistoryEntry): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'history-card';
  item.dataset.spinNumber = String(entry.spinNumber);

  const header = document.createElement('div');
  header.className = 'history-card-header';
  const title = document.createElement('strong');
  title.textContent = `Spin #${entry.spinNumber}`;
  const time = document.createElement('time');
  time.dateTime = entry.timestamp;
  time.textContent = new Date(entry.timestamp).toLocaleTimeString();
  header.append(title, time);

  const metrics = document.createElement('div');
  metrics.className = 'history-metrics';
  const netClass = entry.netCredits >= 0 ? 'positive' : 'negative';
  metrics.append(
    textElement('Bet', String(entry.betCredits)),
    textElement('Base', String(entry.uncappedBaseWinCredits)),
    textElement('Feature', String(entry.uncappedFeatureWinCredits)),
    textElement('Credited', String(entry.creditedTotalWinCredits)),
    textElement('Net', `${entry.netCredits >= 0 ? '+' : ''}${entry.netCredits}`, netClass),
  );

  item.append(
    header,
    metrics,
    paragraph('Credits', `${entry.creditsBefore} → ${entry.creditsAfter}`, 'history-detail'),
    paragraph('Outcome', formatVisibleWindow(entry.outcome.visibleWindow), 'history-outcome'),
    paragraph('Stops', entry.outcome.reelStops.join('|'), 'history-detail'),
    paragraph('Line wins', formatLineWins(entry.outcome.lineWins), 'history-detail'),
    paragraph(
      'Feature',
      entry.featureTriggered
        ? `${entry.initialFreeSpins} initial, ${entry.totalFreeSpinsPlayed} played, ${entry.totalRetriggeredSpins} added, ${entry.retriggerCount} retriggers`
        : 'No',
      'history-detail',
    ),
    paragraph(
      'Scatters / cap',
      `${entry.scatterCount} / ${entry.maximumWinApplied ? 'applied' : 'not applied'}`,
      'history-detail',
    ),
  );
  return item;
}

export interface DiagnosticsController extends SpinDiagnosticsRecorder {
  dispose(): void;
}

export function attachDiagnostics(): DiagnosticsController {
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

  const render = (snapshot: SessionDiagnostics): void => {
    spins.textContent = String(snapshot.totalSpins);
    wagered.textContent = String(snapshot.totalWagered);
    won.textContent = String(snapshot.totalWon);
    rtp.textContent = formatPercentRatio(snapshot.creditedRtp);
    uncapped.textContent = formatPercentRatio(snapshot.uncappedReturn);
    capReduction.textContent = String(snapshot.totalCapReduction);
    triggerRate.textContent = formatPercentRatio(snapshot.featureTriggerRate);
    featureLength.textContent = snapshot.averageFeatureLength.toFixed(2);
    empty.hidden = snapshot.recentSpins.length > 0;
    history.replaceChildren(...snapshot.recentSpins.map(renderEntry));
    updateDownload(snapshot);
  };
  render(store.snapshot());

  return {
    recordCompletedSpin(spin: CompletedSpin): void {
      store.record(spin);
      render(store.snapshot());
    },
    dispose(): void {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = undefined;
    },
  };
}
