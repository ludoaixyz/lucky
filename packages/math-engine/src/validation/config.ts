import type { BonusAward, RuntimeGameConfig, SymbolId } from '@lucky/shared-types';

export interface ValidationIssue {
  readonly file: string;
  readonly record: string;
  readonly field: string;
  readonly value: unknown;
  readonly rule: string;
}

export function maximumReachableScatterCount(
  strips: readonly (readonly SymbolId[])[],
  visibleRows: number,
  scatterId: SymbolId,
): number {
  return strips.reduce((total, strip) => {
    let reelMaximum = 0;
    for (let stop = 0; stop < strip.length; stop += 1) {
      let count = 0;
      for (let row = 0; row < visibleRows; row += 1)
        if (strip[(stop + row) % strip.length] === scatterId) count += 1;
      reelMaximum = Math.max(reelMaximum, count);
    }
    return total + reelMaximum;
  }, 0);
}

export function validateConfig(
  config: RuntimeGameConfig,
  file = 'runtime-config',
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (record: string, field: string, value: unknown, rule: string): void => {
    issues.push({ file, record, field, value, rule });
  };
  const symbolIds = new Set(config.symbols.map((symbol) => symbol.id));
  const productionProfile = config.configurationId === 'lucky888-production-20line-v1';
  const regularSymbols = config.symbols.filter((symbol) => symbol.category === 'regular');
  const wildSymbols = config.symbols.filter((symbol) => symbol.category === 'wild');
  const scatterSymbols = config.symbols.filter((symbol) => symbol.category === 'scatter');
  if (productionProfile && regularSymbols.length !== 8)
    issue('symbols', 'regular', regularSymbols.length, 'must contain exactly 8 regular symbols');
  if (productionProfile && wildSymbols.length !== 1)
    issue('symbols', 'wild', wildSymbols.length, 'must contain exactly 1 WILD');
  if (productionProfile && scatterSymbols.length !== 1)
    issue('symbols', 'scatter', scatterSymbols.length, 'must contain exactly 1 SCATTER');
  const cascades = config.cascades;
  if (cascades !== undefined) {
    if (typeof cascades.enabled !== 'boolean')
      issue('cascades', 'enabled', cascades.enabled, 'must be a boolean');
    if (
      cascades.scatterEvaluation !== undefined &&
      cascades.scatterEvaluation !== 'initial-grid-only'
    )
      issue(
        'cascades',
        'scatterEvaluation',
        cascades.scatterEvaluation,
        "must be 'initial-grid-only'",
      );
    if (
      cascades.maximumCascadesPerSpin !== undefined &&
      (!Number.isSafeInteger(cascades.maximumCascadesPerSpin) ||
        cascades.maximumCascadesPerSpin <= 0)
    )
      issue(
        'cascades',
        'maximumCascadesPerSpin',
        cascades.maximumCascadesPerSpin,
        'must be a positive safe integer',
      );
  }
  const validateStrips = (
    name: 'reelStrips' | 'freeSpinReelStrips',
    strips: readonly (readonly SymbolId[])[],
  ): void => {
    if (strips.length !== config.reelCount)
      issue('game', name, strips.length, `must contain ${config.reelCount} reels`);
    strips.forEach((reel, index) => {
      if (reel.length === 0)
        issue(`${name} reel ${index + 1}`, 'symbols', reel, 'must not be empty');
      if (productionProfile && (reel.length < 40 || reel.length > 60))
        issue(`${name} reel ${index + 1}`, 'length', reel.length, 'must be between 40 and 60');
      reel.forEach((symbol, stop) => {
        if (!symbolIds.has(symbol))
          issue(
            `${name} reel ${index + 1}, stop ${stop}`,
            'symbolId',
            symbol,
            'must reference a defined symbol',
          );
      });
    });
  };
  validateStrips('reelStrips', config.reelStrips);
  validateStrips('freeSpinReelStrips', config.freeSpinReelStrips);
  if (
    productionProfile &&
    JSON.stringify(config.reelStrips) === JSON.stringify(config.freeSpinReelStrips)
  )
    issue('freeSpinReelStrips', 'independence', true, 'must differ from base reel strips');

  for (const [name, range] of Object.entries(config.rtpBudgets)) {
    if (name === 'provisional' || name === 'notes') continue;
    const candidate = range as { minimum?: number; maximum?: number };
    if (
      !Number.isFinite(candidate.minimum) ||
      !Number.isFinite(candidate.maximum) ||
      (candidate.minimum ?? 0) < 0 ||
      (candidate.maximum ?? 0) < (candidate.minimum ?? 0)
    )
      issue('rtpBudgets', name, range, 'must define finite non-negative minimum <= maximum');
  }

  if (config.gameId !== 'lucky888') issue('game', 'gameId', config.gameId, "must be 'lucky888'");
  if (config.gameName !== 'LUCKY888')
    issue('game', 'gameName', config.gameName, "must be 'LUCKY888'");
  if (config.selectedRtpProfile !== config.configurationId)
    issue('game', 'selectedRtpProfile', config.selectedRtpProfile, 'must equal configurationId');
  if (config.payModel !== 'fixed-paylines-left-to-right')
    issue('game', 'payModel', config.payModel, "must be 'fixed-paylines-left-to-right'");
  if (config.maximumWinScope !== 'paid-spin-including-feature')
    issue(
      'game',
      'maximumWinScope',
      config.maximumWinScope,
      "must be 'paid-spin-including-feature'",
    );
  if (!Number.isSafeInteger(config.maximumWinCredits) || config.maximumWinCredits <= 0)
    issue('game', 'maximumWinCredits', config.maximumWinCredits, 'must be a positive safe integer');

  config.paytable.forEach((award, index) => {
    if (!symbolIds.has(award.symbolId))
      issue(`award ${index + 1}`, 'symbolId', award.symbolId, 'must reference a defined symbol');
    if (!Number.isSafeInteger(award.count) || award.count <= 0 || award.count > config.reelCount)
      issue(
        `award ${index + 1}`,
        'count',
        award.count,
        `must be a positive safe integer no greater than ${config.reelCount}`,
      );
    if (!Number.isSafeInteger(award.awardCredits) || award.awardCredits < 0)
      issue(
        `award ${index + 1}`,
        'awardCredits',
        award.awardCredits,
        'must be a non-negative safe integer',
      );
  });
  const payKeys = config.paytable.map((award) => `${award.symbolId}:${award.count}`);
  if (new Set(payKeys).size !== payKeys.length)
    issue('paytable', 'rows', payKeys, 'must not contain duplicate symbol/count rows');
  if (productionProfile) {
    for (const symbol of regularSymbols) {
      for (const count of [3, 4, 5]) {
        if (!config.paytable.some((award) => award.symbolId === symbol.id && award.count === count))
          issue(`paytable ${symbol.id}`, String(count), null, 'must define a 3/4/5 award');
      }
    }
  }
  config.paylines.forEach((line) => {
    if (line.rows.length !== config.reelCount)
      issue(`payline ${line.id}`, 'rows', line.rows, `must contain ${config.reelCount} rows`);
    line.rows.forEach((row, reel) => {
      if (!Number.isSafeInteger(row) || row < 0 || row >= config.visibleRows)
        issue(`payline ${line.id}`, `row[${reel}]`, row, `must be 0..${config.visibleRows - 1}`);
    });
  });
  const linePaths = config.paylines.map((line) => line.rows.join(','));
  if (new Set(linePaths).size !== linePaths.length)
    issue('paylines', 'rows', linePaths, 'must contain unique paths');
  if (productionProfile && config.paylines.length !== 20)
    issue('paylines', 'count', config.paylines.length, 'must contain exactly 20 paylines');

  const lineRules = config.rules.lineAwardRules;
  for (const [field, value, expected] of [
    ['direction', lineRules.direction, 'left-to-right'],
    ['awardScaling', lineRules.awardScaling, 'award-credits-per-line-bet'],
    ['matchRule', lineRules.matchRule, 'consecutive-from-leftmost-reel'],
    ['winSelection', lineRules.winSelection, 'highest-award-per-payline'],
  ] as const) {
    if (value !== expected) issue('lineAwardRules', field, value, `must be '${expected}'`);
  }
  if (lineRules.activePaylines !== config.paylines.length)
    issue(
      'lineAwardRules',
      'activePaylines',
      lineRules.activePaylines,
      `must equal the ${config.paylines.length} configured paylines`,
    );
  if (lineRules.lineBetCredits !== config.lineBetCredits)
    issue(
      'lineAwardRules',
      'lineBetCredits',
      lineRules.lineBetCredits,
      `must equal game lineBetCredits ${config.lineBetCredits}`,
    );
  if (lineRules.totalBetCredits !== config.totalBetCredits)
    issue(
      'lineAwardRules',
      'totalBetCredits',
      lineRules.totalBetCredits,
      `must equal game totalBetCredits ${config.totalBetCredits}`,
    );
  if (config.totalBetCredits !== lineRules.activePaylines * config.lineBetCredits)
    issue(
      'lineAwardRules',
      'totalBetCredits',
      config.totalBetCredits,
      'must equal activePaylines multiplied by lineBetCredits',
    );
  if (lineRules.nestedAwardsAccumulate)
    issue('lineAwardRules', 'nestedAwardsAccumulate', true, 'must be false');
  if (!lineRules.multiplePaylinesAccumulate)
    issue('lineAwardRules', 'multiplePaylinesAccumulate', false, 'must be true');
  if (!lineRules.scatterBreaksLineMatch)
    issue('lineAwardRules', 'scatterBreaksLineMatch', false, 'must be true');

  const wild = config.rules.wild;
  const wildSymbol = config.symbols.find((symbol) => symbol.id === wild.symbolId);
  if (!wildSymbol || wildSymbol.category !== 'wild')
    issue('wild', 'symbolId', wild.symbolId, 'must reference a defined wild symbol');
  const duplicateWildTargets = wild.substitutesFor.filter(
    (symbol, index) => wild.substitutesFor.indexOf(symbol) !== index,
  );
  if (duplicateWildTargets.length > 0)
    issue('wild', 'substitutesFor', wild.substitutesFor, 'must contain unique symbol IDs');
  for (const target of wild.substitutesFor) {
    const symbol = config.symbols.find((candidate) => candidate.id === target);
    if (!symbol || symbol.category !== 'regular')
      issue('wild', 'substitutesFor', target, 'must reference a defined regular symbol');
  }
  if (wild.substitutesForScatter) issue('wild', 'substitutesForScatter', true, 'must be false');
  if (!wild.enabled) issue('wild', 'enabled', wild.enabled, 'must be true');
  if (!wild.substitutesForWild)
    issue('wild', 'substitutesForWild', wild.substitutesForWild, 'must be true');
  if (wild.hasOwnLinePay)
    issue('wild', 'hasOwnLinePay', wild.hasOwnLinePay, 'must be false for this paytable');
  if (wild.allWildCombinationRule !== 'no-pay')
    issue('wild', 'allWildCombinationRule', wild.allWildCombinationRule, "must be 'no-pay'");
  if (!Number.isSafeInteger(wild.multiplier) || wild.multiplier <= 0)
    issue('wild', 'multiplier', wild.multiplier, 'must be a positive safe integer');
  const scatter = config.rules.scatter;
  const scatterSymbol = config.symbols.find((symbol) => symbol.id === scatter.symbolId);
  if (!scatterSymbol || scatterSymbol.category !== 'scatter')
    issue('scatter', 'symbolId', scatter.symbolId, 'must reference a defined scatter symbol');
  if (scatter.symbolId !== config.bonus.triggerSymbolId)
    issue(
      'scatter',
      'symbolId',
      scatter.symbolId,
      `must equal bonus triggerSymbolId ${config.bonus.triggerSymbolId}`,
    );
  for (const [field, value, expected] of [
    ['evaluation', scatter.evaluation, 'anywhere'],
    ['countMode', scatter.countMode, 'visible-symbols'],
    ['maximumCountMode', scatter.maximumCountMode, 'one-visible-scatter-per-reel'],
  ] as const) {
    if (value !== expected) issue('scatter', field, value, `must be '${expected}'`);
  }
  if (!scatter.enabled) issue('scatter', 'enabled', scatter.enabled, 'must be true');
  if (!scatter.triggersFeature)
    issue('scatter', 'triggersFeature', scatter.triggersFeature, 'must be true');
  if (config.bonus.triggerEvaluation !== scatter.evaluation)
    issue(
      'bonus',
      'triggerEvaluation',
      config.bonus.triggerEvaluation,
      "must equal scatter evaluation 'anywhere'",
    );
  if (!symbolIds.has(config.bonus.triggerSymbolId))
    issue(
      'bonus',
      'triggerSymbolId',
      config.bonus.triggerSymbolId,
      'must reference a defined symbol',
    );
  for (const [field, value] of [
    ['substitutesOnLines', scatter.substitutesOnLines],
    ['wildSubstitutesForScatter', scatter.wildSubstitutesForScatter],
    ['scatterSubstitutesForRegular', scatter.scatterSubstitutesForRegular],
    ['directCreditPaysEnabled', scatter.directCreditPaysEnabled],
  ] as const) {
    if (value) issue('scatter', field, value, 'must be false for this configuration');
  }

  const baseMaximum = maximumReachableScatterCount(
    config.reelStrips,
    config.visibleRows,
    scatter.symbolId,
  );
  const freeSpinMaximum = maximumReachableScatterCount(
    config.freeSpinReelStrips,
    config.visibleRows,
    scatter.symbolId,
  );
  const validateAwards = (
    name: 'awards' | 'retriggerAwards',
    awards: readonly BonusAward[],
    maximum: number,
  ): void => {
    if (awards.length === 0) issue('bonus', name, awards, 'must contain at least one award');
    let previous = 0;
    awards.forEach((award, index) => {
      if (
        !Number.isSafeInteger(award.count) ||
        award.count < config.bonus.minimumCount ||
        award.count > maximum
      )
        issue(
          `bonus ${name}[${index}]`,
          'count',
          award.count,
          `must be reachable from ${config.bonus.minimumCount} through ${maximum}`,
        );
      if (award.count <= previous)
        issue(
          `bonus ${name}[${index}]`,
          'count',
          award.count,
          'must be strictly increasing and unique',
        );
      if (!Number.isSafeInteger(award.freeSpins) || award.freeSpins <= 0)
        issue(
          `bonus ${name}[${index}]`,
          'freeSpins',
          award.freeSpins,
          'must be a positive safe integer',
        );
      previous = award.count;
    });
    if (awards[0]?.count !== config.bonus.minimumCount)
      issue('bonus', name, awards, 'must begin at minimumCount');
  };
  validateAwards('awards', config.bonus.awards, baseMaximum);
  if (config.bonus.retriggerEnabled)
    validateAwards('retriggerAwards', config.bonus.retriggerAwards, freeSpinMaximum);
  if (config.bonus.useAlternateReelStrips && !config.bonus.alternateReelStripConfigurationId)
    issue(
      'bonus',
      'alternateReelStripConfigurationId',
      config.bonus.alternateReelStripConfigurationId,
      'is required when alternate reel strips are enabled',
    );
  if (
    !Number.isSafeInteger(config.bonus.freeSpinMultiplier) ||
    config.bonus.freeSpinMultiplier <= 0
  )
    issue(
      'bonus',
      'freeSpinMultiplier',
      config.bonus.freeSpinMultiplier,
      'must be a positive safe integer',
    );
  if (
    !Number.isSafeInteger(config.bonus.maximumFeatureSpins) ||
    config.bonus.maximumFeatureSpins <= 0
  )
    issue(
      'bonus',
      'maximumFeatureSpins',
      config.bonus.maximumFeatureSpins,
      'must be a positive safe integer',
    );
  if (!Number.isSafeInteger(config.bonus.maximumRetriggers) || config.bonus.maximumRetriggers < 0)
    issue(
      'bonus',
      'maximumRetriggers',
      config.bonus.maximumRetriggers,
      'must be a non-negative safe integer',
    );
  if (config.bonus.scatterPaysCredits !== scatter.directCreditPaysEnabled)
    issue(
      'bonus',
      'scatterPaysCredits',
      config.bonus.scatterPaysCredits,
      'must match scatter.directCreditPaysEnabled',
    );
  if (config.bonus.useAlternatePaytable)
    issue(
      'bonus',
      'useAlternatePaytable',
      true,
      'must be false because no alternate paytable is configured',
    );
  return issues;
}
