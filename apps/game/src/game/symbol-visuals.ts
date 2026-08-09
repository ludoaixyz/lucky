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
  COIN: {
    family: 'antique-gold',
    highlight: '#f6c85f',
    mid: '#b67819',
    shadow: '#4b2805',
    accent: '#fff0a3',
    glow: '#ffc83d',
  },
  DRAGON: {
    family: 'jade-dragon',
    highlight: '#55c77a',
    mid: '#217143',
    shadow: '#092d1f',
    accent: '#b5ffbe',
    glow: '#65e58a',
  },
  EIGHT: {
    family: 'imperial-red',
    highlight: '#ef5b4e',
    mid: '#a51f26',
    shadow: '#450914',
    accent: '#ffd16d',
    glow: '#ff493d',
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

const FALLBACK_SYMBOL_VISUAL: SymbolVisual = {
  family: 'unmapped-development-fallback',
  highlight: '#ff4d6d',
  mid: '#8f1838',
  shadow: '#2b0714',
  accent: '#fff2a8',
  glow: '#ff335f',
};
const reportedMissingSymbols = new Set<SymbolId>();

export function hasSymbolVisual(symbolId: SymbolId): symbolId is ConfiguredSymbolId {
  return Object.hasOwn(SYMBOL_VISUALS, symbolId);
}

export function symbolVisual(symbolId: SymbolId): SymbolVisual {
  if (hasSymbolVisual(symbolId)) return SYMBOL_VISUALS[symbolId];
  if (!reportedMissingSymbols.has(symbolId)) {
    reportedMissingSymbols.add(symbolId);
    console.error(`Unable to render symbol: missing presentation mapping for ${symbolId}`);
  }
  return FALLBACK_SYMBOL_VISUAL;
}

export function symbolTextureKey(symbolId: SymbolId): string {
  return `symbol-frame-${symbolId}`;
}
