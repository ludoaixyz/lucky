import type { RuntimeGameConfig } from '@lucky/shared-types';

export function fixtureConfig(): RuntimeGameConfig {
  return {
    schemaVersion: '1.0.0',
    gameId: 'fixture',
    gameVersion: '1.0.0',
    configurationId: 'fixture-v1',
    reelCount: 3,
    visibleRows: 1,
    lineBetCredits: 1,
    totalBetCredits: 1,
    maximumWinCredits: 50,
    symbols: [
      { id: 'A', name: 'A', category: 'regular', display: 'A' },
      { id: 'B', name: 'B', category: 'regular', display: 'B' },
      { id: 'W', name: 'Wild', category: 'wild', display: 'W' },
      { id: 'S', name: 'Scatter', category: 'scatter', display: 'S' },
    ],
    reelStrips: [
      ['A', 'B', 'S'],
      ['A', 'B', 'S'],
      ['A', 'B', 'S'],
    ],
    paylines: [{ id: 'L1', rows: [0, 0, 0] }],
    paytable: [
      { symbolId: 'A', count: 3, awardCredits: 10 },
      { symbolId: 'B', count: 3, awardCredits: 5 },
    ],
    bonus: {
      schemaVersion: '1.1.0',
      enabled: true,
      triggerSymbolId: 'S',
      triggerEvaluation: 'anywhere',
      minimumCount: 3,
      awards: [{ count: 3, freeSpins: 2 }],
      freeSpinMultiplier: 1,
      retriggerEnabled: true,
      retriggerAwards: [{ count: 3, freeSpins: 1 }],
      maximumFeatureSpins: 10,
      maximumRetriggers: 2,
      scatterPaysCredits: false,
      useAlternateReelStrips: false,
      useAlternatePaytable: false,
    },
  };
}
