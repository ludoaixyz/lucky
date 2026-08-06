import type { RuntimeGameConfig } from '@lucky/shared-types';

export interface ValidationIssue {
  readonly file: string;
  readonly record: string;
  readonly field: string;
  readonly value: unknown;
  readonly rule: string;
}

export function validateConfig(
  config: RuntimeGameConfig,
  file = 'runtime-config',
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const symbolIds = new Set(config.symbols.map((symbol) => symbol.id));
  const totalVisibleCells = config.reelCount * config.visibleRows;
  const issue = (record: string, field: string, value: unknown, rule: string): void => {
    issues.push({ file, record, field, value, rule });
  };
  if (config.reelStrips.length !== config.reelCount)
    issue('game', 'reelStrips', config.reelStrips.length, `must contain ${config.reelCount} reels`);
  config.reelStrips.forEach((reel, index) => {
    if (reel.length === 0) issue(`reel ${index + 1}`, 'symbols', reel, 'must not be empty');
    reel.forEach((symbol, stop) => {
      if (!symbolIds.has(symbol))
        issue(
          `reel ${index + 1}, stop ${stop}`,
          'symbolId',
          symbol,
          'must reference a defined symbol',
        );
    });
  });
  config.paytable.forEach((award, index) => {
    if (!symbolIds.has(award.symbolId))
      issue(`award ${index + 1}`, 'symbolId', award.symbolId, 'must reference a defined symbol');
    if (!Number.isSafeInteger(award.awardCredits) || award.awardCredits < 0)
      issue(
        `award ${index + 1}`,
        'awardCredits',
        award.awardCredits,
        'must be a non-negative safe integer',
      );
  });
  config.paylines.forEach((line) =>
    line.rows.forEach((row, reel) => {
      if (!Number.isSafeInteger(row) || row < 0 || row >= config.visibleRows)
        issue(`payline ${line.id}`, `row[${reel}]`, row, `must be 0..${config.visibleRows - 1}`);
    }),
  );
  if (!symbolIds.has(config.bonus.triggerSymbolId))
    issue(
      'bonus',
      'triggerSymbolId',
      config.bonus.triggerSymbolId,
      'must reference a defined symbol',
    );
  const triggerSymbol = config.symbols.find((symbol) => symbol.id === config.bonus.triggerSymbolId);
  if (triggerSymbol && triggerSymbol.category !== 'scatter')
    issue(
      'bonus',
      'triggerSymbolId',
      config.bonus.triggerSymbolId,
      'must reference a scatter symbol',
    );
  if (config.bonus.triggerEvaluation !== 'anywhere')
    issue('bonus', 'triggerEvaluation', config.bonus.triggerEvaluation, "must be 'anywhere'");
  for (const field of [
    'enabled',
    'retriggerEnabled',
    'scatterPaysCredits',
    'useAlternateReelStrips',
    'useAlternatePaytable',
  ] as const) {
    if (typeof config.bonus[field] !== 'boolean')
      issue('bonus', field, config.bonus[field], 'must be a boolean');
  }
  if (
    !Number.isSafeInteger(config.bonus.minimumCount) ||
    config.bonus.minimumCount <= 0 ||
    config.bonus.minimumCount > totalVisibleCells
  )
    issue(
      'bonus',
      'minimumCount',
      config.bonus.minimumCount,
      `must be a positive safe integer no greater than ${totalVisibleCells}`,
    );
  const validateAwards = (
    name: 'awards' | 'retriggerAwards',
    awards: RuntimeGameConfig['bonus']['awards'],
  ): void => {
    if (awards.length === 0) issue('bonus', name, awards, 'must contain at least one award');
    let previousCount = 0;
    awards.forEach((award, index) => {
      if (
        !Number.isSafeInteger(award.count) ||
        award.count < config.bonus.minimumCount ||
        award.count > totalVisibleCells
      )
        issue(
          `bonus ${name}[${index}]`,
          'count',
          award.count,
          `must be a safe integer from ${config.bonus.minimumCount} to ${totalVisibleCells}`,
        );
      if (award.count <= previousCount)
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
      if (award.freeSpins > config.bonus.maximumFeatureSpins)
        issue(
          `bonus ${name}[${index}]`,
          'freeSpins',
          award.freeSpins,
          'must not exceed maximumFeatureSpins',
        );
      previousCount = award.count;
    });
  };
  validateAwards('awards', config.bonus.awards);
  if (config.bonus.awards[0]?.count !== config.bonus.minimumCount)
    issue('bonus', 'awards', config.bonus.awards, 'must include an award for minimumCount');
  if (config.bonus.retriggerEnabled) {
    validateAwards('retriggerAwards', config.bonus.retriggerAwards);
    if (config.bonus.retriggerAwards[0]?.count !== config.bonus.minimumCount)
      issue(
        'bonus',
        'retriggerAwards',
        config.bonus.retriggerAwards,
        'must include an award for minimumCount when retriggers are enabled',
      );
  } else if (config.bonus.retriggerAwards.length !== 0) {
    issue(
      'bonus',
      'retriggerAwards',
      config.bonus.retriggerAwards,
      'must be empty when retriggerEnabled is false',
    );
  }
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
  if (config.bonus.scatterPaysCredits)
    issue(
      'bonus',
      'scatterPaysCredits',
      config.bonus.scatterPaysCredits,
      'must be false until a direct scatter-pay table is configured',
    );
  if (config.bonus.useAlternateReelStrips)
    issue(
      'bonus',
      'useAlternateReelStrips',
      config.bonus.useAlternateReelStrips,
      'must be false because no alternate free-spin reel strips are configured',
    );
  if (config.bonus.useAlternatePaytable)
    issue(
      'bonus',
      'useAlternatePaytable',
      config.bonus.useAlternatePaytable,
      'must be false because no alternate free-spin paytable is configured',
    );
  return issues;
}
