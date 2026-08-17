import type { ActiveGameConfig, BathalaSymbolId } from '@lucky/shared-types';

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export function validateConfig(config: ActiveGameConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const issue = (path: string, message: string): void => {
    issues.push({ path, message });
  };
  if (config.columns !== 6 || config.rows !== 5)
    issue('layout', 'must be exactly 6 columns by 5 rows');
  if (config.minimumWinCount !== 8) issue('minimumWinCount', 'must equal 8');
  if (config.totalBet !== 1) issue('totalBet', 'must equal 1');
  if (config.model !== 'bathala-count-pay-tumble')
    issue('model', 'must select Bathala count-pay tumble');
  if (!config.configurationId.trim()) issue('configurationId', 'must not be empty');
  if (!config.metadata?.profileName?.trim()) issue('metadata.profileName', 'must not be empty');
  if (!config.metadata?.version?.trim()) issue('metadata.version', 'must not be empty');
  if (!['stable', 'balanced', 'high', 'custom'].includes(config.metadata?.volatilityProfile))
    issue('metadata.volatilityProfile', 'must be stable, balanced, high, or custom');
  const bets = config.betting?.bets ?? [];
  if (bets.length === 0 || bets.some((bet) => !Number.isFinite(bet) || bet <= 0))
    issue('betting.bets', 'Bet values must be greater than zero.');
  if (new Set(bets).size !== bets.length) issue('betting.bets', 'must not contain duplicates');
  if (!bets.includes(config.betting?.defaultBet))
    issue('betting.defaultBet', 'must be present in the bet ladder');
  if (!(config.betting?.startingCredits > 0)) issue('betting.startingCredits', 'must be positive');
  if (
    !config.betting?.autoSpinOptions?.length ||
    config.betting.autoSpinOptions.some((count) => !Number.isSafeInteger(count) || count <= 0)
  )
    issue('betting.autoSpinOptions', 'must contain positive integers');
  if (!(config.references?.targetRtp >= 0)) issue('references.targetRtp', 'must be non-negative');
  if (!(config.references?.featureEntrySpins > 0))
    issue('references.featureEntrySpins', 'must be positive');
  if (!(config.limits?.maximumWinMultiple > 0))
    issue('limits.maximumWinMultiple', 'must be positive');
  if (!(config.limits?.maximumMultiplier > 0))
    issue('limits.maximumMultiplier', 'must be positive');
  if (
    !Number.isSafeInteger(config.limits?.maximumSessionRecords) ||
    config.limits.maximumSessionRecords <= 0
  )
    issue('limits.maximumSessionRecords', 'must be a positive integer');
  if (!Number.isSafeInteger(config.maximumTumbleRounds) || config.maximumTumbleRounds <= 0)
    issue('maximumTumbleRounds', 'must be a positive safety limit');
  const expected = [
    'L1',
    'L2',
    'L3',
    'L4',
    'L5',
    'H1',
    'H2',
    'H3',
    'H4',
    'SCATTER',
    'MULTIPLIER',
  ] as const;
  if (JSON.stringify(config.symbols) !== JSON.stringify(expected))
    issue('symbols', 'must contain the nine regular and two special symbols, without WILD');
  const symbolSet = new Set<BathalaSymbolId>(config.symbols);
  for (const [name, weights] of [
    ['baseSymbolWeights', config.baseSymbolWeights],
    ['freegameSymbolWeights', config.freegameSymbolWeights],
  ] as const) {
    if (weights.length !== symbolSet.size) issue(name, 'must define every symbol exactly once');
    const seen = new Set<string>();
    for (const entry of weights) {
      if (!symbolSet.has(entry.symbol)) issue(name, `unknown symbol ${entry.symbol}`);
      if (seen.has(entry.symbol)) issue(name, `duplicate symbol ${entry.symbol}`);
      if (!Number.isFinite(entry.weight) || entry.weight < 0)
        issue(name, `${entry.symbol} weight must be non-negative`);
      seen.add(entry.symbol);
    }
    if (!weights.some((entry) => entry.weight > 0))
      issue(name, 'At least one symbol must have positive weight.');
  }
  for (const symbol of config.regularSymbols) {
    const entries = config.paytable.filter((award) => award.symbol === symbol);
    const ranges = entries.map(({ minCount, maxCount }) => [minCount, maxCount]);
    if (
      entries.length !== 3 ||
      JSON.stringify(ranges) !==
        JSON.stringify([
          [8, 9],
          [10, 11],
          [12, 30],
        ])
    )
      issue('paytable', `${symbol} must define exactly the 8-9, 10-11, and 12-30 bands`);
    for (let count = 8; count <= 30; count += 1) {
      const matches = config.paytable.filter(
        (award) => award.symbol === symbol && count >= award.minCount && count <= award.maxCount,
      );
      if (matches.length !== 1)
        issue('paytable', `${symbol} count ${count} must have exactly one award`);
    }
  }
  if (config.multiplierValues.length === 0)
    issue('multiplierValues', 'Multiplier distribution must have positive total weight.');
  if (
    config.multiplierValues.some(
      ({ value, weight }) =>
        !Number.isFinite(value) || value <= 0 || !Number.isFinite(weight) || weight < 0,
    )
  )
    issue('multiplierValues', 'values must be positive and weights non-negative');
  if (!config.multiplierValues.some(({ weight }) => weight > 0))
    issue('multiplierValues', 'Multiplier distribution must have positive total weight.');
  if (config.multiplierValues.some(({ value }) => value > config.limits.maximumMultiplier))
    issue('multiplierValues', 'values may not exceed Maximum Multiplier');
  if (config.bathala.awardsDirectPayout !== false)
    issue('bathala.awardsDirectPayout', 'must be false');
  if (config.bathala.eligibleSymbols.some((symbol) => !config.lowSymbols.includes(symbol)))
    issue('bathala.eligibleSymbols', 'may contain only L1-L5');
  if (config.scatter.evaluationTiming !== 'final_board')
    issue('scatter.evaluationTiming', 'must explicitly resolve on final board');
  for (const [count, payout] of Object.entries(config.scatter.payouts))
    if (
      !Number.isSafeInteger(Number(count)) ||
      Number(count) < 0 ||
      !Number.isFinite(payout) ||
      payout < 0
    )
      issue(`scatter.payouts.${count}`, 'count and payout must be non-negative');
  if (
    config.scatter.baseGameTrigger.minimumScatters < 0 ||
    config.scatter.baseGameTrigger.freeGamesAwarded <= 0
  )
    issue('scatter.baseGameTrigger', 'threshold must be non-negative and award positive');
  if (
    config.scatter.freeGameRetrigger.minimumScatters < 0 ||
    config.scatter.freeGameRetrigger.additionalFreeGames <= 0
  )
    issue('scatter.freeGameRetrigger', 'threshold must be non-negative and award positive');
  return issues;
}
