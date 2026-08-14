import { resolveSpin, SeededRandom } from '@lucky/math-engine';
import type { BathalaSpinResult, Board } from '@lucky/shared-types';
import './style.css';
import { loadConfig } from './config/load-config.js';

const boardElement = document.querySelector<HTMLElement>('#game');
const message = document.querySelector<HTMLElement>('#message');
const win = document.querySelector<HTMLElement>('#win');
const feature = document.querySelector<HTMLElement>('#feature');
const multiplier = document.querySelector<HTMLElement>('#multiplier');
const spinButton = document.querySelector<HTMLButtonElement>('#spin');

function renderBoard(board: Board): void {
  if (!boardElement) return;
  boardElement.replaceChildren(
    ...Array.from({ length: 5 }, (_, row) =>
      board.map((column) => {
        const cell = column[row];
        const tile = document.createElement('div');
        tile.className = `symbol symbol--${cell?.symbol.toLowerCase() ?? 'empty'}`;
        tile.textContent =
          cell?.symbol === 'MULTIPLIER' ? `×${cell.multiplierValue}` : (cell?.symbol ?? '');
        return tile;
      }),
    ).flat(),
  );
}

function summary(result: BathalaSpinResult): string {
  const wins = result.tumbleRounds.flatMap((round) =>
    round.winningSymbols.map((entry) => `${entry.symbol}×${entry.count}`),
  );
  const bathala = result.tumbleRounds
    .filter((round) => round.bathala?.occurred)
    .map((round) => `${round.bathala?.targetSymbol}−${round.bathala?.removedPositions.length}`);
  return `${wins.length ? `Wins ${wins.join(', ')}` : 'No count win'} · ${result.tumbleRounds.length} tumble round(s) · Bathala ${bathala.join(', ') || 'idle'} · Scatters ${result.scatterCount}`;
}

try {
  const config = await loadConfig();
  const requested = Number(new URLSearchParams(location.search).get('seed') ?? 2026);
  const rng = new SeededRandom(Number.isSafeInteger(requested) ? requested : 2026);
  const play = (): void => {
    const result = resolveSpin(config, rng, true);
    renderBoard(result.finalBoard);
    if (win) win.textContent = `${result.totalWin.toFixed(2)}×`;
    if (feature)
      feature.textContent = result.feature ? `${result.feature.totalSpinsPlayed} spins` : '—';
    if (multiplier)
      multiplier.textContent = result.feature ? `×${result.feature.endingMultiplier}` : '—';
    if (message) message.textContent = summary(result);
  };
  spinButton?.addEventListener('click', play);
  boardElement?.setAttribute('data-configuration-id', config.configurationId);
  boardElement?.setAttribute('aria-label', 'Six-column by five-row Lucky888 Bathala-style board');
  play();
} catch (error) {
  if (message) message.textContent = error instanceof Error ? error.message : String(error);
  if (spinButton) spinButton.disabled = true;
}
