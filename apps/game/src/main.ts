import { generateBoard, resolveSpin, SeededRandom } from '@lucky/math-engine';
import type {
  ActiveGameConfig,
  BathalaSpinResult,
  Board,
  SpinRecord,
  WeightedSymbol,
} from '@lucky/shared-types';
import './style.css';
import { loadConfig } from './config/load-config.js';
import { serializeSpinHistoryCsv, spinHistoryFilename } from './workbench/csv.js';
import { HistoryStore } from './workbench/history.js';
import {
  MathConfigManager,
  parseMathConfig,
  serializeMathConfig,
} from './workbench/math-config.js';
import { createSpinRecord } from './workbench/spin-record.js';

const byId = <T extends HTMLElement>(id: string): T => {
  const node = document.querySelector<T>(`#${id}`);
  if (!node) throw new Error(`Missing required element #${id}`);
  return node;
};
const number = (value: number, digits = 2): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const percent = (value: number): string => `${number(value * 100)}%`;
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
    ...Array.from({ length: 5 }, (_, row) =>
      board.map((column) => {
        const cell = column[row];
        const tile = document.createElement('div');
        tile.className = `symbol symbol--${cell?.symbol.toLowerCase() ?? 'empty'}`;
        tile.textContent =
          cell?.symbol === 'MULTIPLIER' ? `×${cell.multiplierValue}` : (cell?.symbol ?? '');
        return tile;
      }),
    ).flat(),
  );
}

function summarizeResult(result: BathalaSpinResult): void {
  const rounds = [
    ...result.tumbleRounds,
    ...(result.feature?.spins.flatMap((spin) => spin.tumbleRounds) ?? []),
  ];
  const bathala = rounds.filter((round) => round.bathala?.occurred).length;
  const multipliers = rounds.flatMap((round) => round.multiplierSymbols.map(({ value }) => value));
  byId('tumble-state').textContent =
    `Tumbles ${result.tumbleRounds.length + (result.feature?.spins.reduce((sum, spin) => sum + spin.tumbleRounds.length, 0) ?? 0)}`;
  byId('bathala-state').textContent = `Bathala ${bathala || '—'}`;
  byId('multiplier-state').textContent =
    `Multiplier ${multipliers.length ? multipliers.map((value) => `${value}×`).join(' + ') : '—'}`;
  byId('mode-badge').textContent = result.feature
    ? `FEATURE · ${result.feature.totalSpinsPlayed} FREE GAMES`
    : 'BASE GAME';
}

