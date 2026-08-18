import type { ActiveGameConfig, CountPayAward, SymbolCell } from '@lucky/shared-types';
import { translateWorkbench, type WorkbenchTranslationKey } from '../i18n/workbench.js';
import type { LocaleCode } from '../i18n/types.js';
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

export function renderRulesContent(
  container: HTMLElement,
  config: ActiveGameConfig,
  locale: LocaleCode = 'en-US',
): void {
  const copy = (
    key: WorkbenchTranslationKey,
    values: Readonly<Record<string, string | number>> = {},
  ): string => translateWorkbench(locale, key, values);

  const howToWin = section(copy('rulesHowToWin'));
  howToWin.append(
    paragraph(
      copy('rulesHowToWinLead'),
      strong(copy('rulesHowToWinStrong', { minimum: config.minimumWinCount })),
      copy('rulesHowToWinTail', { columns: config.columns, rows: config.rows }),
      strong(copy('rulesNoPaylines')),
    ),
  );

  const symbols = section(copy('rulesSymbols'));
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
    const label = node('span');
    const tierKey =
      visual.tier === 'low' ? 'tierLow' : visual.tier === 'high' ? 'tierHigh' : 'tierSpecial';
    label.append(node('strong', undefined, id), node('small', undefined, copy(tierKey)));
    card.append(label);
    symbolGrid.append(card);
  }
  symbols.append(symbolGrid);

  const paytable = section(copy('rulesPaytable'));
  const tableWrap = node('div', 'rules-table-wrap');
  const table = node('table', 'rules-paytable');
  const ranges = [...new Set(config.paytable.map(payoutRange))];
  const header = node('tr');
  header.append(
    node('th', undefined, copy('rulesSymbol')),
    ...ranges.map((range) => node('th', undefined, copy('rulesSymbolCount', { range }))),
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
  const paytableCaption = paragraph(strong(copy('rulesPayoutCaption')));
  paytableCaption.className = 'rules-caption';
  paytable.append(paytableCaption, tableWrap);

  const tumble = section(copy('rulesTumble'));
  tumble.append(
    paragraph(copy('rulesTumbleLead'), strong(copy('rulesTumbleStrong')), copy('rulesTumbleTail')),
    paragraph(strong(copy('rulesTumbleContinue'))),
  );

  const bathala = section(copy('rulesBathala'));
  const firstEligibleSymbol = config.bathala.eligibleSymbols[0] ?? '';
  const lastEligibleSymbol = config.bathala.eligibleSymbols.at(-1) ?? '';
  const eligibleSymbolRange =
    firstEligibleSymbol === lastEligibleSymbol
      ? firstEligibleSymbol
      : `${firstEligibleSymbol}–${lastEligibleSymbol}`;
  const removal =
    config.bathala.removeMode === 'all_instances'
      ? copy('rulesRemoveAll')
      : copy('rulesRemoveRandom', {
          minimum: config.bathala.randomCount?.minimum ?? 0,
          maximum: config.bathala.randomCount?.maximum ?? 0,
        });
  bathala.append(
    ...(config.bathala.enabled
      ? [
          paragraph(strong(copy('rulesBathalaSelection', { range: eligibleSymbolRange, removal }))),
          paragraph(copy('rulesBathalaFollowup')),
          ...(config.bathala.allowNoEligibleTarget ? [paragraph(copy('rulesNoEligible'))] : []),
        ]
      : [paragraph(copy('rulesBathalaInactive'))]),
  );

  const scatter = section(copy('rulesScatter'));
  scatter.append(paragraph(copy('rulesScatterPays')));
  const scatterPayouts = Object.entries(config.scatter.payouts).sort(
    ([left], [right]) => Number(left) - Number(right),
  );
  for (const [index, [count, payout]] of scatterPayouts.entries()) {
    scatter.append(
      paragraph(
        strong(
          copy('rulesScatterCount', {
            count: `${count}${index === scatterPayouts.length - 1 ? '+' : ''}`,
          }),
        ),
        ` ${copy('rulesTotalBet', { value: payout })}`,
      ),
    );
  }
  scatter.append(
    paragraph(
      strong(
        copy('rulesScatterTrigger', {
          minimum: config.scatter.baseGameTrigger.minimumScatters,
          count: config.scatter.baseGameTrigger.freeGamesAwarded,
        }),
      ),
    ),
  );
  if (config.scatter.evaluationTiming === 'final_board')
    scatter.append(
      paragraph(copy('rulesScatterTimingLead'), strong(copy('rulesScatterTimingStrong'))),
    );

  const freeSpins = section(copy('rulesFreeSpins'));
  freeSpins.append(
    paragraph(
      strong(
        copy('rulesScatterTrigger', {
          minimum: config.scatter.baseGameTrigger.minimumScatters,
          count: config.scatter.baseGameTrigger.freeGamesAwarded,
        }),
      ),
    ),
    paragraph(
      strong(
        copy('rulesRetrigger', {
          minimum: config.scatter.freeGameRetrigger.minimumScatters,
          count: config.scatter.freeGameRetrigger.additionalFreeGames,
        }),
      ),
    ),
    paragraph(strong(copy('rulesFreeMultiplier'))),
  );

  const multipliers = section(copy('rulesMultipliers'));
  multipliers.append(
    paragraph(copy('rulesMultiplierBase')),
    paragraph(copy('rulesMultiplierFree')),
  );
  if (config.freeGameMultiplierCollectionTrigger === 'winning_round')
    multipliers.append(paragraph(strong(copy('rulesMultiplierTiming'))));
  const multiplierGrid = node('div', 'rules-multiplier-grid');
  for (const entry of config.multiplierValues)
    multiplierGrid.append(node('span', undefined, `${entry.value}×`));
  multipliers.append(multiplierGrid);

  const limits = section(copy('rulesMaxWin'));
  const highestMultiplierSymbol = Math.max(...config.multiplierValues.map(({ value }) => value));
  limits.append(
    paragraph(
      strong(
        copy('rulesMaximumWin', {
          value: config.limits.maximumWinMultiple.toLocaleString('en-US'),
        }),
      ),
    ),
    paragraph(strong(copy('rulesHighestMultiplier', { value: highestMultiplierSymbol }))),
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

export function rulesReferenceText(config: ActiveGameConfig, locale: LocaleCode = 'en-US'): string {
  const container = document.createElement('div');
  renderRulesContent(container, config, locale);
  return container.textContent ?? '';
}
