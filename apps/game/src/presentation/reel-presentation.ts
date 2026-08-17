import type {
  BathalaSymbolId,
  Board,
  Position,
  SymbolCell,
  TumbleRound,
} from '@lucky/shared-types';
import { BATHALA_SYMBOL_IDS, createSymbolElement } from './symbol-visuals.js';

export type SpinSpeed = 'normal' | 'x1' | 'x2';
export type PresentationState =
  'idle' | 'spinning' | 'reelSettling' | 'evaluating' | 'tumbleAnimating' | 'featureTransition';

export const PRESENTATION_TIMINGS = Object.freeze({
  normal: {
    spin: {
      totalDuration: 5600,
      firstReelStop: 3200,
      reelStagger: 330,
      lateReelAnticipation: [0, 0, 0, 0, 250, 500] as const,
      settleDuration: 150,
      fillerRows: 72,
    },
    win: {
      hold: 1100,
      stoppedHold: 180,
      remove: 240,
      bathalaRemove: 220,
      collapse: 260,
      refill: 300,
    },
  },
  x1: {
    spin: {
      totalDuration: 2800,
      firstReelStop: 1500,
      reelStagger: 180,
      lateReelAnticipation: [0, 0, 0, 0, 120, 220] as const,
      settleDuration: 110,
      fillerRows: 44,
    },
    win: {
      hold: 625,
      stoppedHold: 140,
      remove: 150,
      bathalaRemove: 130,
      collapse: 170,
      refill: 190,
    },
  },
  x2: {
    spin: {
      totalDuration: 1600,
      firstReelStop: 760,
      reelStagger: 105,
      lateReelAnticipation: [0, 0, 0, 0, 65, 120] as const,
      settleDuration: 80,
      fillerRows: 30,
    },
    win: {
      hold: 300,
      stoppedHold: 100,
      remove: 100,
      bathalaRemove: 90,
      collapse: 120,
      refill: 135,
    },
  },
});

/** Internal `normal`, `x1`, `x2` map to visible x1, x2, x3 respectively. */
export const SPIN_SPEEDS = Object.freeze({ normal: 5600, x1: 2800, x2: 1600 } as const);
export const SPIN_TIMINGS = Object.freeze({
  normal: PRESENTATION_TIMINGS.normal.spin,
  x1: PRESENTATION_TIMINGS.x1.spin,
  x2: PRESENTATION_TIMINGS.x2.spin,
});
const REDUCED_MOTION_MAXIMUM_DURATION = 240;

export function speedLabel(speed: SpinSpeed): 'x1' | 'x2' | 'x3' {
  return speed === 'normal' ? 'x1' : speed === 'x1' ? 'x2' : 'x3';
}