function historyRow(record: SpinRecord): HTMLElement {
  const details = document.createElement('details');
  details.className = `history-row ${record.winning ? 'is-win' : 'is-loss'} ${record.featureTriggered ? 'is-feature' : ''} ${record.winMultiple >= 100 ? 'is-big-win' : ''}`;
  const badges = [
    record.maximumTumbleDepth ? 'TUMBLE' : '',
    record.bathalaActivations ? 'BATHALA' : '',
    record.multiplierAppeared ? 'MULTI' : '',
    record.featureTriggered ? 'FEATURE' : '',
  ].filter(Boolean);
  details.innerHTML = `<summary><span><b>#${record.spinNumber}</b><small>Bet ${number(record.bet)}</small></span><strong>${number(record.totalWin)}<small>${number(record.winMultiple)}×</small></strong></summary><div class="badges">${badges.map((badge) => `<span>${badge}</span>`).join('')}</div><dl class="spin-detail"><div><dt>Base Win</dt><dd>${number(record.baseWin)}</dd></div><div><dt>Feature Win</dt><dd>${number(record.featureWin)}</dd></div><div><dt>Tumble Rounds</dt><dd>${record.baseTumbleRounds} base · ${record.freeGameTumbleRounds} free</dd></div><div><dt>Bathala</dt><dd>${record.bathalaActivations} activations · ${record.bathalaSymbolsRemoved} removed</dd></div><div><dt>Multipliers</dt><dd>${record.multiplierValues.length ? record.multiplierValues.join(' + ') : '—'}</dd></div><div><dt>Scatters</dt><dd>${record.scatterCount}</dd></div>${record.featureTriggered ? `<div><dt>Free Games</dt><dd>${record.freeGamesAwarded} awarded · ${record.freeGamesPlayed} played</dd></div><div><dt>Retriggers</dt><dd>${record.retriggerCount}</dd></div><div><dt>Ending Multiplier</dt><dd>${record.endingFreeGameMultiplier ?? 0}×</dd></div>` : ''}</dl>`;
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

  const controls = {
    spin: byId<HTMLButtonElement>('spin'),
    bet: byId<HTMLSelectElement>('bet-select'),
    auto: byId<HTMLSelectElement>('auto-select'),
  };
  const refreshOptions = (): void => {
    const chosenBet = Number(controls.bet.value) || active.betting.defaultBet;
    controls.bet.replaceChildren(
      ...active.betting.bets.map(
        (bet) => new Option(number(bet), String(bet), false, bet === chosenBet),
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
    byId('profile-name').textContent = active.metadata.profileName;
    byId('configuration-id').textContent = active.configurationId;
    byId('session-id').textContent = session.id;
    byId('balance').textContent = number(credits);
    byId('bet-display').textContent = number(Number(controls.bet.value));
    byId('win-credits').textContent = number(lastWin);
    byId('win-multiple').textContent = `${number(lastWin / (Number(controls.bet.value) || 1))}×`;
    byId('stat-spins').textContent = String(stats.spinCount);
    byId('stat-wagered').textContent = number(stats.totalWagered);
    byId('stat-won').textContent = number(stats.totalWon);
    byId('stat-rtp').textContent = percent(stats.sessionRtp);
    byId('stat-win-rate').textContent = percent(stats.winningSpinFrequency);
    byId('stat-features').textContent = String(stats.featureCount);
    byId('stat-feature-rate').textContent =
      stats.featureEntrySpins === null
        ? 'Not observed'
        : `1 in ${number(stats.featureEntrySpins, 1)}`;
    byId('history-list').replaceChildren(
      ...(history.getRecentSpins().length
        ? history.getRecentSpins().map(historyRow)
        : [
            Object.assign(document.createElement('p'), {
              className: 'empty-state',
              textContent: 'Completed paid spins will appear here.',
            }),
          ]),
    );
    byId<HTMLButtonElement>('export-csv').disabled = stats.spinCount === 0;
    byId('live-sample').textContent = `${stats.spinCount} spins`;
    byId('live-target-rtp').textContent = `${percent(active.references.targetRtp)} reference`;
    byId('live-rtp').textContent = stats.spinCount ? percent(stats.sessionRtp) : '—';
    byId('live-multiplier').textContent = stats.spinCount
      ? percent(stats.multiplierAppearance)
      : '—';
    byId('live-average-multiplier').textContent = stats.spinCount
      ? `${number(stats.averageMultiplier)}×`
      : '—';
    byId('live-tumble').textContent = stats.spinCount ? number(stats.averageTumbleDepth) : '—';
    byId('live-max-win').textContent = stats.spinCount
      ? `${number(stats.maximumWinMultiple)}×`
      : '—';
    controls.spin.disabled = !running && credits < Number(controls.bet.value);
    controls.bet.disabled = running;
    controls.auto.disabled = running;
  };
  const resetSession = (resetCredits = true): void => {
    session = newSessionIdentity();
    rng = new SeededRandom(session.seed);
    history = new HistoryStore(active.limits.maximumSessionRecords);
    lastWin = 0;
    if (resetCredits) credits = active.betting.startingCredits;
    renderBoard(generateBoard(active, 'base', new SeededRandom(session.seed), { nextId: 1 }));
    byId('tumble-state').textContent = 'Tumbles —';
    byId('bathala-state').textContent = 'Bathala —';
    byId('multiplier-state').textContent = 'Multiplier —';
    byId('mode-badge').textContent = 'BASE GAME';
    byId('message').textContent = 'Fresh deterministic session ready.';
    renderSession();
  };
  const playOne = async (current: number, total: number): Promise<boolean> => {
    const bet = Number(controls.bet.value);
    if (credits < bet) {
      byId('message').textContent = 'Auto spins stopped: insufficient balance.';
      return false;
    }
    credits -= bet;
    const result = resolveSpin(active, rng, true);
    const next = history.getAllSessionSpins().length + 1;
    const record = createSpinRecord(active, result, {
      sessionId: session.id,
      sessionSeed: session.seed,
      spinNumber: next,
      timestamp: new Date().toISOString(),
      bet,
    });
    credits += record.totalWin;
    lastWin = record.totalWin;
    history.appendSpin(record);
    renderBoard(result.finalBoard);
    summarizeResult(result);
    byId('message').textContent = result.feature
      ? `Spin #${next} complete · Feature ${record.freeGamesPlayed} games · Won ${number(record.totalWin)} credits (${number(record.winMultiple)}×).`
      : `Spin #${next} complete · Won ${number(record.totalWin)} credits (${number(record.winMultiple)}×).`;
    byId('auto-progress').textContent = total > 1 ? `${current} / ${total}` : 'Complete';
    renderSession();
    await new Promise((resolve) => window.setTimeout(resolve, total > 1 ? 180 : 0));
    return true;
  };
  const run = async (): Promise<void> => {
    if (running) {
      stopRequested = true;
      controls.spin.textContent = 'STOPPING…';
      return;
    }
    running = true;
    stopRequested = false;
    controls.spin.textContent = 'STOP';
    controls.spin.classList.add('is-stop');
    renderSession();
    const total = Number(controls.auto.value);
    let completed = 0;
    try {
      while (completed < total && !stopRequested) {
        if (!(await playOne(completed + 1, total))) break;
        completed += 1;
      }
    } finally {
      running = false;
      stopRequested = false;
      controls.spin.textContent = 'SPIN';
      controls.spin.classList.remove('is-stop');
      byId('auto-progress').textContent =
        total > 1
          ? `${completed} / ${total}${completed < total ? ' stopped' : ' complete'}`
          : 'Ready';
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
    byId('dirty-state').textContent = dirty ? 'UNAPPLIED CHANGES' : 'ACTIVE CONFIG';
    byId('dirty-state').classList.toggle('dirty', dirty);
    byId<HTMLButtonElement>('apply-config').disabled = !dirty;
  };
  byId('math-form').addEventListener('input', () => {
    try {
      readDraft();
      byId('validation-errors').hidden = true;
    } catch (error) {
      byId('dirty-state').textContent = 'UNAPPLIED CHANGES';
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
        !confirm('Configuration changed. Apply configuration and reset the mathematical session?')
      )
        return;
      stopRequested = true;
      active = manager.apply();
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
    if (
      confirm(
        'Start a new session? Current in-memory history and session statistics will be cleared.',
      )
    )
      resetSession(true);
  });
  controls.spin.addEventListener('click', () => void run());
  controls.bet.addEventListener('change', renderSession);
  refreshOptions();
  populateDraft();
  resetSession(true);
}

boot().catch((error) => {
  byId('message').textContent = error instanceof Error ? error.message : String(error);
  byId<HTMLButtonElement>('spin').disabled = true;
});
