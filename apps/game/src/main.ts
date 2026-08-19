import { resolveSpin, SeededRandom } from '@lucky/math-engine';
import type {
  ActiveGameConfig,
  BathalaSpinResult,
  Board,
  SpinRecord,
  WeightedSymbol,
} from '@lucky/shared-types';
import './style.css';
import { loadConfig } from './config/load-config.js';
import { bindDomLocalization, createBrowserLocalization } from './i18n/index.js';
import {
  applyWorkbenchTranslations,
  translateWorkbench,
  type WorkbenchTranslationKey,
} from './i18n/workbench.js';
import { serializeSpinHistoryCsv, spinHistoryFilename } from './workbench/csv.js';
import { HistoryStore } from './workbench/history.js';
import {
  MathConfigManager,
  parseMathConfig,
  serializeMathConfig,
} from './workbench/math-config.js';
import { createSpinRecord } from './workbench/spin-record.js';
import { recordMechanicValues, resultMechanicValues } from './workbench/mechanics-presentation.js';
import {
  formatCredits,
  formatDecimal,
  formatInteger,
  formatMultiplier,
  formatPercent,
} from './workbench/number-format.js';
import { createSymbolElement } from './presentation/symbol-visuals.js';
import { createDefaultBoard } from './presentation/default-board.js';
import { renderRulesContent } from './presentation/rules-dialog.js';
import {
  BoardPresentationController,
  resolvePresentCommit,
  runAutoSpinSequence,
  type SpinSpeed,
} from './presentation/board-presentation-controller.js';

const localization = createBrowserLocalization();
const copy = (
  key: WorkbenchTranslationKey,
  values: Readonly<Record<string, string | number>> = {},
): string => translateWorkbench(localization.locale, key, values);
bindDomLocalization(localization);
applyWorkbenchTranslations(localization.locale);
localization.subscribe(() => applyWorkbenchTranslations(localization.locale));

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.querySelector<T>(`#${id}`);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node;
};
const deepDownload = (text: string, filename: string, type: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
const newSessionIdentity = (): { id: string; seed: number } => {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, '')
    .replace('T', '-');
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  const seed = bytes[0] || 1;
  return { id: `${stamp}-${seed.toString(16).slice(-4).toUpperCase().padStart(4, '0')}`, seed };
};
const setWeight = (
  weights: readonly WeightedSymbol[],
  symbol: WeightedSymbol['symbol'],
  weight: number,
): readonly WeightedSymbol[] =>
  weights.map((entry) => (entry.symbol === symbol ? { ...entry, weight } : entry));
const getWeight = (weights: readonly WeightedSymbol[], symbol: WeightedSymbol['symbol']): number =>
  weights.find((entry) => entry.symbol === symbol)?.weight ?? 0;

function renderBoard(board: Board): void {
  byId('game').replaceChildren(
    ...board.map((column, columnIndex) => {
      const reel = document.createElement('div');
      reel.className = 'reel';
      const track = document.createElement('div');
      track.className = 'reel-track';
      track.replaceChildren(
        ...column.map((cell, row) => {
          const symbol = createSymbolElement(cell);
          symbol.dataset.column = String(columnIndex);
          symbol.dataset.row = String(row);
          return symbol;
        }),
      );
      reel.append(track);
      return reel;
    }),
  );
}

function summarizeResult(result: BathalaSpinResult): void {
  const mechanics = resultMechanicValues(result);
  byId('tumble-state').textContent = mechanics.tumbles;
  byId('bathala-state').textContent = mechanics.bathala;
  byId('multiplier-state').textContent = mechanics.multiplier;
  const featureStatus = byId('feature-status');
  featureStatus.hidden = !result.feature;
  featureStatus.textContent = result.feature
    ? copy('featureSummary', {
        count: result.feature.totalSpinsPlayed,
        multiplier: formatMultiplier(result.feature.endingMultiplier),
      })
    : '';
}

