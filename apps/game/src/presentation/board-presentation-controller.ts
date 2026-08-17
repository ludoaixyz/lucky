import type { Board, Position, SymbolWin, TumbleRound } from '@lucky/shared-types';
import { formatCredits } from '../workbench/number-format.js';
import {
  cellDropMotion,
  fallingSymbolKeyframes,
  renderBoardCells,
} from './board-drop-presentation.js';
import {
  PRESENTATION_TIMINGS,
  SPIN_SPEEDS,
  speedLabel,
  type SpinSpeed,
} from './presentation-timings.js';
import { WinConnectorLayer } from './win-connectors.js';

export type PresentationState =
  | 'idle'
  | 'dropping'
  | 'evaluating'
  | 'winHighlight'
  | 'removing'
  | 'bathalaAnimating'
  | 'collapsing'
  | 'refilling'
  | 'scatterPresentation'
  | 'featureTransition';

export interface ScatterPresentationResult {
  readonly finalBoard: Board;
  readonly count: number;
  readonly payout: number;
  readonly freeGames?: number;
  readonly retriggeredSpins?: number;
}

export interface ResolvedPresentation<T> {
  readonly resolve: () => T;
  readonly present: (result: T) => Promise<void>;
  readonly commit: (result: T) => void;
}

export async function resolvePresentCommit<T>(steps: ResolvedPresentation<T>): Promise<T> {
  const result = steps.resolve();
  await steps.present(result);
  steps.commit(result);
  return result;
}

export async function runAutoSpinSequence(
  count: number,
  play: (current: number, total: number) => Promise<boolean>,
  shouldStop: () => boolean,
): Promise<number> {
  let completed = 0;
  while (completed < count && !shouldStop()) {
    if (!(await play(completed + 1, count))) break;
    completed += 1;
  }
  return completed;
}

export class BoardPresentationController {
  private stateValue: PresentationState = 'idle';
  private activeAnimations = new Set<Animation>();
  private stopRequested = false;
  private destroyed = false;
  private lastWinningGroups = '';
  private activePauseReleases = new Set<() => void>();
  private readonly connectors: WinConnectorLayer;

  constructor(
    private readonly board: HTMLElement,
    private readonly reducedMotion: () => boolean = () =>
      matchMedia('(prefers-reduced-motion: reduce)').matches,
  ) {
    this.connectors = new WinConnectorLayer(board);
    this.setState('idle');
  }

  state(): PresentationState {
    return this.stateValue;
  }
  private setState(state: PresentationState): void {
    this.stateValue = state;
    this.board.dataset.presentationState = state;
  }

  async present(
    targetBoard: Board,
    speed: SpinSpeed,
    rounds: readonly TumbleRound[] = [],
    scatter?: ScatterPresentationResult,
  ): Promise<void> {
    if (this.destroyed) throw new Error('Board presentation has been destroyed');
    if (this.stateValue !== 'idle') throw new Error('Board presentation is already active');
    this.clearPersistentWinPresentation();
    this.stopRequested = false;
    await this.presentInitialDrop(targetBoard, speed);
    this.setState('evaluating');
    if (rounds.length > 0) await this.presentTumbles(rounds, speed);
    if (
      scatter &&
      (scatter.payout > 0 || (scatter.freeGames ?? 0) > 0 || (scatter.retriggeredSpins ?? 0) > 0)
    )
      await this.presentScatterResult(scatter, speed);
  }

  stop(): void {
    this.stopRequested = true;
    for (const animation of this.activeAnimations) animation.finish();
    this.connectors.finish();
    for (const release of [...this.activePauseReleases]) release();
  }

  complete(): void {
    this.stopRequested = false;
    this.setState('idle');
  }

