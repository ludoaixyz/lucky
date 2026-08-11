import type { CascadeStage, GridCoordinate, SymbolId } from '@lucky/shared-types';

export const CASCADE_PRESENTATION_PHASES = [
  'WIN_HOLD',
  'CASCADE_CALLOUT',
  'REMOVE_WINNERS',
  'EMPTY_BEAT',
  'COLLAPSE',
  'REFILL',
  'LAND',
  'EVALUATE_NEXT_STAGE',
] as const;

export type CascadePresentationPhase = (typeof CASCADE_PRESENTATION_PHASES)[number];

export interface CascadePresentationTiming {
  readonly winHold: number;
  readonly callout: number;
  readonly removeWinners: number;
  readonly emptyBeat: number;
  readonly collapse: number;
  readonly refill: number;
  readonly land: number;
  readonly preEvaluation: number;
}

const MINIMUM_CASCADE_DURATION_MS = 24;

export function cascadePresentationTiming(
  speed = 1,
  additionalBoardIndex = 1,
  reducedMotion = false,
): CascadePresentationTiming {
  if (!Number.isFinite(speed) || speed <= 0)
    throw new RangeError('Cascade presentation speed must be finite and positive');
  if (!Number.isSafeInteger(additionalBoardIndex) || additionalBoardIndex < 1)
    throw new RangeError('Cascade board index must be a positive safe integer');
  const depthAcceleration = additionalBoardIndex >= 3 ? 0.85 : 1;
  const duration = (milliseconds: number): number =>
    Math.max(MINIMUM_CASCADE_DURATION_MS, Math.round((milliseconds * depthAcceleration) / speed));
  return {
    winHold: duration(reducedMotion ? 160 : 300),
    callout: duration(reducedMotion ? 180 : 350),
    removeWinners: duration(reducedMotion ? 90 : 200),
    emptyBeat: duration(reducedMotion ? 80 : 80),
    collapse: duration(reducedMotion ? 60 : 160),
    refill: duration(reducedMotion ? 80 : 220),
    land: duration(reducedMotion ? 50 : 80),
    preEvaluation: duration(reducedMotion ? 100 : 150),
  };
}

export interface SurvivorMove {
  readonly reel: number;
  readonly fromRow: number;
  readonly toRow: number;
  readonly symbolId: SymbolId;
}

export interface RefillEntry {
  readonly reel: number;
  readonly row: number;
  readonly symbolId: SymbolId;
}

export interface CascadeMotionPlan {
  readonly removedCoordinates: readonly GridCoordinate[];
  readonly survivorMoves: readonly SurvivorMove[];
  readonly refillEntries: readonly RefillEntry[];
}

export function planCascadeMotion(
  currentWindow: readonly (readonly SymbolId[])[],
  nextWindow: readonly (readonly SymbolId[])[],
  removedCoordinates: readonly GridCoordinate[],
): CascadeMotionPlan {
  if (currentWindow.length !== nextWindow.length)
    throw new Error('Cascade windows must contain the same reel count');
  const removedKeys = new Set(removedCoordinates.map(({ reel, row }) => `${reel}:${row}`));
  const survivorMoves: SurvivorMove[] = [];
  const refillEntries: RefillEntry[] = [];
  currentWindow.forEach((column, reel) => {
    const nextColumn = nextWindow[reel];
    if (!nextColumn || nextColumn.length !== column.length)
      throw new Error(`Cascade reel ${reel + 1} has an incompatible resolved window`);
    const survivors = column
      .map((symbolId, fromRow) => ({ symbolId, fromRow }))
      .filter(({ fromRow }) => !removedKeys.has(`${reel}:${fromRow}`));
    const refillCount = column.length - survivors.length;
    survivors.forEach(({ symbolId, fromRow }, survivorIndex) => {
      const toRow = refillCount + survivorIndex;
      if (nextColumn[toRow] !== symbolId)
        throw new Error(`Cascade survivor mismatch on reel ${reel + 1}, row ${toRow + 1}`);
      survivorMoves.push({ reel, fromRow, toRow, symbolId });
    });
    for (let row = 0; row < refillCount; row += 1) {
      const symbolId = nextColumn[row];
      if (symbolId === undefined)
        throw new Error(`Cascade refill is missing reel ${reel + 1}, row ${row + 1}`);
      refillEntries.push({ reel, row, symbolId });
    }
  });
  return { removedCoordinates: [...removedCoordinates], survivorMoves, refillEntries };
}

export class CascadePresentationStateMachine {
  private active = false;
  private phaseIndex = -1;
  private boardIndex = 0;
  private cumulativeWinCredits = 0;
  private readonly creditedStages = new Set<number>();

  beginStage(additionalBoardIndex: number): void {
    if (!Number.isSafeInteger(additionalBoardIndex) || additionalBoardIndex < 1)
      throw new RangeError('Cascade board index must be a positive safe integer');
    if (this.active && additionalBoardIndex !== this.boardIndex + 1)
      throw new Error('Cascade stages must advance exactly once and in order');
    this.active = true;
    this.boardIndex = additionalBoardIndex;
    this.phaseIndex = 0;
  }

  advance(phase: CascadePresentationPhase): void {
    if (!this.active) throw new Error('Cannot advance an inactive cascade presentation');
    const expectedIndex = this.phaseIndex + 1;
    if (CASCADE_PRESENTATION_PHASES[expectedIndex] !== phase)
      throw new Error(
        `Invalid cascade phase transition; expected ${CASCADE_PRESENTATION_PHASES[expectedIndex] ?? 'finish'}, received ${phase}`,
      );
    this.phaseIndex = expectedIndex;
  }

  creditResolvedStage(stage: Pick<CascadeStage, 'index' | 'payoutCredits'>): number {
    if (!this.active || stage.index !== this.boardIndex)
      throw new Error('Cascade payout does not match the active resolved stage');
    if (!this.creditedStages.has(stage.index)) {
      this.creditedStages.add(stage.index);
      this.cumulativeWinCredits += stage.payoutCredits;
    }
    return this.cumulativeWinCredits;
  }

  finish(): void {
    this.active = false;
    this.phaseIndex = -1;
    this.boardIndex = 0;
    this.cumulativeWinCredits = 0;
    this.creditedStages.clear();
  }

  snapshot(): {
    readonly active: boolean;
    readonly phase: CascadePresentationPhase | null;
    readonly additionalBoardIndex: number;
    readonly cumulativeWinCredits: number;
  } {
    return {
      active: this.active,
      phase: this.active ? (CASCADE_PRESENTATION_PHASES[this.phaseIndex] ?? null) : null,
      additionalBoardIndex: this.boardIndex,
      cumulativeWinCredits: this.cumulativeWinCredits,
    };
  }
}
