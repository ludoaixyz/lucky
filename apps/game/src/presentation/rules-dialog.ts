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

type CopyPart = string | HTMLElement;

function paragraph(...parts: CopyPart[]): HTMLParagraphElement {
  const element = node('p');
  element.append(...parts);
  return element;
}

function strong(text: string): HTMLElement {
  return node('strong', undefined, text);
}

function payoutRange(award: CountPayAward): string {
  return award.minCount === award.maxCount
    ? String(award.minCount)
    : `${award.minCount}–${award.maxCount}`;
}

export function renderRulesContent(container: HTMLElement, config: ActiveGameConfig): void {
  const howToWin = section('How to Win');
  howToWin.append(
    paragraph(
      'Land ',
      strong(`${config.minimumWinCount} or more matching Pay Symbols`),
      ` anywhere on the ${config.columns}×${config.rows} grid to win. More matching symbols award higher payouts. `,
      strong('No paylines are used.'),
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
    ...ranges.map((range) => node('th', undefined, `${range} Symbols`)),
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
  const paytableCaption = paragraph(strong('All payouts are shown as multiples of the Total Bet.'));
  paytableCaption.className = 'rules-caption';
  paytable.append(paytableCaption, tableWrap);

  const tumble = section('Tumble');
  tumble.append(
    paragraph(
      'After a win, the ',
      strong('winning symbols are removed'),
      '. Remaining symbols fall into place and new symbols drop in from above. The grid is then checked again for another win.',
    ),
    paragraph(strong('Tumbles continue until no new win is formed.')),
  );

  const bathala = section('Bathala Skill');
  const firstEligibleSymbol = config.bathala.eligibleSymbols[0] ?? '';
  const lastEligibleSymbol = config.bathala.eligibleSymbols.at(-1) ?? '';
  const eligibleSymbolRange =
    firstEligibleSymbol === lastEligibleSymbol
      ? firstEligibleSymbol
      : `${firstEligibleSymbol}–${lastEligibleSymbol}`;
  const removal =
    config.bathala.removeMode === 'all_instances'
      ? 'all symbols of that type from the grid'
      : `${config.bathala.randomCount?.minimum ?? 0}–${config.bathala.randomCount?.maximum ?? 0} symbols of that type from the grid`;
  bathala.append(
    ...(config.bathala.enabled
      ? [
          paragraph(
            'After each winning Tumble, ',
            strong(
              `Bathala randomly selects one Low Pay Symbol (${eligibleSymbolRange}) and removes ${removal}.`,
            ),
          ),
          paragraph(
            "Bathala's removal does not award a payout by itself. Remaining symbols fall into place, new symbols drop in, and the next Tumble is evaluated.",
          ),
          ...(config.bathala.allowNoEligibleTarget
            ? [paragraph('If no Low Pay Symbols remain, Bathala does not activate.')]
            : []),
        ]
      : [paragraph('The Bathala Skill is not active.')]),
  );

  const scatter = section('Scatter');
  scatter.append(paragraph('Scatter Symbols pay anywhere on the grid.'));
  const scatterPayouts = Object.entries(config.scatter.payouts).sort(
    ([left], [right]) => Number(left) - Number(right),
  );
  for (const [index, [count, payout]] of scatterPayouts.entries()) {
    scatter.append(
      paragraph(
        strong(`${count}${index === scatterPayouts.length - 1 ? '+' : ''} Scatters:`),
        ` ${payout}× Total Bet`,
      ),
    );
  }
  scatter.append(
    paragraph(
      'Landing ',
      strong(
        `${config.scatter.baseGameTrigger.minimumScatters} or more Scatters in the Base Game awards ${config.scatter.baseGameTrigger.freeGamesAwarded} Free Spins.`,
      ),
    ),
  );
  if (config.scatter.evaluationTiming === 'final_board')
    scatter.append(
      paragraph('Scatter Symbols are evaluated ', strong('after all Tumbles have finished.')),
    );

  const freeSpins = section('Free Spins');
  freeSpins.append(
    paragraph(
      'Landing ',
      strong(
        `${config.scatter.baseGameTrigger.minimumScatters} or more Scatters in the Base Game awards ${config.scatter.baseGameTrigger.freeGamesAwarded} Free Spins.`,
      ),
    ),
    paragraph(
      'Landing ',
      strong(
        `${config.scatter.freeGameRetrigger.minimumScatters} or more Scatters during Free Spins awards ${config.scatter.freeGameRetrigger.additionalFreeGames} additional Free Spins.`,
      ),
    ),
    paragraph(
      'Multipliers collected from winning Tumbles are ',
      strong('added together and carried forward for the remainder of the Free Spins feature.'),
    ),
  );

  const multipliers = section('Multipliers');
  multipliers.append(
    paragraph(
      'When a winning Tumble contains one or more ',
      strong('Multiplier Symbols'),
      ', their values are added together and applied to the win.',
    ),
    paragraph(
      'During ',
      strong('Free Spins'),
      ', collected multipliers are added to the ',
      strong('current feature multiplier'),
      ' and remain active for subsequent winning Tumbles.',
    ),
  );
  if (config.freeGameMultiplierCollectionTrigger === 'winning_round')
    multipliers.append(
      paragraph(
        'Multiplier Symbols are collected ',
        strong('only when they appear on a winning Tumble.'),
      ),
    );
  const multiplierGrid = node('div', 'rules-multiplier-grid');
  for (const entry of config.multiplierValues)
    multiplierGrid.append(node('span', undefined, `${entry.value}×`));
  multipliers.append(multiplierGrid);

  const limits = section('Max Win');
  const highestMultiplierSymbol = Math.max(...config.multiplierValues.map(({ value }) => value));
  limits.append(
    paragraph(
      strong(`Maximum Win: ${config.limits.maximumWinMultiple.toLocaleString('en-US')}× Total Bet`),
    ),
    paragraph(strong(`Highest Multiplier Symbol: ${highestMultiplierSymbol}×`)),
  );

  container.replaceChildren(
    howToWin,
    symbols,
    paytable,
    tumble,
    bathala,
    scatter,
    freeSpins,
    multipliers,
    limits,
  );
}

export function rulesReferenceText(config: ActiveGameConfig): string {
  const container = document.createElement('div');
  renderRulesContent(container, config);
  return container.textContent ?? '';
}
