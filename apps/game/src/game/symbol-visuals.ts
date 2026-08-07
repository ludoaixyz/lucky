import type { SymbolId } from '@lucky/shared-types';

export interface SymbolVisual {
  readonly family: string;
  readonly highlight: string;
  readonly mid: string;
  readonly shadow: string;
  readonly accent: string;
  readonly glow: string;
}

export const SYMBOL_VISUALS = {
  A: {
    family: 'deep-blue',
    highlight: '#367fc2',
    mid: '#174f88',
    shadow: '#071b38',
    accent: '#7ac8ff',
    glow: '#4da8ff',
  },
  K: {
    family: 'royal-purple',
    highlight: '#8c5bd2',
    mid: '#542d91',
    shadow: '#21103f',
    accent: '#c69aff',
    glow: '#a76cff',
  },
  Q: {
    family: 'emerald',
    highlight: '#31a878',
    mid: '#116044',
    shadow: '#062d27',
    accent: '#78edbc',
    glow: '#39d99b',
  },
  J: {
    family: 'crimson',
    highlight: '#c7475d',
    mid: '#812338',
    shadow: '#3b0b1c',
    accent: '#ff8b99',
    glow: '#ff536f',
  },
  GEM: {
    family: 'turquoise',
    highlight: '#2bb7bd',
    mid: '#0d717d',
    shadow: '#07333e',
    accent: '#7ff4ed',
    glow: '#31dcd7',
  },
  WILD: {
    family: 'burnt-orange',
    highlight: '#c96932',
    mid: '#7d351d',
    shadow: '#35160d',
    accent: '#ffad68',
    glow: '#ff7c3a',
  },
  SCATTER: {
    family: 'magenta',
    highlight: '#c248a1',
    mid: '#7d286d',
    shadow: '#35102f',
    accent: '#ff91df',
    glow: '#f35bc3',
  },
} as const satisfies Readonly<Record<string, SymbolVisual>>;

export type ConfiguredSymbolId = keyof typeof SYMBOL_VISUALS;

export function symbolVisual(symbolId: SymbolId): SymbolVisual {
  const visual = SYMBOL_VISUALS[symbolId as ConfiguredSymbolId];
  if (!visual) throw new Error(`Symbol '${symbolId}' has no visual configuration`);
  return visual;
}

export function symbolTextureKey(symbolId: SymbolId): string {
  symbolVisual(symbolId);
  return `symbol-frame-${symbolId}`;
}