  clearPersistentWinPresentation(): void {
    this.connectors.clear();
    this.board.classList.remove('board--completed-win', 'board--win-focus');
    this.board
      .querySelectorAll('.symbol--winning,.symbol--multiplier-active,.symbol--scatter-winning')
      .forEach((symbol) =>
        symbol.classList.remove(
          'symbol--winning',
          'symbol--multiplier-active',
          'symbol--scatter-winning',
        ),
      );
    delete this.board.dataset.winningGroups;
    delete this.board.dataset.scatterResult;
    delete this.board.dataset.completedWin;
    delete this.board.dataset.bathalaRemoval;
    this.lastWinningGroups = '';
  }

  retainCompletedWinPresentation(winCredits: number): void {
    if (winCredits <= 0) return;
    this.board.classList.add('board--completed-win');
    this.board.dataset.completedWin = `${formatCredits(winCredits)} CREDIT WIN`;
    if (this.lastWinningGroups) this.board.dataset.winningGroups = this.lastWinningGroups;
  }

  destroy(): void {
    this.destroyed = true;
    for (const animation of this.activeAnimations) animation.cancel();
    this.activeAnimations.clear();
    for (const release of [...this.activePauseReleases]) release();
    this.clearPersistentWinPresentation();
    this.complete();
  }

  private animate(
    element: HTMLElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
  ): Promise<void> {
    const animation = element.animate(keyframes, options);
    this.activeAnimations.add(animation);
    return animation.finished
      .catch(() => undefined)
      .then(() => {
        this.activeAnimations.delete(animation);
        animation.cancel();
      });
  }

  private pause(milliseconds: number, reduce: boolean, stoppedMaximum: number): Promise<void> {
    const duration = reduce
      ? Math.min(milliseconds, 16)
      : this.stopRequested
        ? Math.min(milliseconds, stoppedMaximum)
        : milliseconds;
    return new Promise((resolve) => {
      let timer = 0;
      const release = (): void => {
        window.clearTimeout(timer);
        this.activePauseReleases.delete(release);
        resolve();
      };
      this.activePauseReleases.add(release);
      timer = window.setTimeout(release, duration);
    });
  }

  private async presentInitialDrop(targetBoard: Board, speed: SpinSpeed): Promise<void> {
    this.setState('dropping');
    renderBoardCells(this.board, targetBoard);
    const reduce = this.reducedMotion();
    const motions = targetBoard.flatMap((column, columnIndex) =>
      column.map((_cell, row) =>
        cellDropMotion(this.board, { column: columnIndex, row }, speed, reduce),
      ),
    );
    await Promise.all(
      motions.map((motion) => {
        const cell = this.cellAt(motion.position);
        return cell
          ? this.animate(
              cell,
              fallingSymbolKeyframes(motion.distance, reduce, motion.landing / motion.duration),
              {
                duration: motion.duration,
                delay: motion.delay,
                fill: 'both',
              },
            )
          : Promise.resolve();
      }),
    );
    const timing = PRESENTATION_TIMINGS[speed];
    await this.pause(timing.drop.postLandingHold, reduce, timing.win.stoppedHold);
  }

  private async presentWinningRound(round: TumbleRound, speed: SpinSpeed): Promise<void> {
    this.setState('winHighlight');
    const groups = round.winningSymbols
      .map(({ symbol, count }) => `${symbol} × ${count}`)
      .join(' · ');
    this.lastWinningGroups = groups;
    this.board.classList.add('board--win-focus');
    for (const occurrence of round.multiplierSymbols)
      this.board
        .querySelector<HTMLElement>(`.symbol[data-cell-id="${occurrence.id}"]`)
        ?.classList.add('symbol--multiplier-active');
    for (const win of round.winningSymbols) await this.presentWinningGroup(win, speed);
    await this.presentCombinedWin(round, speed);
  }

  private async presentWinningGroup(win: SymbolWin, speed: SpinSpeed): Promise<void> {
    const timing = PRESENTATION_TIMINGS[speed].win;
    const reduce = this.reducedMotion();
    this.clearWinningEmphasis();
    this.board.dataset.winningGroups = `${win.symbol} × ${win.count}`;
    this.markPositions(win.positions, 'symbol--winning');
    await Promise.all(
      this.connectors.drawGroup(
        win.symbol,
        win.positions,
        reduce ? 0 : timing.connectorDraw,
        reduce,
      ),
    );
    await this.pause(timing.perGroupHold, reduce, timing.stoppedHold);
  }