export function reelStopTimes(speed: SpinSpeed): readonly number[] {
  const spin = PRESENTATION_TIMINGS[speed].spin;
  return spin.lateReelAnticipation.map(
    (anticipation, reelIndex) => spin.firstReelStop + reelIndex * spin.reelStagger + anticipation,
  );
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

function temporaryCell(reel: number, row: number): SymbolCell {
  const symbol = BATHALA_SYMBOL_IDS[
    (row + reel * 3) % BATHALA_SYMBOL_IDS.length
  ] as BathalaSymbolId;
  return symbol === 'MULTIPLIER'
    ? { id: `spin-temp-r${reel}-${row}`, symbol, multiplierValue: 2 + ((row + reel) % 9) }
    : { id: `spin-temp-r${reel}-${row}`, symbol };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export class ReelPresentationController {
  private stateValue: PresentationState = 'idle';
  private activeAnimations = new Set<Animation>();
  private stopRequested = false;
  private destroyed = false;
  private lastWinningGroups = '';

  constructor(
    private readonly board: HTMLElement,
    private readonly reducedMotion: () => boolean = () =>
      matchMedia('(prefers-reduced-motion: reduce)').matches,
  ) {
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
  ): Promise<void> {
    if (this.destroyed) throw new Error('Reel presentation has been destroyed');
    if (this.stateValue !== 'idle') throw new Error('Reel presentation is already active');
    this.clearPersistentWinPresentation();
    this.stopRequested = false;
    await this.spin(targetBoard, speed);
    this.setState('evaluating');
    if (rounds.length > 0) await this.presentTumbles(rounds, speed);
  }

  stop(): void {
    if (this.stateValue !== 'spinning' && this.stateValue !== 'reelSettling') return;
    this.stopRequested = true;
    for (const animation of this.activeAnimations) animation.finish();
  }

  complete(): void {
    this.stopRequested = false;
    this.setState('idle');
  }

  clearPersistentWinPresentation(): void {
    this.board.classList.remove('board--completed-win');
    this.board
      .querySelectorAll('.symbol--winning')
      .forEach((symbol) => symbol.classList.remove('symbol--winning'));
    delete this.board.dataset.winningGroups;
    delete this.board.dataset.completedWin;
    delete this.board.dataset.bathalaRemoval;
    this.lastWinningGroups = '';
  }

  retainCompletedWinPresentation(winCredits: number): void {
    if (winCredits <= 0) return;
    this.board.classList.add('board--completed-win');
    this.board.dataset.completedWin = `${winCredits.toLocaleString()} CREDIT WIN`;
    if (this.lastWinningGroups) this.board.dataset.winningGroups = this.lastWinningGroups;
  }

  destroy(): void {
    this.destroyed = true;
    for (const animation of this.activeAnimations) animation.cancel();
    this.activeAnimations.clear();
    this.board.classList.remove('board--spinning');
    this.complete();
  }

  private async spin(targetBoard: Board, speed: SpinSpeed): Promise<void> {
    const reels = [...this.board.querySelectorAll<HTMLElement>('.reel')];
    if (reels.length !== targetBoard.length)
      throw new Error('Rendered reel count does not match the resolved board');
    const reduce = this.reducedMotion();
    const profile = PRESENTATION_TIMINGS[speed].spin;
    const stopTimes = reelStopTimes(speed);
    this.setState('spinning');
    this.board.classList.add('board--spinning');
    try {
      await Promise.all(
        reels.map((reel, index) => {
          const duration = reduce
            ? REDUCED_MOTION_MAXIMUM_DURATION - (reels.length - 1 - index) * 16
            : (stopTimes[index] ?? profile.totalDuration);
          return this.spinReel(
            reel,
            targetBoard[index] ?? [],
            index,
            duration,
            reduce,
            profile.settleDuration,
            profile.fillerRows,
          );
        }),
      );
    } finally {
      this.activeAnimations.clear();
      this.board.classList.remove('board--spinning');
    }
  }

  private async spinReel(
    reel: HTMLElement,
    targetColumn: Board[number],
    reelIndex: number,
    duration: number,
    reduce: boolean,
    settleDuration: number,
    configuredFillerRows: number,
  ): Promise<void> {
    const track = reel.querySelector<HTMLElement>('.reel-track');
    if (!track) throw new Error(`Reel ${reelIndex + 1} is missing its track`);
    const fillerCount = reduce ? 7 : configuredFillerRows + reelIndex * 2;
    track.replaceChildren(
      ...Array.from({ length: fillerCount }, (_, row) =>
        createSymbolElement(temporaryCell(reelIndex, row)),
      ),
      ...targetColumn.map((cell) => createSymbolElement(cell)),
    );
    const gap = Number.parseFloat(getComputedStyle(track).rowGap || '0') || 0;
    const cellHeight = Math.max(
      1,
      (reel.clientHeight - gap * (targetColumn.length - 1)) / targetColumn.length,
    );
    track.style.setProperty('--reel-cell-height', `${cellHeight}px`);
    const distance = fillerCount * (cellHeight + gap);
    reel.classList.add('reel--spinning');
    const animation = track.animate(
      [
        {
          transform: 'translate3d(0,0,0)',
          filter: 'none',
          easing: 'cubic-bezier(.55,.08,.68,.53)',
        },
        {
          transform: `translate3d(0,${-distance * 0.09}px,0)`,
          filter: reduce ? 'none' : 'blur(.55px)',
          offset: 0.18,
          easing: 'linear',
        },
        {
          transform: `translate3d(0,${-distance * 0.7}px,0)`,
          filter: reduce ? 'none' : 'blur(.8px)',
          offset: 0.65,
          easing: 'cubic-bezier(.15,.7,.2,1)',
        },
        {
          transform: `translate3d(0,${-distance * 0.9}px,0)`,
          filter: reduce ? 'none' : 'blur(.35px)',
          offset: 0.84,
          easing: 'cubic-bezier(.12,.72,.12,1)',
        },
        {
          transform: `translate3d(0,${-distance - (reduce ? 0 : 4)}px,0)`,
          filter: 'none',
          offset: 0.96,
        },
        { transform: `translate3d(0,${-distance}px,0)`, filter: 'none' },
      ],
      { duration, easing: 'linear', fill: 'forwards' },
    );
    this.activeAnimations.add(animation);
    await animation.finished.catch(() => undefined);
    this.activeAnimations.delete(animation);
    track.replaceChildren(...targetColumn.map((cell) => createSymbolElement(cell)));
    animation.cancel();
    track.style.removeProperty('--reel-cell-height');
    reel.classList.remove('reel--spinning');
    if (reelIndex === 0) this.setState('reelSettling');
    if (!reduce && !this.stopRequested) await wait(settleDuration);
  }

  private async presentTumbles(rounds: readonly TumbleRound[], speed: SpinSpeed): Promise<void> {
    this.setState('tumbleAnimating');
    const timing = PRESENTATION_TIMINGS[speed].win;
    const reduce = this.reducedMotion();
    const pause = (value: number) =>
      wait(reduce ? 16 : this.stopRequested ? Math.min(value, 70) : value);
    for (const round of rounds) {
      if (!round.boardBefore) continue;
      this.renderTraceBoard(round.boardBefore);
      const groups = round.winningSymbols
        .map(({ symbol, count }) => `${symbol} × ${count}`)
        .join(' · ');
      this.lastWinningGroups = groups;
      this.board.dataset.winningGroups = groups;
      this.markPositions(round.removedWinningCells, 'symbol--winning');
      await pause(this.stopRequested ? timing.stoppedHold : timing.hold);
      if (round.boardAfterRemoval) {
        this.markPositions(round.removedWinningCells, 'symbol--removing');
        delete this.board.dataset.winningGroups;
        await pause(timing.remove);
        if (round.bathala?.occurred) {
          this.board.dataset.bathalaRemoval = `BATHALA · ${round.bathala.targetSymbol ?? 'LOW SYMBOL'}`;
          this.markPositions(round.bathala.removedPositions, 'symbol--bathala-removing');
          await pause(timing.bathalaRemove);
        }
        this.renderTraceBoard(round.boardAfterRemoval);
        delete this.board.dataset.bathalaRemoval;
      }
      if (round.boardAfterCollapse) {
        this.renderTraceBoard(round.boardAfterCollapse, 'symbol--collapsing');
        await pause(timing.collapse);
      }
      if (round.boardAfterRefill) {
        this.renderTraceBoard(round.boardAfterRefill, 'symbol--refilling');
        await pause(timing.refill);
      }
    }
  }

  private markPositions(positions: readonly Position[], className: string): void {
    for (const { column, row } of positions)
      this.board
        .querySelector<HTMLElement>(`.reel:nth-child(${column + 1}) .symbol:nth-child(${row + 1})`)
        ?.classList.add(className);
  }

  private renderTraceBoard(board: Board, className?: string): void {
    const reels = [...this.board.querySelectorAll<HTMLElement>('.reel')];
    board.forEach((column, index) => {
      const track = reels[index]?.querySelector<HTMLElement>('.reel-track');
      if (!track) return;
      const symbols = column.map((cell) => createSymbolElement(cell));
      if (className) for (const symbol of symbols) symbol.classList.add(className);
      track.replaceChildren(...symbols);
    });
  }
}
