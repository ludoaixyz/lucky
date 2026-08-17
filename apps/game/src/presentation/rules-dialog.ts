import type { ActiveGameConfig, CountPayAward, SymbolCell } from '@lucky/shared-types';
import { createSymbolElement, symbolVisual } from './symbol-visuals.js';

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function section(title: string): HTMLElement {
  const element = node('section', 'rules-section');
  element.append(node('h3', undefined, title));
  return element;
}

function payoutRange(award: CountPayAward): string {
  return award.minCount === award.maxCount
    ? String(award.minCount)
    : `${award.minCount}–${award.maxCount}`;
}

export function renderRulesContent(container: HTMLElement, config: ActiveGameConfig): void {
  const howToWin = section('How to Win');
  howToWin.append(
    node(
      'p',
      undefined,
      `${config.minimumWinCount} or more identical regular symbols anywhere across the complete ${config.columns}×${config.rows} board produce a count-pay win. No paylines are used.`,
    ),
  );

  const symbols = section('Symbols');
  const symbolGrid = node('div', 'rules-symbol-grid');
  for (const id of config.symbols) {
    const visual = symbolVisual(id);
    const card = node('div', 'rules-symbol-card');
    const sample: SymbolCell =
      id === 'MULTIPLIER'
        ? {
            id: 'rules-multiplier',
            symbol: id,
            multiplierValue: config.multiplierValues[0]?.value ?? 2,
          }
        : { id: `rules-${id}`, symbol: id };
    card.append(createSymbolElement(sample));
    const copy = node('span');
    copy.append(node('strong', undefined, id), node('small', undefined, visual.tier.toUpperCase()));
    card.append(copy);
    symbolGrid.append(card);
  }
  symbols.append(symbolGrid);

  const paytable = section('Paytable');
  const tableWrap = node('div', 'rules-table-wrap');
  const table = node('table', 'rules-paytable');
  const ranges = [...new Set(config.paytable.map(payoutRange))];
  const header = node('tr');
  header.append(
    node('th', undefined, 'Symbol'),
    ...ranges.map((range) => node('th', undefined, range)),
  );
  const thead = node('thead');
  thead.append(header);
  const tbody = node('tbody');
  for (const symbolId of config.regularSymbols) {
    const row = node('tr');
    row.append(node('th', undefined, symbolId));
    for (const range of ranges) {
      const award = config.paytable.find(
        (candidate) => candidate.symbol === symbolId && payoutRange(candidate) === range,
      );
      row.append(node('td', undefined, award ? `${award.payout}×` : '—'));
    }
    tbody.append(row);
  }
  table.append(thead, tbody);
  tableWrap.append(table);
  paytable.append(node('p', 'rules-caption', 'Payouts are normalized bet multiples.'), tableWrap);

  const tumble = section('Tumble');
  tumble.append(
    node(
      'p',
      undefined,
      `After a count-pay win, winning symbols are removed, remaining symbols collapse, and new symbols refill the board. Evaluation continues until no additional win remains, subject to the configured ${config.maximumTumbleRounds}-round safety limit.`,
    ),
  );

  const bathala = section('Bathala');
  const removal =
    config.bathala.removeMode === 'all_instances'
      ? 'all instances of the selected eligible symbol'
      : `${config.bathala.randomCount?.minimum ?? 0}–${config.bathala.randomCount?.maximum ?? 0} instances`;
  bathala.append(
    node(
      'p',
      undefined,
      config.bathala.enabled
        ? `After scoring symbols are eliminated, Bathala selects from ${config.bathala.eligibleSymbols.join(', ')} and removes ${removal}. The removal awards no direct payout; the board then collapses, refills, and is evaluated again.`
        : 'Bathala is disabled in the active configuration.',
    ),
  );

  const scatter = section('Scatter');
  const scatterPays = Object.entries(config.scatter.payouts)
    .map(([count, payout]) => `${count}: ${payout}×`)
    .join(' · ');
  scatter.append(
    node(
      'p',
      undefined,
      `Scatters are evaluated on the final board. Configured scatter pays: ${scatterPays || 'none'}. ${config.scatter.baseGameTrigger.minimumScatters}+ Scatters trigger Free Games.`,
    ),
  );

  const freeGames = section('Free Games');
  freeGames.append(
    node(
      'p',
      undefined,
      `${config.scatter.baseGameTrigger.minimumScatters}+ Scatters award ${config.scatter.baseGameTrigger.freeGamesAwarded} Free Games. ${config.scatter.freeGameRetrigger.minimumScatters}+ Scatters during the feature add ${config.scatter.freeGameRetrigger.additionalFreeGames} games. Multiplier symbols collected on winning free-game rounds persist additively through the feature.`,
    ),
  );

  const multipliers = section('Multipliers');
  multipliers.append(
    node(
      'p',
      undefined,
      'On a winning base-game round, visible multiplier values are added together and applied to that round. During Free Games, newly collected multiplier values persist additively for later winning rounds.',
    ),
  );
  const multiplierGrid = node('div', 'rules-multiplier-grid');
  for (const entry of config.multiplierValues)
    multiplierGrid.append(node('span', undefined, `${entry.value}×`));
  const technical = node('details', 'rules-technical');
  technical.append(
    node('summary', undefined, 'Distribution weights'),
    node(
      'p',
      undefined,
      config.multiplierValues.map(({ value, weight }) => `${value}×:${weight}`).join(' · '),
    ),
  );
  multipliers.append(multiplierGrid, technical);

  const limits = section('Max Win / Limits');
  limits.append(
    node(
      'p',
      undefined,
      `Maximum credited paid-spin outcome, including its feature: ${config.limits.maximumWinMultiple}× bet. Maximum configured multiplier value: ${config.limits.maximumMultiplier}×.`,
    ),
  );

  container.replaceChildren(
    howToWin,
    symbols,
    paytable,
    tumble,
    bathala,
    scatter,
    freeGames,
    multipliers,
    limits,
  );
}

export function rulesReferenceText(config: ActiveGameConfig): string {
  const container = document.createElement('div');
  renderRulesContent(container, config);
  return container.textContent ?? '';
}