  private async presentCombinedWin(round: TumbleRound, speed: SpinSpeed): Promise<void> {
    const timing = PRESENTATION_TIMINGS[speed].win;
    const reduce = this.reducedMotion();
    this.clearWinningEmphasis();
    this.board.dataset.winningGroups = this.lastWinningGroups;
    const connectorAnimations: Promise<void>[] = [];
    for (const win of round.winningSymbols) {
      this.markPositions(win.positions, 'symbol--winning');
      connectorAnimations.push(
        ...this.connectors.drawGroup(
          win.symbol,
          win.positions,
          reduce ? 0 : timing.connectorDraw,
          reduce,
        ),
      );
    }
    await Promise.all(connectorAnimations);
    await this.pause(timing.combinedWinHold, reduce, timing.stoppedHold);
  }

  private clearWinningEmphasis(): void {
    this.connectors.clear();
    this.board
      .querySelectorAll('.symbol--winning')
      .forEach((symbol) => symbol.classList.remove('symbol--winning'));
  }

  private async presentTumbles(rounds: readonly TumbleRound[], speed: SpinSpeed): Promise<void> {
    const timing = PRESENTATION_TIMINGS[speed].win;
    const reduce = this.reducedMotion();
    for (const round of rounds) {
      if (!round.boardBefore) continue;
      renderBoardCells(this.board, round.boardBefore);
      await this.presentWinningRound(round, speed);
      this.connectors.clear();
      this.board.classList.remove('board--win-focus');
      delete this.board.dataset.winningGroups;
      this.setState('removing');
      this.board.style.setProperty('--symbol-remove-duration', `${timing.remove}ms`);
      this.markPositions(round.removedWinningCells, 'symbol--removing');
      await this.pause(timing.remove, reduce, timing.stoppedHold);
      const afterScoringRemoval = round.boardBefore.map((column) => column.map((cell) => cell));
      for (const { column, row } of round.removedWinningCells)
        afterScoringRemoval[column]![row] = null;
      renderBoardCells(this.board, afterScoringRemoval);
      await this.pause(timing.afterRemoveHold, reduce, timing.stoppedHold);
      if (round.bathala?.occurred) {
        this.setState('bathalaAnimating');
        this.board.style.setProperty('--bathala-remove-duration', `${timing.bathalaRemove}ms`);
        this.board.dataset.bathalaRemoval = `BATHALA · ${round.bathala.targetSymbol ?? 'LOW SYMBOL'}`;
        this.markPositions(round.bathala.removedPositions, 'symbol--bathala-removing');
        await this.pause(timing.bathalaRemove, reduce, timing.stoppedHold);
      }
      if (round.boardAfterRemoval) renderBoardCells(this.board, round.boardAfterRemoval);
      delete this.board.dataset.bathalaRemoval;
      if (round.bathala?.occurred)
        await this.pause(timing.afterBathalaHold, reduce, timing.stoppedHold);
      if (round.boardAfterCollapse)
        await this.presentCollapse(round.boardAfterCollapse, timing.collapse, reduce);
      if (round.boardAfterCollapse)
        await this.pause(timing.afterCollapseHold, reduce, timing.stoppedHold);
      if (round.boardAfterRefill)
        await this.presentRefill(round.boardAfterRefill, speed, timing.refill, reduce);
      if (round.boardAfterRefill)
        await this.pause(timing.postRefillHold, reduce, timing.stoppedHold);
      this.setState('evaluating');
    }
  }

