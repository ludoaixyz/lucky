import type { TranslationDictionary } from '../types.js';
import { formatCredits, formatNumber } from '../format.js';

const locale = 'pt-BR';
const spinCount = (count: number): string =>
  `${formatNumber(locale, count)} ${count === 1 ? 'giro' : 'giros'}`;

export const ptBR = {
  languageName: 'Português do Brasil',
  static: {
    pageGameRegion: 'Protótipo simulado de cinco rolos',
    reelsAria: 'Cinco rolos com três linhas de símbolos visíveis',
    mascotAlt: 'Três dragões chineses dourados entrelaçados, o mascote do LUCKY888',
    controlPanel: 'Controles de giro do protótipo',
    languageSelector: 'Idioma',
    credits: 'Créditos',
    betSize: 'Tamanho da aposta',
    latestWin: 'Último prêmio',
    animationSpeed: 'Velocidade da animação',
    betAmount: 'Valor da aposta',
    numberOfSpins: 'Número de giros',
    session: 'SESSÃO',
    diagnosticsTitle: 'Diagnóstico de Giros',
    downloadCsv: 'Baixar CSV',
    totalSpins: 'Total de Giros',
    totalWagered: 'Total Apostado',
    totalWon: 'Total Ganho',
    sessionRtp: 'RTP da Sessão',
    uncappedReturn: 'Retorno sem Limite',
    capReduction: 'Redução pelo Limite',
    featureTriggerRate: 'Frequência do Recurso',
    averageFeatureLength: 'Duração Média do Recurso',
    recentSpins: 'Giros Recentes',
    latestTen: 'Últimos 10',
    completedSpinsEmpty: 'Os giros concluídos aparecerão aqui.',
  },
  controls: {
    spin: 'SPIN',
    spinAria: (count) => `Iniciar ${spinCount(count)}`,
    speedValue: (speed) => `Velocidade ${formatNumber(locale, speed)}×`,
    betValue: (amount) => `${formatNumber(locale, amount)} créditos`,
    spinsValue: spinCount,
    languageSelected: (language) => `${language} selecionado.`,
  },
  messages: {
    loadingConfiguration: () => 'Carregando configuração…',
    ready: () => 'Pronto para girar.',
    noWin: () => 'Sem prêmio.',
    won: ({ amount }) => `Ganhou ${formatCredits(locale, amount)}.`,
    paidSpin: ({ current, total }) => `Giro ${current} de ${total}.`,
    sequenceCompleted: ({ completed, total, current, amount }) =>
      `${completed}/${total} giros concluídos · Giro ${current}/${total} · Ganhou ${formatCredits(locale, amount)}.`,
    insufficientCredits: () => 'Sequência interrompida: créditos insuficientes.',
    sequenceStopped: ({ completed, total }) =>
      `Sequência interrompida após ${completed}/${total} giros.`,
    freeSpinProgress: ({ paidCurrent, paidTotal, current, total, remaining }) =>
      `Giro pago ${paidCurrent} de ${paidTotal} · Giro grátis ${current} de ${total} · Restam ${spinCount(remaining)}.`,
    freeSpinsAwarded: ({ count }) =>
      `${formatNumber(locale, count)} ${count === 1 ? 'giro grátis concedido' : 'giros grátis concedidos'}.`,
    baseWin: ({ amount }) => `Prêmio base ${formatCredits(locale, amount)}.`,
    retrigger: ({ count, subtotal }) =>
      `Mais ${spinCount(count)} grátis · Subtotal do recurso ${formatCredits(locale, subtotal)}.`,
    featureSubtotal: ({ amount }) => `Subtotal do recurso ${formatCredits(locale, amount)}.`,
    featureComplete: ({ amount }) => `Recurso concluído · Ganhou ${formatCredits(locale, amount)}.`,
    finalWin: ({ amount, base, feature }) =>
      `Ganhou ${formatCredits(locale, amount)} · Base ${formatCredits(locale, base)} · Recurso ${formatCredits(locale, feature)}.`,
    spinFailed: () => 'Falha no giro.',
    unableToStart: () => 'Não foi possível iniciar.',
  },
  diagnostics: {
    spinNumber: (spin) => `Giro #${formatNumber(locale, spin)}`,
    bet: 'Aposta',
    base: 'Base',
    feature: 'Recurso',
    credited: 'Creditado',
    net: 'Líquido',
    credits: 'Créditos',
    outcome: 'Resultado',
    stops: 'Paradas',
    lineWins: 'Linhas premiadas',
    scattersAndCap: 'Scatters / limite',
    no: 'Não',
    applied: 'aplicado',
    notApplied: 'não aplicado',
    featureSummary: ({ initial, played, added, retriggers }) =>
      `${initial} iniciais, ${played} jogados, ${added} adicionados, ${retriggers} reativações`,
  },
  presentation: {
    winningPaylines: (count) => `${count} ${count === 1 ? 'linha premiada' : 'linhas premiadas'}`,
  },
} satisfies TranslationDictionary;
