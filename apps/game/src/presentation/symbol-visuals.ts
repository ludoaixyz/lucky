import type { BathalaSymbolId, SymbolCell } from '@lucky/shared-types';

export interface SymbolVisualDefinition {
  readonly id: BathalaSymbolId;
  readonly tier: 'low' | 'high' | 'special';
  readonly label: string;
  readonly icon: string;
  readonly shape:
    | 'diamond'
    | 'circle'
    | 'hexagon'
    | 'triangle'
    | 'crest'
    | 'crown'
    | 'star'
    | 'shield'
    | 'lotus'
    | 'scatter'
    | 'multiplier';
  readonly surface: string;
  readonly shadow: string;
  readonly accent: string;
  readonly glow: string;
}

export const BATHALA_SYMBOL_VISUALS: Readonly<Record<BathalaSymbolId, SymbolVisualDefinition>> = {
  L1: {
    id: 'L1',
    tier: 'low',
    label: 'L1',
    icon: '◆',
    shape: 'diamond',
    surface: '#2076b8',
    shadow: '#0c3158',
    accent: '#7bd8ff',
    glow: '#2eb9ff',
  },
  L2: {
    id: 'L2',
    tier: 'low',
    label: 'L2',
    icon: '●',
    shape: 'circle',
    surface: '#278b63',
    shadow: '#0b4934',
    accent: '#8af0bd',
    glow: '#38d98b',
  },
  L3: {
    id: 'L3',
    tier: 'low',
    label: 'L3',
    icon: '⬢',
    shape: 'hexagon',
    surface: '#c66a24',
    shadow: '#65300f',
    accent: '#ffd08b',
    glow: '#ff9d3d',
  },
  L4: {
    id: 'L4',
    tier: 'low',
    label: 'L4',
    icon: '▲',
    shape: 'triangle',
    surface: '#7652b8',
    shadow: '#35225f',
    accent: '#d2b5ff',
    glow: '#a879ff',
  },
  L5: {
    id: 'L5',
    tier: 'low',
    label: 'L5',
    icon: '✚',
    shape: 'crest',
    surface: '#168c9d',
    shadow: '#07505c',
    accent: '#8eeef3',
    glow: '#28d6df',
  },
  H1: {
    id: 'H1',
    tier: 'high',
    label: 'H1',
    icon: '♜',
    shape: 'crown',
    surface: '#9d2830',
    shadow: '#481015',
    accent: '#ffd66b',
    glow: '#ff5e50',
  },
  H2: {
    id: 'H2',
    tier: 'high',
    label: 'H2',
    icon: '✦',
    shape: 'star',
    surface: '#6635a5',
    shadow: '#2d1456',
    accent: '#ffe080',
    glow: '#b07aff',
  },
  H3: {
    id: 'H3',
    tier: 'high',
    label: 'H3',
    icon: '♢',
    shape: 'shield',
    surface: '#147b58',
    shadow: '#073d2b',
    accent: '#ffdc74',
    glow: '#35d498',
  },
  H4: {
    id: 'H4',
    tier: 'high',
    label: 'H4',
    icon: '♛',
    shape: 'lotus',
    surface: '#24599b',
    shadow: '#0b2953',
    accent: '#f9f3d7',
    glow: '#73b9ff',
  },
  SCATTER: {
    id: 'SCATTER',
    tier: 'special',
    label: 'SCATTER',
    icon: '✹',
    shape: 'scatter',
    surface: '#7c3bc0',
    shadow: '#2f1357',
    accent: '#ffe879',
    glow: '#c28aff',
  },
  MULTIPLIER: {
    id: 'MULTIPLIER',
    tier: 'special',
    label: 'MULTI',
    icon: '×',
    shape: 'multiplier',
    surface: '#e3972d',
    shadow: '#6b310a',
    accent: '#fff3a0',
    glow: '#ffcc4d',
  },
};

export const BATHALA_SYMBOL_IDS = Object.freeze(
  Object.keys(BATHALA_SYMBOL_VISUALS) as BathalaSymbolId[],
);

export function symbolVisual(id: BathalaSymbolId): SymbolVisualDefinition {
  return BATHALA_SYMBOL_VISUALS[id];
}

export function createSymbolElement(cell: SymbolCell | null): HTMLElement {
  const tile = document.createElement('div');
  tile.className = 'symbol';
  if (!cell) {
    tile.classList.add('symbol--empty');
    return tile;
  }
  const visual = symbolVisual(cell.symbol);
  tile.dataset.cellId = cell.id;
  tile.classList.add(`symbol--${visual.tier}`, `symbol--shape-${visual.shape}`);
  tile.dataset.symbolId = visual.id;
  tile.style.setProperty('--symbol-surface', visual.surface);
  tile.style.setProperty('--symbol-shadow', visual.shadow);
  tile.style.setProperty('--symbol-accent', visual.accent);
  tile.style.setProperty('--symbol-glow', visual.glow);
  const icon = document.createElement('span');
  icon.className = 'symbol-icon';
  icon.textContent =
    cell.symbol === 'MULTIPLIER' ? `${visual.icon}${cell.multiplierValue ?? ''}` : visual.icon;
  const label = document.createElement('span');
  label.className = 'symbol-label';
  label.textContent = visual.label;
  tile.append(icon, label);
  return tile;
}