function historyRow(record: SpinRecord): HTMLElement {
  const details = document.createElement('details');
  details.className = `history-row ${record.winning ? 'is-win' : 'is-loss'} ${record.featureTriggered ? 'is-feature' : ''} ${record.winMultiple >= 100 ? 'is-big-win' : ''}`;
  const badges = [
    record.maximumTumbleDepth ? copy('tumbleBadge') : '',
    record.bathalaActivations ? copy('bathalaBadge') : '',
    record.multiplierAppeared ? copy('multiBadge') : '',
    record.featureTriggered ? copy('featureBadge') : '',
  ].filter(Boolean);
  const mechanics = recordMechanicValues(record);
  const compactOutcomes = record.winOutcomes.length
    ? record.winOutcomes
        .slice(0, 2)
        .map((outcome) => `${outcome.symbolId}×${outcome.symbolCount}`)
        .join(' · ') +
      (record.winOutcomes.length > 2
        ? ` · ${copy('historyMore', { count: record.winOutcomes.length - 2 })}`
        : '')
    : record.featureTriggered
      ? `SCATTER×${record.scatterCount} · ${copy('historyFeature')}`
      : record.totalWin > 0
        ? `SCATTER×${record.scatterCount}`
        : copy('noWinningOutcomes');
  const groups = new Map<string, typeof record.winOutcomes>();
  for (const outcome of record.winOutcomes) {
    const phase =
      outcome.phase === 'base'
        ? copy('baseGame')
        : copy('freeGameNumber', { index: outcome.freeGameIndex ?? 0 });
    const round =
      outcome.tumbleIndex === 0
        ? copy('initialBoard')
        : copy('tumbleNumber', { index: outcome.tumbleIndex });
    const key = `${phase} · ${round}`;
    groups.set(key, [...(groups.get(key) ?? []), outcome]);
  }
  const outcomeDetail = record.winOutcomes.length
    ? `<section class="winning-outcomes"><h4>${copy('winningOutcomes')}</h4>${[...groups.entries()]
        .map(
          ([label, outcomes]) =>
            `<div class="outcome-round"><h5>${label}</h5>${outcomes
              .map(
                (outcome) =>
                  `<p><b>${outcome.symbolId} × ${outcome.symbolCount}</b><span>${formatMultiplier(outcome.basePayoutMultiple)} × ${formatMultiplier(outcome.multiplierApplied)} → ${formatMultiplier(outcome.creditedPayoutMultiple)}</span></p>`,
              )
              .join('')}</div>`,
        )
        .join('')}</section>`
    : '';
  details.innerHTML = `<summary><span class="history-summary-main"><span class="history-identity"><span><b>#${record.spinNumber}</b><small>${copy('historyBet', { value: formatCredits(record.bet) })}</small></span><em>${compactOutcomes}</em></span><strong>${formatCredits(record.totalWin)}<small>${record.winMultiple > 0 ? formatMultiplier(record.winMultiple) : '—'}</small></strong></span><span class="history-mechanics"><span><small>${copy('tumbles')}</small><b>${mechanics.tumbles}</b></span><span><small>${copy('bathala')}</small><b>${mechanics.bathala}</b></span><span><small>${copy('multiplier')}</small><b>${mechanics.multiplier}</b></span></span></summary><div class="badges">${badges.map((badge) => `<span>${badge}</span>`).join('')}</div><dl class="spin-detail"><div><dt>${copy('baseWin')}</dt><dd>${formatCredits(record.baseWin)}</dd></div><div><dt>${copy('featureWin')}</dt><dd>${formatCredits(record.featureWin)}</dd></div><div><dt>${copy('tumbleRounds')}</dt><dd>${copy('tumbleRoundValues', { base: record.baseTumbleRounds, free: record.freeGameTumbleRounds })}</dd></div><div><dt>${copy('bathala')}</dt><dd>${copy('bathalaDetail', { activations: record.bathalaActivations, removed: record.bathalaSymbolsRemoved })}</dd></div><div><dt>${copy('multipliers')}</dt><dd>${mechanics.multiplier}</dd></div><div><dt>${copy('scatters')}</dt><dd>${record.scatterCount}</dd></div>${record.featureTriggered ? `<div><dt>${copy('freeGames')}</dt><dd>${copy('freeGameDetail', { awarded: record.freeGamesAwarded, played: record.freeGamesPlayed })}</dd></div><div><dt>${copy('retriggers')}</dt><dd>${record.retriggerCount}</dd></div><div><dt>${copy('endingMultiplier')}</dt><dd>${formatMultiplier(record.endingFreeGameMultiplier ?? 0)}</dd></div>` : ''}</dl>${outcomeDetail}`;
  return details;
}

