import { validateConfig } from '@lucky/math-engine';
import type { RuntimeGameConfig } from '@lucky/shared-types';

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, path: string): void {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${path} must be a non-empty string`);
}

function integerField(value: unknown, path: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${path} must be a safe integer`);
}

function booleanField(value: unknown, path: string): void {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
}

function arrayField(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  return value;
}

function parseRuntimeConfig(payload: unknown): RuntimeGameConfig {
  const artifact = record(payload, 'Runtime math artifact');
  const config = record(artifact.config, 'Runtime math artifact.config');
  for (const field of [
    'schemaVersion',
    'gameId',
    'gameName',
    'gameVersion',
    'configurationId',
    'selectedRtpProfile',
    'payModel',
    'maximumWinScope',
  ] as const) {
    stringField(config[field], `config.${field}`);
  }
  for (const field of [
    'reelCount',
    'visibleRows',
    'lineBetCredits',
    'totalBetCredits',
    'maximumWinCredits',
  ] as const) {
    integerField(config[field], `config.${field}`);
  }
  if ((config.reelCount as number) <= 0) throw new Error('config.reelCount must be positive');
  if ((config.visibleRows as number) <= 0) throw new Error('config.visibleRows must be positive');
  if ((config.lineBetCredits as number) <= 0)
    throw new Error('config.lineBetCredits must be positive');
  if ((config.totalBetCredits as number) <= 0)
    throw new Error('config.totalBetCredits must be positive');
  if ((config.maximumWinCredits as number) < 0)
    throw new Error('config.maximumWinCredits must be non-negative');
  if (config.cascades !== undefined) {
    const cascades = record(config.cascades, 'config.cascades');
    booleanField(cascades.enabled, 'config.cascades.enabled');
    if (cascades.scatterEvaluation !== undefined)
      stringField(cascades.scatterEvaluation, 'config.cascades.scatterEvaluation');
    if (cascades.maximumCascadesPerSpin !== undefined)
      integerField(cascades.maximumCascadesPerSpin, 'config.cascades.maximumCascadesPerSpin');
  }

  arrayField(config.symbols, 'config.symbols').forEach((value, index) => {
    const symbol = record(value, `config.symbols[${index}]`);
    for (const field of ['id', 'name', 'category', 'display'] as const) {
      stringField(symbol[field], `config.symbols[${index}].${field}`);
    }
    if (!['regular', 'wild', 'scatter', 'bonus'].includes(symbol.category as string)) {
      throw new Error(`config.symbols[${index}].category must be regular, wild, scatter, or bonus`);
    }
  });
  arrayField(config.reelStrips, 'config.reelStrips').forEach((value, reel) => {
    arrayField(value, `config.reelStrips[${reel}]`).forEach((symbol, stop) =>
      stringField(symbol, `config.reelStrips[${reel}][${stop}]`),
    );
  });
  arrayField(config.freeSpinReelStrips, 'config.freeSpinReelStrips').forEach((value, reel) => {
    arrayField(value, `config.freeSpinReelStrips[${reel}]`).forEach((symbol, stop) =>
      stringField(symbol, `config.freeSpinReelStrips[${reel}][${stop}]`),
    );
  });
  arrayField(config.paylines, 'config.paylines').forEach((value, index) => {
    const payline = record(value, `config.paylines[${index}]`);
    stringField(payline.id, `config.paylines[${index}].id`);
    arrayField(payline.rows, `config.paylines[${index}].rows`).forEach((row, reel) =>
      integerField(row, `config.paylines[${index}].rows[${reel}]`),
    );
  });
  arrayField(config.paytable, 'config.paytable').forEach((value, index) => {
    const award = record(value, `config.paytable[${index}]`);
    stringField(award.symbolId, `config.paytable[${index}].symbolId`);
    integerField(award.count, `config.paytable[${index}].count`);
    integerField(award.awardCredits, `config.paytable[${index}].awardCredits`);
  });
  const bonus = record(config.bonus, 'config.bonus');
  stringField(bonus.schemaVersion, 'config.bonus.schemaVersion');
  stringField(bonus.triggerSymbolId, 'config.bonus.triggerSymbolId');
  stringField(bonus.triggerEvaluation, 'config.bonus.triggerEvaluation');
  for (const field of [
    'minimumCount',
    'freeSpinMultiplier',
    'maximumFeatureSpins',
    'maximumRetriggers',
  ] as const) {
    integerField(bonus[field], `config.bonus.${field}`);
  }
  for (const field of [
    'enabled',
    'retriggerEnabled',
    'scatterPaysCredits',
    'useAlternateReelStrips',
    'useAlternatePaytable',
  ] as const) {
    booleanField(bonus[field], `config.bonus.${field}`);
  }
  for (const field of ['awards', 'retriggerAwards'] as const) {
    arrayField(bonus[field], `config.bonus.${field}`).forEach((value, index) => {
      const award = record(value, `config.bonus.${field}[${index}]`);
      integerField(award.count, `config.bonus.${field}[${index}].count`);
      integerField(award.freeSpins, `config.bonus.${field}[${index}].freeSpins`);
    });
  }
  if (bonus.useAlternateReelStrips)
    stringField(
      bonus.alternateReelStripConfigurationId,
      'config.bonus.alternateReelStripConfigurationId',
    );
  const rules = record(config.rules, 'config.rules');
  stringField(rules.schemaVersion, 'config.rules.schemaVersion');
  const wild = record(rules.wild, 'config.rules.wild');
  stringField(wild.symbolId, 'config.rules.wild.symbolId');
  for (const field of [
    'enabled',
    'substitutesForWild',
    'substitutesForScatter',
    'hasOwnLinePay',
  ] as const)
    booleanField(wild[field], `config.rules.wild.${field}`);
  stringField(wild.allWildCombinationRule, 'config.rules.wild.allWildCombinationRule');
  arrayField(wild.substitutesFor, 'config.rules.wild.substitutesFor').forEach((value, index) =>
    stringField(value, `config.rules.wild.substitutesFor[${index}]`),
  );
  integerField(wild.multiplier, 'config.rules.wild.multiplier');
  const lineRules = record(rules.lineAwardRules, 'config.rules.lineAwardRules');
  for (const field of ['direction', 'awardScaling', 'matchRule', 'winSelection'] as const)
    stringField(lineRules[field], `config.rules.lineAwardRules.${field}`);
  for (const field of [
    'multiplePaylinesAccumulate',
    'nestedAwardsAccumulate',
    'scatterBreaksLineMatch',
  ] as const)
    booleanField(lineRules[field], `config.rules.lineAwardRules.${field}`);
  for (const field of ['activePaylines', 'lineBetCredits', 'totalBetCredits'] as const)
    integerField(lineRules[field], `config.rules.lineAwardRules.${field}`);
  const scatter = record(rules.scatter, 'config.rules.scatter');
  stringField(scatter.symbolId, 'config.rules.scatter.symbolId');
  for (const field of ['evaluation', 'countMode', 'maximumCountMode'] as const)
    stringField(scatter[field], `config.rules.scatter.${field}`);
  for (const field of [
    'enabled',
    'substitutesOnLines',
    'wildSubstitutesForScatter',
    'scatterSubstitutesForRegular',
    'directCreditPaysEnabled',
    'triggersFeature',
  ] as const)
    booleanField(scatter[field], `config.rules.scatter.${field}`);
  return config as unknown as RuntimeGameConfig;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

export async function loadConfig(): Promise<RuntimeGameConfig> {
  const url = `${import.meta.env.BASE_URL}data/runtime-config.json`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error: unknown) {
    throw new Error(`Could not load math configuration '${url}': ${message(error)}`, {
      cause: error,
    });
  }
  if (!response.ok) {
    throw new Error(
      `Could not load math configuration '${url}': HTTP ${response.status} ${response.statusText}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error: unknown) {
    throw new Error(`Math configuration '${url}' is not valid JSON: ${message(error)}`, {
      cause: error,
    });
  }
  const config = parseRuntimeConfig(payload);
  const issues = validateConfig(config, url);
  if (issues.length > 0) {
    const issue = issues[0];
    if (!issue) throw new Error(`Math configuration '${url}' failed validation`);
    throw new Error(
      `Invalid math configuration '${url}' at ${issue.record}.${issue.field}: received ${JSON.stringify(issue.value)}; ${issue.rule}`,
    );
  }
  return config;
}
