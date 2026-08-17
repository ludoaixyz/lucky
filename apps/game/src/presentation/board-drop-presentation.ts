import type { Board, Position } from '@lucky/shared-types';
import { createSymbolElement } from './symbol-visuals.js';
import { PRESENTATION_TIMINGS, type SpinSpeed } from './presentation-timings.js';

export interface CellMotion {
  readonly position: Position;
  readonly distance: number;
  readonly delay: number;
  readonly duration: number;
  readonly landing: number;
}

export function fallingSymbolKeyframes(
  distance: number,
  reduce = false,
  landingPortion = 0.12,
): Keyframe[] {
  const travel = reduce ? Math.min(distance, 18) : distance;
  const landingOffset = Math.max(0.76, Math.min(0.92, 1 - landingPortion));
  return [
    {
      transform: `translate3d(0,${-travel}px,0) scaleY(1)`,
      opacity: 0,
      offset: 0,
      easing: 'cubic-bezier(.44,.02,.82,.34)',
    },
    {
      transform: `translate3d(0,${-travel * 0.93}px,0) scaleY(1)`,
      opacity: 1,
      offset: 0.16,
      easing: 'cubic-bezier(.42,.02,.8,.3)',
    },
    {
      transform: `translate3d(0,${-travel * 0.28}px,0) scaleY(1)`,
      opacity: 1,
      offset: 0.68,
      easing: 'cubic-bezier(.18,.62,.2,1)',
    },
    {
      transform: 'translate3d(0,3px,0) scaleY(.97)',
      opacity: 1,
      offset: landingOffset,
      easing: 'cubic-bezier(.12,.72,.18,1)',
    },
    { transform: 'translate3d(0,0,0) scaleY(1)', opacity: 1, offset: 1 },
  ];
}

export function renderBoardCells(boardElement: HTMLElement, board: Board): void {
  const columns = [...boardElement.querySelectorAll<HTMLElement>('.reel')];
  if (columns.length !== board.length)
    throw new Error('Rendered column count does not match the resolved board');
  board.forEach((column, columnIndex) => {
    const track = columns[columnIndex]?.querySelector<HTMLElement>('.reel-track');
    if (!track) throw new Error(`Column ${columnIndex + 1} is missing its cell track`);
    track.replaceChildren(
      ...column.map((cell, row) => {
        const symbol = createSymbolElement(cell);
        symbol.dataset.column = String(columnIndex);
        symbol.dataset.row = String(row);
        return symbol;
      }),
    );
  });
}

export function cellDropMotion(
  boardElement: HTMLElement,
  position: Position,
  speed: SpinSpeed,
  reduce = false,
): CellMotion {
  const profile = PRESENTATION_TIMINGS[speed].drop;
  const rows = boardElement.querySelectorAll('.reel:first-child .symbol').length || 5;
  const boardHeight = boardElement.clientHeight || 500;
  const cellHeight = Math.max(1, boardHeight / rows);
  return {
    position,
    distance: boardHeight + position.row * cellHeight,
    delay: reduce ? 0 : position.column * profile.columnStagger + position.row * profile.rowStagger,
    duration: reduce ? 140 : profile.motion,
    landing: reduce ? 40 : profile.landing,
  };
}