async function boot(): Promise<void> {
  const manager = new MathConfigManager(await loadConfig());
  let active = manager.active();
  let history = new HistoryStore(active.limits.maximumSessionRecords);
  let session = newSessionIdentity();
  let rng = new SeededRandom(session.seed);
  let credits = active.betting.startingCredits;
  let running = false;
  let stopRequested = false;
  let lastWin = 0;
  const presenter = new BoardPresentationController(byId('game'), undefined, copy);
  const rulesDialog = byId<HTMLDialogElement>('rules-dialog');
  const rulesButton = byId<HTMLButtonElement>('rules-button');
  const rulesContent = byId('rules-content');

  const controls = {
    spin: byId<HTMLButtonElement>('spin'),
    bet: byId<HTMLSelectElement>('bet-select'),
    auto: byId<HTMLSelectElement>('auto-select'),
    speed: [...document.querySelectorAll<HTMLInputElement>('input[name="spin-speed"]')],
  };
  let statusKey: WorkbenchTranslationKey = 'newGameSession';
  let statusValues: Readonly<Record<string, string | number>> = {};
  const renderStatus = (): void => {
    byId('message').textContent = copy(statusKey, statusValues);
  };
  const setStatus = (
    key: WorkbenchTranslationKey,
    values: Readonly<Record<string, string | number>> = {},
  ): void => {
    statusKey = key;
    statusValues = values;
    renderStatus();
  };
  const selectedSpeed = (): SpinSpeed => {
    const selected = controls.speed.find((input) => input.checked)?.value;
    return selected === 'x1' || selected === 'x2' ? selected : 'normal';
  };
  const refreshOptions = (): void => {
    const chosenBet = Number(controls.bet.value) || active.betting.defaultBet;
    controls.bet.replaceChildren(
      ...active.betting.bets.map(
        (bet) => new Option(formatInteger(bet), String(bet), false, bet === chosenBet),
      ),
    );
    if (!active.betting.bets.includes(Number(controls.bet.value)))
      controls.bet.value = String(active.betting.defaultBet);
    controls.auto.replaceChildren(
      ...active.betting.autoSpinOptions.map((count) => new Option(String(count), String(count))),
    );
  };
  const renderSession = (): void => {
    const stats = history.stats();
	const currentBet = Number(controls.bet.value) || 1;
    byId('profile-name').textContent = active.metadata.profileName;
    byId('configuration-id').textContent = active.configurationId;
    byId('session-id').textContent = session.id;
    byId('balance').textContent = formatCredits(credits);
    byId('bet-display').textContent = formatCredits(Number(controls.bet.value));
    byId('win-credits').textContent = formatCredits(lastWin);
	byId('win-multiple').textContent =
	  lastWin > 0
		? formatMultiplier(lastWin / currentBet)
		: '—';
    byId('stat-spins').textContent = String(stats.spinCount);
    byId('stat-wagered').textContent = formatCredits(stats.totalWagered);
    byId('stat-won').textContent = formatCredits(stats.totalWon);
    byId('stat-rtp').textContent = formatPercent(stats.sessionRtp);
    byId('stat-win-rate').textContent = formatPercent(stats.winningSpinFrequency);
    byId('stat-volatility').textContent =
      stats.sessionVolatility === null
        ? '0.00%'
        : formatPercent(stats.sessionVolatility);
    byId('stat-features').textContent = String(stats.featureCount);
    byId('stat-feature-rate').textContent =
      stats.featureEntrySpins === null
        ? '0.00%'
        : copy('oneIn', { value: formatDecimal(stats.featureEntrySpins, 1) });
    byId('history-list').replaceChildren(
      ...(history.getRecentSpins().length
        ? history.getRecentSpins().map(historyRow)
        : [
            Object.assign(document.createElement('p'), {
              className: 'empty-state',
              textContent: copy('emptyHistory'),
            }),
          ]),
    );
    byId<HTMLButtonElement>('export-csv').disabled = stats.spinCount === 0;
    byId('live-sample').textContent = copy('liveSample', { count: stats.spinCount });
    byId('live-target-rtp').textContent = copy('targetReference', {
      value: formatPercent(active.references.targetRtp),
    });
    byId('live-rtp').textContent = stats.spinCount ? formatPercent(stats.sessionRtp) : '—';
    byId('live-multiplier').textContent = stats.spinCount
      ? formatPercent(stats.multiplierAppearance)
      : '—';
    byId('live-average-multiplier').textContent = stats.spinCount
      ? formatMultiplier(stats.averageMultiplier)
      : '—';
    byId('live-tumble').textContent = stats.spinCount
      ? formatDecimal(stats.averageTumbleDepth)
      : '—';
    byId('live-max-win').textContent = stats.spinCount
      ? formatMultiplier(stats.maximumWinMultiple)
      : '—';
    controls.spin.disabled = !running && credits < Number(controls.bet.value);
    controls.bet.disabled = running;
    controls.auto.disabled = running;
    byId<HTMLButtonElement>('apply-config').disabled = running || !manager.isDirty();
    byId<HTMLButtonElement>('new-session').disabled = running;
    byId<HTMLButtonElement>('discard-config').disabled = running;
    byId<HTMLButtonElement>('import-config').disabled = running;
    byId<HTMLButtonElement>('config-file').disabled = running;
    controls.spin.textContent = running
      ? stopRequested
        ? copy('stopping')
        : copy('stop')
      : copy('spin');
  };
  const resetSession = (resetCredits = true): void => {
    presenter.clearPersistentWinPresentation();
    session = newSessionIdentity();
    rng = new SeededRandom(session.seed);
    history = new HistoryStore(active.limits.maximumSessionRecords);
    lastWin = 0;
    if (resetCredits) credits = active.betting.startingCredits;
    renderBoard(createDefaultBoard());
    byId('tumble-state').textContent = '—';
    byId('bathala-state').textContent = '—';
    byId('multiplier-state').textContent = '—';
    byId('feature-status').hidden = true;
    setStatus('newGameSession');
    renderSession();
  };
  const playOne = async (currentAutoSpin: number, totalAutoSpins: number): Promise<boolean> => {
    const bet = Number(controls.bet.value);
    if (credits < bet) {
      setStatus('insufficientBalance');
      return false;
    }
    const speed = selectedSpeed();
    presenter.clearPersistentWinPresentation();
    credits -= bet;
    renderSession();
    const next = history.getAllSessionSpins().length + 1;
    setStatus(totalAutoSpins > 1 ? 'spinProgress' : 'singleSpinProgress', {
      spin: next,
      current: currentAutoSpin,
      total: totalAutoSpins,
    });
    let committedRecord: SpinRecord | undefined;
    await resolvePresentCommit({
      resolve: () => resolveSpin(active, rng, true),
      present: async (result) => {
        await presenter.present(
          result.initialBoard ?? result.finalBoard,
          speed,
          result.tumbleRounds,
          {
            finalBoard: result.finalBoard,
            count: result.scatterCount,
            payout: result.scatterPayout,
            freeGames: result.freeGamesAwarded,
          },
        );
        for (const freeSpin of result.feature?.spins ?? []) {
          presenter.complete();
          const featureStatus = byId('feature-status');
          featureStatus.hidden = false;
          featureStatus.textContent = copy('featureProgress', {
            current: freeSpin.index,
            total: result.feature?.totalSpinsPlayed ?? freeSpin.index,
            multiplier: formatMultiplier(Math.max(1, freeSpin.accumulatedMultiplierAfter)),
          });
          await presenter.present(
            freeSpin.initialBoard ?? freeSpin.finalBoard,
            speed,
            freeSpin.tumbleRounds,
            {
              finalBoard: freeSpin.finalBoard,
              count: freeSpin.scattersLanded,
              payout: freeSpin.scatterPayout,
              retriggeredSpins: freeSpin.retriggeredSpins,
            },
          );
        }
      },
      commit: (result) => {
        const record = createSpinRecord(active, result, {
          sessionId: session.id,
          sessionSeed: session.seed,
          spinNumber: next,
          timestamp: new Date().toISOString(),
          bet,
        });
        committedRecord = record;
        credits += record.totalWin;
        lastWin = record.totalWin;
        history.appendSpin(record);
        summarizeResult(result);
      },
    });
    presenter.complete();
    const record = committedRecord;
    if (!record) throw new Error('Completed spin was not committed');
    presenter.retainCompletedWinPresentation(record.totalWin);
    setStatus(
      record.featureTriggered
        ? record.totalWin > 0
          ? 'spinFeatureWin'
          : 'spinFeatureNoWin'
        : record.totalWin > 0
          ? 'spinWin'
          : 'spinNoWin',
      {
        spin: next,
        games: record.freeGamesPlayed,
        win: formatCredits(record.totalWin),
        multiple: formatMultiplier(record.winMultiple),
      },
    );
    renderSession();
    return true;
  };
  const run = async (): Promise<void> => {
    if (running) {
      stopRequested = true;
      presenter.stop();
      controls.spin.textContent = copy('stopping');
      return;
    }
    running = true;
    stopRequested = false;
    controls.spin.textContent = copy('stop');
    controls.spin.classList.add('is-stop');
    renderSession();
    const total = Number(controls.auto.value);
    try {
      await runAutoSpinSequence(total, playOne, () => stopRequested);
    } finally {
      if (presenter.state() !== 'idle') presenter.complete();
      running = false;
      stopRequested = false;
      controls.spin.textContent = copy('spin');
      controls.spin.classList.remove('is-stop');
      renderSession();
    }
  };

  const inputs = {
    id: byId<HTMLInputElement>('cfg-id'),
    profile: byId<HTMLInputElement>('profile-input'),
    version: byId<HTMLInputElement>('version-input'),
    volatility: byId<HTMLSelectElement>('volatility-input'),
    targetRtp: byId<HTMLInputElement>('target-rtp'),
    featureEntry: byId<HTMLInputElement>('feature-entry'),
    betLadder: byId<HTMLInputElement>('bet-ladder'),
    defaultBet: byId<HTMLInputElement>('default-bet'),
    startingCredits: byId<HTMLInputElement>('starting-credits'),
    maxWin: byId<HTMLInputElement>('max-win'),
    maxMultiplier: byId<HTMLInputElement>('max-multiplier'),
    maxTumbles: byId<HTMLInputElement>('max-tumbles'),
    baseScatter: byId<HTMLInputElement>('base-scatter-weight'),
    freeScatter: byId<HTMLInputElement>('free-scatter-weight'),
    baseMultiplier: byId<HTMLInputElement>('base-multiplier-weight'),
    freeMultiplier: byId<HTMLInputElement>('free-multiplier-weight'),
    initialFreeGames: byId<HTMLInputElement>('initial-free-games'),
    retriggerAward: byId<HTMLInputElement>('retrigger-award'),
    baseWeights: byId<HTMLTextAreaElement>('base-weights'),
    freeWeights: byId<HTMLTextAreaElement>('free-weights'),
    multipliers: byId<HTMLTextAreaElement>('multiplier-values'),
    paytable: byId<HTMLTextAreaElement>('paytable'),
  };
  const populateDraft = (): void => {
    const d = manager.draft();
    inputs.id.value = d.configurationId;
    inputs.profile.value = d.metadata.profileName;
    inputs.version.value = d.metadata.version;
    inputs.volatility.value = d.metadata.volatilityProfile;
    inputs.targetRtp.value = String(d.references.targetRtp * 100);
    inputs.featureEntry.value = String(d.references.featureEntrySpins);
    inputs.betLadder.value = d.betting.bets.join(', ');
    inputs.defaultBet.value = String(d.betting.defaultBet);
    inputs.startingCredits.value = String(d.betting.startingCredits);
    inputs.maxWin.value = String(d.limits.maximumWinMultiple);
    inputs.maxMultiplier.value = String(d.limits.maximumMultiplier);
    inputs.maxTumbles.value = String(d.maximumTumbleRounds);
    inputs.baseScatter.value = String(getWeight(d.baseSymbolWeights, 'SCATTER'));
    inputs.freeScatter.value = String(getWeight(d.freegameSymbolWeights, 'SCATTER'));
    inputs.baseMultiplier.value = String(getWeight(d.baseSymbolWeights, 'MULTIPLIER'));
    inputs.freeMultiplier.value = String(getWeight(d.freegameSymbolWeights, 'MULTIPLIER'));
    inputs.initialFreeGames.value = String(d.scatter.baseGameTrigger.freeGamesAwarded);
    inputs.retriggerAward.value = String(d.scatter.freeGameRetrigger.additionalFreeGames);
    inputs.baseWeights.value = JSON.stringify(d.baseSymbolWeights, null, 2);
    inputs.freeWeights.value = JSON.stringify(d.freegameSymbolWeights, null, 2);
    inputs.multipliers.value = JSON.stringify(d.multiplierValues, null, 2);
    inputs.paytable.value = JSON.stringify(d.paytable, null, 2);
    refreshDirty();
  };
  const readDraft = (): void => {
    const d = manager.draft();
    const baseSymbolWeights = JSON.parse(
      inputs.baseWeights.value,
    ) as ActiveGameConfig['baseSymbolWeights'];
    const freegameSymbolWeights = JSON.parse(
      inputs.freeWeights.value,
    ) as ActiveGameConfig['freegameSymbolWeights'];
    manager.replaceDraft({
      ...d,
      configurationId: inputs.id.value.trim(),
      metadata: {
        profileName: inputs.profile.value.trim(),
        version: inputs.version.value.trim(),
        volatilityProfile: inputs.volatility
          .value as ActiveGameConfig['metadata']['volatilityProfile'],
      },
      references: {
        targetRtp: Number(inputs.targetRtp.value) / 100,
        featureEntrySpins: Number(inputs.featureEntry.value),
      },
      betting: {
        ...d.betting,
        bets: inputs.betLadder.value.split(',').map(Number),
        defaultBet: Number(inputs.defaultBet.value),
        startingCredits: Number(inputs.startingCredits.value),
      },
      limits: {
        ...d.limits,
        maximumWinMultiple: Number(inputs.maxWin.value),
        maximumMultiplier: Number(inputs.maxMultiplier.value),
      },
      maximumTumbleRounds: Number(inputs.maxTumbles.value),
      baseSymbolWeights: setWeight(
        setWeight(baseSymbolWeights, 'SCATTER', Number(inputs.baseScatter.value)),
        'MULTIPLIER',
        Number(inputs.baseMultiplier.value),
      ),
      freegameSymbolWeights: setWeight(
        setWeight(freegameSymbolWeights, 'SCATTER', Number(inputs.freeScatter.value)),
        'MULTIPLIER',
        Number(inputs.freeMultiplier.value),
      ),
      multiplierValues: JSON.parse(
        inputs.multipliers.value,
      ) as ActiveGameConfig['multiplierValues'],
      paytable: JSON.parse(inputs.paytable.value) as ActiveGameConfig['paytable'],
      scatter: {
        ...d.scatter,
        baseGameTrigger: {
          ...d.scatter.baseGameTrigger,
          freeGamesAwarded: Number(inputs.initialFreeGames.value),
        },
        freeGameRetrigger: {
          ...d.scatter.freeGameRetrigger,
          additionalFreeGames: Number(inputs.retriggerAward.value),
        },
      },
    });
    refreshDirty();
  };
  const refreshDirty = (): void => {
    const dirty = manager.isDirty();
    byId('dirty-state').textContent = copy(dirty ? 'unappliedChanges' : 'activeConfig');
    byId('dirty-state').classList.toggle('dirty', dirty);
    byId<HTMLButtonElement>('apply-config').disabled = running || !dirty;
  };
  byId('math-form').addEventListener('input', () => {
    try {
      readDraft();
      byId('validation-errors').hidden = true;
    } catch (error) {
      byId('dirty-state').textContent = copy('unappliedChanges');
      byId('dirty-state').classList.add('dirty');
      byId<HTMLButtonElement>('apply-config').disabled = false;
      const box = byId('validation-errors');
      box.hidden = false;
      box.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  byId('discard-config').addEventListener('click', () => {
    manager.discard();
    populateDraft();
    byId('validation-errors').hidden = true;
  });
  byId('apply-config').addEventListener('click', () => {
    try {
      readDraft();
      const issues = manager.validateDraft();
      if (issues.length)
        throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
      if (
        !confirm(copy('confirmApply'))
      )
        return;
      stopRequested = true;
      active = manager.apply();
      renderRulesContent(rulesContent, active, localization.locale);
      refreshOptions();
      populateDraft();
      resetSession(true);
    } catch (error) {
      const box = byId('validation-errors');
      box.hidden = false;
      box.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  byId('export-config').addEventListener('click', () =>
    deepDownload(
      serializeMathConfig(manager.draft()),
      `${manager.draft().configurationId}.json`,
      'application/json;charset=utf-8',
    ),
  );
  byId('format-json').addEventListener('click', () => {
    const editors = [inputs.baseWeights, inputs.freeWeights, inputs.multipliers, inputs.paytable];
    try {
      const formatted = editors.map((editor) => JSON.stringify(JSON.parse(editor.value), null, 2));
      editors.forEach((editor, index) => {
        editor.value = formatted[index] ?? editor.value;
      });
      readDraft();
      byId('validation-errors').hidden = true;
    } catch (error) {
      const box = byId('validation-errors');
      box.hidden = false;
      box.textContent = copy('jsonFormattingStopped', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
  byId('import-config').addEventListener('click', () =>
    byId<HTMLInputElement>('config-file').click(),
  );
  byId<HTMLInputElement>('config-file').addEventListener('change', (event) => {
    void (async () => {
      const file = (event.currentTarget as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        manager.replaceDraft(parseMathConfig(await file.text()));
        populateDraft();
      } catch (error) {
        const box = byId('validation-errors');
        box.hidden = false;
        box.textContent = error instanceof Error ? error.message : String(error);
      }
    })();
  });
  byId('export-csv').addEventListener('click', () =>
    deepDownload(
      serializeSpinHistoryCsv(history.getAllSessionSpins()),
      spinHistoryFilename(active.configurationId, session.id),
      'text/csv;charset=utf-8',
    ),
  );
  byId('new-session').addEventListener('click', () => {
    if (confirm(copy('confirmNewSession'))) resetSession(true);
  });
  rulesButton.addEventListener('click', () => {
    renderRulesContent(rulesContent, active, localization.locale);
    rulesDialog.showModal();
  });
  byId('rules-close').addEventListener('click', () => rulesDialog.close());
  rulesDialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !rulesDialog.open) return;
    event.preventDefault();
    rulesDialog.close();
  });
  rulesDialog.addEventListener('click', (event) => {
    if (event.target === rulesDialog) rulesDialog.close();
  });
  rulesDialog.addEventListener('close', () => rulesButton.focus());
  controls.spin.addEventListener('click', () => void run());
  controls.bet.addEventListener('change', renderSession);
  localization.subscribe(() => {
    presenter.refreshLocalizedPresentation();
    renderRulesContent(rulesContent, active, localization.locale);
    refreshDirty();
    renderSession();
    renderStatus();
  });
  refreshOptions();
  renderRulesContent(rulesContent, active, localization.locale);
  populateDraft();
  resetSession(true);
}

boot().catch((error) => {
  byId('message').textContent = copy('configurationLoadFailed', {
    error: error instanceof Error ? error.message : String(error),
  });
  byId<HTMLButtonElement>('spin').disabled = true;
});
