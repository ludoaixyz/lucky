import type { TranslationDictionary } from '../types.js';
import { formatCredits, formatNumber } from '../format.js';

const locale = 'zh-CN';
const spinCount = (count: number): string => `${formatNumber(locale, count)} 次旋转`;

export const zhCN = {
  languageName: '简体中文',
  static: {
    pageGameRegion: '五轴模拟积分原型',
    reelsAria: '五个转轴，每轴显示三行符号',
    mascotAlt: '三条相互缠绕的金色中国龙，LUCKY888 吉祥物',
    controlPanel: '原型旋转控制',
    languageSelector: '语言',
    credits: '积分',
    betSize: '投注档位',
    latestWin: '最近赢分',
    animationSpeed: '动画速度',
    betAmount: '投注金额',
    numberOfSpins: '旋转次数',
    session: '本次记录',
    diagnosticsTitle: '旋转诊断',
    downloadCsv: '下载 CSV',
    totalSpins: '旋转总数',
    totalWagered: '投注总额',
    totalWon: '赢分总额',
    sessionRtp: '本次 RTP',
    uncappedReturn: '未封顶回报',
    capReduction: '封顶扣减',
    featureTriggerRate: '功能触发率',
    averageFeatureLength: '平均功能长度',
    recentSpins: '最近旋转',
    latestTen: '最近 10 次',
    completedSpinsEmpty: '已完成的旋转将显示在这里。',
  },
  controls: {
    spin: 'SPIN',
    stop: 'STOP',
    stopAria: '\u5f53\u524d\u65cb\u8f6c\u548c\u529f\u80fd\u5b8c\u6210\u540e\u505c\u6b62',
    spinAria: (count) => `开始${spinCount(count)}`,
    speedValue: (speed) => `${formatNumber(locale, speed)}× 速度`,
    betValue: (amount) => `${formatNumber(locale, amount)} 积分`,
    spinsValue: spinCount,
    languageSelected: (language) => `已选择${language}。`,
  },
  messages: {
    loadingConfiguration: () => '正在加载配置…',
    ready: () => '可以旋转。',
    noWin: () => '未中奖。',
    won: ({ amount }) => `赢得 ${formatCredits(locale, amount)}。`,
    paidSpin: ({ current, total }) => `第 ${current}/${total} 次旋转。`,
    sequenceCompleted: ({ completed, total, current, amount }) =>
      `已完成 ${completed}/${total} 次旋转 · 第 ${current}/${total} 次 · 赢得 ${formatCredits(locale, amount)}。`,
    insufficientCredits: () => '序列已停止：积分不足。',
    sequenceStopped: ({ completed, total }) => `序列已停止，已完成 ${completed}/${total} 次旋转。`,
    freeSpinProgress: ({ paidCurrent, paidTotal, current, total, remaining }) =>
      `付费旋转 ${paidCurrent}/${paidTotal} · 免费旋转 ${current}/${total} · 剩余 ${spinCount(remaining)}。`,
    freeSpinsAwarded: ({ count }) => `获得 ${formatNumber(locale, count)} 次免费旋转。`,
    baseWin: ({ amount }) => `基础赢分 ${formatCredits(locale, amount)}。`,
    retrigger: ({ count, subtotal }) =>
      `再次触发 ${spinCount(count)} · 功能小计 ${formatCredits(locale, subtotal)}。`,
    featureSubtotal: ({ amount }) => `功能小计 ${formatCredits(locale, amount)}。`,
    featureComplete: ({ amount }) => `功能完成 · 赢得 ${formatCredits(locale, amount)}。`,
    finalWin: ({ amount, base, feature }) =>
      `赢得 ${formatCredits(locale, amount)} · 基础 ${formatCredits(locale, base)} · 功能 ${formatCredits(locale, feature)}。`,
    spinFailed: () => '旋转失败。',
    unableToStart: () => '无法启动。',
  },
  diagnostics: {
    spinNumber: (spin) => `旋转 #${formatNumber(locale, spin)}`,
    bet: '投注',
    base: '基础',
    feature: '功能',
    credited: '已计入',
    net: '净值',
    credits: '积分',
    outcome: '结果',
    stops: '停止位',
    lineWins: '中奖线',
    scattersAndCap: 'SCATTER / 封顶',
    no: '否',
    applied: '已应用',
    notApplied: '未应用',
    featureSummary: ({ initial, played, added, retriggers }) =>
      `初始 ${initial}，已玩 ${played}，增加 ${added}，再次触发 ${retriggers} 次`,
  },
  presentation: { winningPaylines: (count) => `${count} 条中奖线` },
} satisfies TranslationDictionary;
