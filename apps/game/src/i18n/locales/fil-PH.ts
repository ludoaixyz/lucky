import type { TranslationDictionary } from '../types.js';
import { formatCredits, formatNumber } from '../format.js';

const locale = 'fil-PH';
const spinCount = (count: number): string => `${formatNumber(locale, count)} spin`;
const freeSpinCount = (count: number): string => `${formatNumber(locale, count)} libreng spin`;

export const filPH = {
  languageName: 'Filipino',
  static: {
    pageGameRegion: 'Prototype na may limang reel at simulated credits',
    reelsAria: 'Limang reel na may tig-tatlong nakikitang hanay ng simbolo',
    mascotAlt: 'Tatlong magkakaugnay na gintong Chinese dragon, ang mascot ng LUCKY888',
    controlPanel: 'Mga kontrol sa pag-spin ng prototype',
    languageSelector: 'Wika',
    credits: 'Credits',
    betSize: 'Laki ng Taya',
    latestWin: 'Pinakahuling Panalo',
    animationSpeed: 'Bilis ng Animation',
    betAmount: 'Halaga ng Taya',
    numberOfSpins: 'Bilang ng Spins',
    session: 'SESYON',
    diagnosticsTitle: 'Mga Diagnostic ng Spin',
    downloadCsv: 'I-download ang CSV',
    totalSpins: 'Kabuuang Spins',
    totalWagered: 'Kabuuang Itinaya',
    totalWon: 'Kabuuang Napanalunan',
    sessionRtp: 'RTP ng Sesyon',
    uncappedReturn: 'Return Bago ang Limit',
    capReduction: 'Bawas Dahil sa Limit',
    featureTriggerRate: 'Dalas ng Feature Trigger',
    averageFeatureLength: 'Average na Haba ng Feature',
    recentSpins: 'Mga Kamakailang Spin',
    latestTen: 'Pinakahuling 10',
    completedSpinsEmpty: 'Dito lalabas ang mga natapos na spin.',
  },
  controls: {
    spin: 'SPIN',
    spinAria: (count) => `Simulan ang ${spinCount(count)}`,
    speedValue: (speed) => `Bilis: ${formatNumber(locale, speed)}×`,
    betValue: (amount) => `${formatNumber(locale, amount)} credits`,
    spinsValue: spinCount,
    languageSelected: (language) => `Napili ang ${language}.`,
  },
  messages: {
    loadingConfiguration: () => 'Nilo-load ang configuration…',
    ready: () => 'Handa nang mag-spin.',
    noWin: () => 'Walang panalo.',
    won: ({ amount }) => `Nanalo ng ${formatCredits(locale, amount)}.`,
    paidSpin: ({ current, total }) => `Spin ${current} sa ${total}.`,
    sequenceCompleted: ({ completed, total, current, amount }) =>
      `${completed}/${total} spin ang natapos · Spin ${current}/${total} · Nanalo ng ${formatCredits(locale, amount)}.`,
    insufficientCredits: () => 'Huminto ang sequence: kulang ang credits.',
    sequenceStopped: ({ completed, total }) =>
      `Huminto ang sequence matapos ang ${completed}/${total} spin.`,
    freeSpinProgress: ({ paidCurrent, paidTotal, current, total, remaining }) =>
      `Bayad na spin ${paidCurrent}/${paidTotal} · Libreng spin ${current}/${total} · ${spinCount(remaining)} ang natitira.`,
    freeSpinsAwarded: ({ count }) => `Nakatanggap ng ${freeSpinCount(count)}.`,
    baseWin: ({ amount }) => `Base win: ${formatCredits(locale, amount)}.`,
    retrigger: ({ count, subtotal }) =>
      `Nagdagdag ng ${freeSpinCount(count)} · Feature subtotal: ${formatCredits(locale, subtotal)}.`,
    featureSubtotal: ({ amount }) => `Feature subtotal: ${formatCredits(locale, amount)}.`,
    featureComplete: ({ amount }) =>
      `Tapos na ang feature · Nanalo ng ${formatCredits(locale, amount)}.`,
    finalWin: ({ amount, base, feature }) =>
      `Nanalo ng ${formatCredits(locale, amount)} · Base ${formatCredits(locale, base)} · Feature ${formatCredits(locale, feature)}.`,
    spinFailed: () => 'Hindi natuloy ang spin.',
    unableToStart: () => 'Hindi makapagsimula.',
  },
  diagnostics: {
    spinNumber: (spin) => `Spin #${formatNumber(locale, spin)}`,
    bet: 'Taya',
    base: 'Base',
    feature: 'Feature',
    credited: 'Na-credit',
    net: 'Net',
    credits: 'Credits',
    outcome: 'Resulta',
    stops: 'Stops',
    lineWins: 'Mga Panalong Payline',
    scattersAndCap: 'SCATTER / limit',
    no: 'Wala',
    applied: 'inilapat',
    notApplied: 'hindi inilapat',
    featureSummary: ({ initial, played, added, retriggers }) =>
      `${initial} paunang spin, ${played} nalaro, ${added} idinagdag, ${retriggers} retrigger`,
  },
  presentation: {
    winningPaylines: (count) => `${formatNumber(locale, count)} panalong payline`,
  },
} satisfies TranslationDictionary;
