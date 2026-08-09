import { isDeepStrictEqual } from 'node:util';
import type { RuntimeGameConfig } from '@lucky/shared-types';

export const PRODUCTION_CONFIGURATION_ID = 'lucky888-production-20line-v1';
export const PRODUCTION_REEL_LENGTHS = [48, 52, 56, 52, 48] as const;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Production profile assertion failed: ${message}`);
}

export function assertProductionProfile(config: RuntimeGameConfig): void {
  invariant(
    config.configurationId === PRODUCTION_CONFIGURATION_ID,
    `configurationId must be '${PRODUCTION_CONFIGURATION_ID}', received '${config.configurationId}'`,
  );
  const regular = config.symbols.filter((symbol) => symbol.category === 'regular');
  const wild = config.symbols.filter((symbol) => symbol.category === 'wild');
  const scatter = config.symbols.filter((symbol) => symbol.category === 'scatter');
  invariant(
    config.symbols.length === 10,
    `symbols must contain 10 rows, received ${config.symbols.length}`,
  );
  invariant(
    regular.length === 8,
    `regular symbols must contain 8 rows, received ${regular.length}`,
  );
  invariant(wild.length === 1 && wild[0]?.id === 'WILD', 'symbols must contain exactly one WILD');
  invariant(
    scatter.length === 1 && scatter[0]?.id === 'SCATTER',
    'symbols must contain exactly one SCATTER',
  );

  invariant(
    config.paylines.length === 20,
    `paylines must contain 20 rows, received ${config.paylines.length}`,
  );
  config.paylines.forEach((payline, index) => {
    invariant(payline.id === `L${index + 1}`, `payline ${index + 1} must be L${index + 1}`);
    invariant(payline.rows.length === 5, `${payline.id} must contain exactly five row indices`);
  });

  invariant(
    isDeepStrictEqual(
      config.reelStrips.map((strip) => strip.length),
      PRODUCTION_REEL_LENGTHS,
    ),
    `base reel lengths must be ${PRODUCTION_REEL_LENGTHS.join('/')}`,
  );
  invariant(
    isDeepStrictEqual(
      config.freeSpinReelStrips.map((strip) => strip.length),
      PRODUCTION_REEL_LENGTHS,
    ),
    `free-spin reel lengths must be ${PRODUCTION_REEL_LENGTHS.join('/')}`,
  );
  invariant(
    !isDeepStrictEqual(config.reelStrips, config.freeSpinReelStrips),
    'base and free-spin reel strips must not be identical',
  );

  const regularIds = new Set(regular.map((symbol) => symbol.id));
  const regularPaytable = config.paytable.filter((award) => regularIds.has(award.symbolId));
  invariant(
    config.paytable.length === 24 && regularPaytable.length === 24,
    `paytable must contain exactly 24 regular-symbol rows, received ${config.paytable.length}`,
  );
  for (const symbol of regular) {
    const counts = regularPaytable
      .filter((award) => award.symbolId === symbol.id)
      .map((award) => award.count)
      .sort((left, right) => left - right);
    invariant(
      isDeepStrictEqual(counts, [3, 4, 5]),
      `${symbol.id} must contain exactly one 3-, 4-, and 5-symbol paytable row`,
    );
  }

  const lineRules = config.rules.lineAwardRules;
  invariant(lineRules.activePaylines === 20, 'activePaylines must equal 20');
  invariant(config.lineBetCredits === 0.25, 'game lineBetCredits must equal 0.25');
  invariant(lineRules.lineBetCredits === 0.25, 'rules lineBetCredits must equal 0.25');
  invariant(config.totalBetCredits === 5, 'game totalBetCredits must equal 5');
  invariant(lineRules.totalBetCredits === 5, 'rules totalBetCredits must equal 5');
  invariant(config.cascades?.enabled === true, 'cascades must be enabled');
  invariant(config.bonus.useAlternateReelStrips, 'free-spin alternate strips must be enabled');
}

export function assertRuntimeMatchesSource(
  runtime: RuntimeGameConfig,
  source: RuntimeGameConfig,
  label = 'generated runtime config',
): void {
  invariant(
    isDeepStrictEqual(runtime, source),
    `${label} differs from canonical CSV/JSON source data`,
  );
}

export function renderProductionSummary(config: RuntimeGameConfig): string {
  assertProductionProfile(config);
  return [
    `Configuration: ${config.configurationId}`,
    'Symbols: 10 (8 regular + WILD + SCATTER)',
    `Paylines: ${config.paylines.length}`,
    `Base reels: ${config.reelStrips.map((strip) => strip.length).join(' / ')}`,
    `Free-spin reels: ${config.freeSpinReelStrips.map((strip) => strip.length).join(' / ')}`,
    `Paytable rows: ${config.paytable.length}`,
    `Cascades: ${config.cascades?.enabled === true ? 'enabled' : 'disabled'}`,
    `Free-spin alternate strips: ${config.bonus.useAlternateReelStrips ? 'enabled' : 'disabled'}`,
    `Total bet: ${config.totalBetCredits}`,
    `Line bet: ${config.lineBetCredits}`,
  ].join('\n');
}
