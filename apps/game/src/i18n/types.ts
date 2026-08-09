export const SUPPORTED_LOCALES = ['en-US', 'pt-BR', 'zh-CN', 'fil-PH'] as const;
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export interface MessageParameters {
  readonly loadingConfiguration: Record<string, never>;
  readonly ready: Record<string, never>;
  readonly noWin: Record<string, never>;
  readonly won: { readonly amount: number };
  readonly paidSpin: { readonly current: number; readonly total: number };
  readonly sequenceCompleted: {
    readonly completed: number;
    readonly total: number;
    readonly current: number;
    readonly amount: number;
  };
  readonly insufficientCredits: Record<string, never>;
  readonly sequenceStopped: { readonly completed: number; readonly total: number };
  readonly freeSpinProgress: {
    readonly paidCurrent: number;
    readonly paidTotal: number;
    readonly current: number;
    readonly total: number;
    readonly remaining: number;
  };
  readonly freeSpinsAwarded: { readonly count: number };
  readonly baseWin: { readonly amount: number };
  readonly retrigger: { readonly count: number; readonly subtotal: number };
  readonly featureSubtotal: { readonly amount: number };
  readonly featureComplete: { readonly amount: number };
  readonly finalWin: {
    readonly amount: number;
    readonly base: number;
    readonly feature: number;
  };
  readonly spinFailed: Record<string, never>;
  readonly unableToStart: Record<string, never>;
}

export type MessageKey = keyof MessageParameters;
export type MessageDescriptor = {
  [Key in MessageKey]: { readonly key: Key; readonly params: MessageParameters[Key] };
}[MessageKey];

export interface TranslationDictionary {
  readonly languageName: string;
  readonly static: {
    readonly pageGameRegion: string;
    readonly reelsAria: string;
    readonly mascotAlt: string;
    readonly controlPanel: string;
    readonly languageSelector: string;
    readonly credits: string;
    readonly betSize: string;
    readonly latestWin: string;
    readonly animationSpeed: string;
    readonly betAmount: string;
    readonly numberOfSpins: string;
    readonly session: string;
    readonly diagnosticsTitle: string;
    readonly downloadCsv: string;
    readonly totalSpins: string;
    readonly totalWagered: string;
    readonly totalWon: string;
    readonly sessionRtp: string;
    readonly uncappedReturn: string;
    readonly capReduction: string;
    readonly featureTriggerRate: string;
    readonly averageFeatureLength: string;
    readonly recentSpins: string;
    readonly latestTen: string;
    readonly completedSpinsEmpty: string;
  };
  readonly controls: {
    readonly spin: 'SPIN';
    readonly spinAria: (count: number) => string;
    readonly speedValue: (speed: number) => string;
    readonly betValue: (amount: number) => string;
    readonly spinsValue: (count: number) => string;
    readonly languageSelected: (language: string) => string;
  };
  readonly messages: {
    readonly [Key in MessageKey]: (params: MessageParameters[Key]) => string;
  };
  readonly diagnostics: {
    readonly spinNumber: (spin: number) => string;
    readonly bet: string;
    readonly base: string;
    readonly feature: string;
    readonly credited: string;
    readonly net: string;
    readonly credits: string;
    readonly outcome: string;
    readonly stops: string;
    readonly lineWins: string;
    readonly scattersAndCap: string;
    readonly no: string;
    readonly applied: string;
    readonly notApplied: string;
    readonly featureSummary: (values: {
      readonly initial: number;
      readonly played: number;
      readonly added: number;
      readonly retriggers: number;
    }) => string;
  };
  readonly presentation: {
    readonly winningPaylines: (count: number) => string;
  };
}

export type StaticTranslationKey = keyof TranslationDictionary['static'];