  private async presentCollapse(target: Board, duration: number, reduce: boolean): Promise<void> {
    this.setState('collapsing');
    const oldRows = new Map<string, number>();
    this.board
      .querySelectorAll<HTMLElement>('.symbol[data-cell-id]')
      .forEach((cell) => oldRows.set(cell.dataset.cellId!, Number(cell.dataset.row)));
    renderBoardCells(this.board, target);
    const rowHeight = (this.board.clientHeight || 500) / 5;
    await Promise.all(
      [...this.board.querySelectorAll<HTMLElement>('.symbol[data-cell-id]')].map((cell) => {
        const oldRow = oldRows.get(cell.dataset.cellId!);
        const newRow = Number(cell.dataset.row);
        if (oldRow === undefined || oldRow === newRow) return Promise.resolve();
        return this.animate(
          cell,
          [
            { transform: `translate3d(0,${(oldRow - newRow) * rowHeight}px,0)` },
            { transform: 'translate3d(0,0,0)' },
          ],
          {
            duration: reduce ? 60 : this.stopRequested ? 70 : duration,
            easing: 'cubic-bezier(.2,.8,.2,1)',
          },
        );
      }),
    );
  }

  private async presentRefill(
    target: Board,
    speed: SpinSpeed,
    duration: number,
    reduce: boolean,
  ): Promise<void> {
    this.setState('refilling');
    const existing = new Set(
      [...this.board.querySelectorAll<HTMLElement>('.symbol[data-cell-id]')].map(
        (cell) => cell.dataset.cellId,
      ),
    );
    renderBoardCells(this.board, target);
    await Promise.all(
      [...this.board.querySelectorAll<HTMLElement>('.symbol[data-cell-id]')]
        .filter((cell) => !existing.has(cell.dataset.cellId))
        .map((cell) => {
          const position = { column: Number(cell.dataset.column), row: Number(cell.dataset.row) };
          const motion = cellDropMotion(this.board, position, speed, reduce);
          return this.animate(
            cell,
            fallingSymbolKeyframes(
              motion.distance,
              reduce,
              motion.landing / (reduce ? 80 : duration),
            ),
            {
              duration: reduce ? 80 : this.stopRequested ? 80 : duration,
              delay: reduce ? 0 : motion.delay / 2,
              fill: 'both',
            },
          );
        }),
    );
  }

  private async presentScatterResult(
    result: ScatterPresentationResult,
    speed: SpinSpeed,
  ): Promise<void> {
    renderBoardCells(this.board, result.finalBoard);
    const positions: Position[] = [];
    result.finalBoard.forEach((column, columnIndex) =>
      column.forEach((cell, row) => {
        if (cell?.symbol === 'SCATTER') positions.push({ column: columnIndex, row });
      }),
    );
    if (positions.length === 0) return;
    this.setState('scatterPresentation');
    this.board.classList.add('board--win-focus');
    this.markPositions(positions, 'symbol--scatter-winning');
    const status = [`SCATTER × ${result.count}`];
    if ((result.freeGames ?? 0) > 0) status.push(`${result.freeGames} FREE GAMES`);
    if ((result.retriggeredSpins ?? 0) > 0) status.push(`+${result.retriggeredSpins} FREE GAMES`);
    if (result.payout > 0) status.push(`${formatCredits(result.payout)} CREDITS`);
    this.board.dataset.scatterResult = status.join(' · ');
    const timing = PRESENTATION_TIMINGS[speed].win;
    await Promise.all(
      this.connectors.drawGroup(
        'SCATTER',
        positions,
        this.reducedMotion() ? 0 : timing.connectorDraw,
        this.reducedMotion(),
      ),
    );
    await this.pause(timing.perGroupHold, this.reducedMotion(), timing.stoppedHold);
  }

  private cellAt({ column, row }: Position): HTMLElement | null {
    return this.board.querySelector<HTMLElement>(
      `.symbol[data-column="${column}"][data-row="${row}"]`,
    );
  }
  private markPositions(positions: readonly Position[], className: string): void {
    for (const position of positions) this.cellAt(position)?.classList.add(className);
  }
}

export { PRESENTATION_TIMINGS, SPIN_SPEEDS, speedLabel, type SpinSpeed };
