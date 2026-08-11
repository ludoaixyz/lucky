import type { TranslationDictionary } from '../types.js';
import { formatCredits, formatNumber } from '../format.js';

const locale = 'en-US';
const spinCount = (count: number): string =>
  `${formatNumber(locale, count)} ${count === 1 ? 'spin' : 'spins'}`;

export const enUS = {
  languageName: 'English',
  static: {
    pageGameRegion: 'Five-reel simulated-credit prototype',
    reelsAria: 'Five reels with three visible symbol rows',
    mascotAlt: 'Three intertwined golden Chinese dragons, the LUCKY888 mascot',
    controlPanel: 'Prototype spin controls',
    languageSelector: 'Language',
    credits: 'Credits',
    betSize: 'Bet Size',
    latestWin: 'Latest Win',
    animationSpeed: 'Animation Speed',
    betAmount: 'Bet Amount',
    numberOfSpins: 'Number of Spins',
    session: 'SESSION',
    diagnosticsTitle: 'Spin Diagnostics',
    downloadCsv: 'Download CSV',
    totalSpins: 'Total Spins',
    totalWagered: 'Total Wagered',
    totalWon: 'Total Won',
    sessionRtp: 'Session RTP',
    uncappedReturn: 'Uncapped Return',
    capReduction: 'Cap Reduction',
    featureTriggerRate: 'Feature Trigger Rate',
    averageFeatureLength: 'Average Feature Length',
    recentSpins: 'Recent Spins',
    latestTen: 'Latest 10',
    completedSpinsEmpty: 'Completed spins will appear here.',
  },
  controls: {
    spin: 'SPIN',
    stop: 'STOP',
    spinAria: (count) => `Start ${spinCount(count)}`,
    stopAria: 'Stop after the current spin and feature',
    speedValue: (speed) => `${formatNumber(locale, speed)}× speed`,
    betValue: (amount) => `${formatNumber(locale, amount)} credits`,
    spinsValue: spinCount,
    languageSelected: (language) => `${language} selected.`,
  },
  messages: {
    loadingConfiguration: () => 'Loading configuration…',
    ready: () => 'Ready to spin.',
    noWin: () => 'No win.',
    won: ({ amount }) => `Won ${formatCredits(locale, amount)}.`,
    paidSpin: ({ current, total }) => `Spin ${current} of ${total}.`,
    sequenceCompleted: ({ completed, total, current, amount }) =>
      `${completed}/${total} spins completed · Spin ${current}/${total} · Won ${formatCredits(locale, amount)}.`,
    insufficientCredits: () => 'Sequence stopped: insufficient credits.',
    sequenceStopped: ({ completed, total }) =>
      `Sequence stopped after ${completed}/${total} spins.`,
    freeSpinProgress: ({ paidCurrent, paidTotal, current, total, remaining }) =>
      `Paid spin ${paidCurrent} of ${paidTotal} · Free spin ${current} of ${total} · ${spinCount(remaining)} remaining.`,
    freeSpinsAwarded: ({ count }) =>
      `${formatNumber(locale, count)} free ${count === 1 ? 'spin' : 'spins'} awarded.`,
    baseWin: ({ amount }) => `Base win ${formatCredits(locale, amount)}.`,
    retrigger: ({ count, subtotal }) =>
      `Retriggered ${spinCount(count)} · Feature subtotal ${formatCredits(locale, subtotal)}.`,
    featureSubtotal: ({ amount }) => `Feature subtotal ${formatCredits(locale, amount)}.`,
    featureComplete: ({ amount }) => `Feature complete · Won ${formatCredits(locale, amount)}.`,
    finalWin: ({ amount, base, feature }) =>
      `Won ${formatCredits(locale, amount)} · Base ${formatCredits(locale, base)} · Feature ${formatCredits(locale, feature)}.`,
    spinFailed: () => 'Spin failed.',
    unableToStart: () => 'Unable to start.',
  },
  diagnostics: {
    spinNumber: (spin) => `Spin #${formatNumber(locale, spin)}`,
    bet: 'Bet',
    base: 'Base',
    feature: 'Feature',
    credited: 'Credited',
    net: 'Net',
    credits: 'Credits',
    outcome: 'Outcome',
    stops: 'Stops',
    lineWins: 'Line wins',
    scattersAndCap: 'Scatters / cap',
    no: 'No',
    applied: 'applied',
    notApplied: 'not applied',
    featureSummary: ({ initial, played, added, retriggers }) =>
      `${initial} initial, ${played} played, ${added} added, ${retriggerCount(retriggers)}`,
  },
  presentation: {
    winningPaylines: (count) => `${count} winning ${count === 1 ? 'payline' : 'paylines'}`,
    cascade: (additionalBoardIndex) => `CASCADE ×${formatNumber(locale, additionalBoardIndex)}`,
    cascadeWin: (amount) => `CASCADE WIN  ${formatCredits(locale, amount)}`,
  },
} satisfies TranslationDictionary;

function retriggerCount(count: number): string {
  return `${count} ${count === 1 ? 'retrigger' : 'retriggers'}`;
}
