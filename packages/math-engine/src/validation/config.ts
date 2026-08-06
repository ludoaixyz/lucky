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
  return issues;
}
