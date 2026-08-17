import type { Position, RegularSymbolId, SymbolWin } from '@lucky/shared-types';

export interface ConnectorPoint extends Position {
  readonly x: number;
  readonly y: number;
}

export interface ConnectorSegment {
  readonly from: ConnectorPoint;
  readonly to: ConnectorPoint;
}

/** Prim's algorithm produces a compact N-1 segment network without all-to-all clutter. */
export function minimumSpanningConnectorNetwork(
  points: readonly ConnectorPoint[],
): ConnectorSegment[] {
  if (points.length < 2) return [];
  const connected = new Set<number>([0]);
  const segments: ConnectorSegment[] = [];
  while (connected.size < points.length) {
    let best: { from: number; to: number; distance: number } | undefined;
    for (const from of connected) {
      for (let to = 0; to < points.length; to += 1) {
        if (connected.has(to)) continue;
        const left = points[from]!;
        const right = points[to]!;
        const distance = Math.hypot(left.x - right.x, left.y - right.y);
        if (!best || distance < best.distance) best = { from, to, distance };
      }
    }
    if (!best) break;
    connected.add(best.to);
    segments.push({ from: points[best.from]!, to: points[best.to]! });
  }
  return segments;
}

function svgNode<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS('http://www.w3.org/2000/svg', name);
}

export class WinConnectorLayer {
  private readonly svg: SVGSVGElement;
  private animations = new Set<Animation>();

  constructor(private readonly board: HTMLElement) {
    this.svg = svgNode('svg');
    this.svg.classList.add('win-connector-layer');
    this.svg.setAttribute('aria-hidden', 'true');
    this.board.append(this.svg);
  }

  private ensureAttached(): void {
    if (this.svg.parentElement !== this.board) this.board.append(this.svg);
  }

  clear(): void {
    this.ensureAttached();
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    this.svg.replaceChildren();
  }

  finish(): void {
    for (const animation of this.animations) animation.finish();
  }

  points(positions: readonly Position[]): ConnectorPoint[] {
    this.ensureAttached();
    const boardRect = this.board.getBoundingClientRect();
    const width = boardRect.width || 600;
    const height = boardRect.height || 500;
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    return positions.map((position) => {
      const cell = this.board.querySelector<HTMLElement>(
        `.symbol[data-column="${position.column}"][data-row="${position.row}"]`,
      );
      const rect = cell?.getBoundingClientRect();
      return {
        ...position,
        x:
          rect && rect.width
            ? rect.left - boardRect.left + rect.width / 2
            : ((position.column + 0.5) * width) / 6,
        y:
          rect && rect.height
            ? rect.top - boardRect.top + rect.height / 2
            : ((position.row + 0.5) * height) / 5,
      };
    });
  }

  drawGroup(
    groupId: RegularSymbolId | 'SCATTER',
    positions: readonly Position[],
    duration: number,
    reduce = false,
  ): Promise<void>[] {
    const segments = minimumSpanningConnectorNetwork(this.points(positions));
    return segments.map((segment, index) => {
      const line = svgNode('line');
      line.classList.add('win-connector');
      line.dataset.groupId = groupId;
      line.setAttribute('x1', String(segment.from.x));
      line.setAttribute('y1', String(segment.from.y));
      line.setAttribute('x2', String(segment.to.x));
      line.setAttribute('y2', String(segment.to.y));
      const length = Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
      line.style.strokeDasharray = String(length);
      this.svg.append(line);
      if (reduce) {
        line.style.strokeDashoffset = '0';
        return Promise.resolve();
      }
      if (typeof line.animate !== 'function') {
        line.style.strokeDashoffset = '0';
        return Promise.resolve();
      }
      const animation = line.animate(
        [{ strokeDashoffset: String(length) }, { strokeDashoffset: '0' }],
        {
          duration: duration * 0.6,
          delay: (duration * 0.4 * index) / Math.max(1, segments.length - 1),
          fill: 'both',
          easing: 'ease-out',
        },
      );
      this.animations.add(animation);
      return animation.finished
        .catch(() => undefined)
        .then(() => {
          this.animations.delete(animation);
        });
    });
  }
}

export function groupedWinningPositions(
  wins: readonly SymbolWin[],
): ReadonlyMap<RegularSymbolId, readonly Position[]> {
  return new Map(wins.map((win) => [win.symbol, win.positions]));
}
