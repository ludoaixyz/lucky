import { resolveSpin } from '@lucky/math-engine';
import type { RandomSource } from '@lucky/math-engine';
import type { RuntimeGameConfig } from '@lucky/shared-types';
import type { SpinDiagnosticsRecorder } from '../diagnostics/types.js';
import type { SlotScene } from '../game/scenes/SlotScene.js';
import {
  PRESENTATION_SPEED_OPTIONS,
  presentationTiming,
  type PresentationSpeed,
} from '../game/presentation-timing.js';
import {
  formatDecimal,
  formatNumber,
  type Localization,
  type MessageDescriptor,
} from '../i18n/index.js';

export const BET_OPTIONS = [5, 10, 20, 50, 100] as const;
export const SPIN_COUNT_OPTIONS = [1, 2, 5, 10, 15, 20, 25, 50, 75, 100] as const;

function element<T extends HTMLElement>(id: string): T {
  const found = document.querySelector<T>(`#${id}`);
  if (!found) throw new Error(`Required game control '#${id}' is missing`);
  return found;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function selectedOption<T>(input: HTMLInputElement, options: readonly T[]): T {
  const index = Number(input.value);
  const value = Number.isSafeInteger(index) ? options[index] : undefined;
  if (value === undefined) throw new RangeError(`Control '${input.id}' has invalid index`);
  return value;
}

export function indexedSliderPosition(index: number, optionCount: number): number {
  if (!Number.isSafeInteger(optionCount) || optionCount < 2)
    throw new RangeError('Indexed sliders require at least two options');
  if (!Number.isSafeInteger(index) || index < 0 || index >= optionCount)
    throw new RangeError('Slider index is outside the option range');
  return (index / (optionCount - 1)) * 100;
}

function configureIndexedSlider(input: HTMLInputElement, options: readonly number[]): void {
  input.min = '0';
  input.max = String(options.length - 1);
  input.step = '1';
}

function renderSliderPips(
  container: HTMLElement,
  options: readonly number[],
  label: (value: number) => string,
): void {
  const pips = options.map((value, index) => {
    const pip = document.createElement('span');
    pip.className = 'slider-pip';
    pip.dataset.index = String(index);
    pip.dataset.value = String(value);
    pip.style.setProperty('--pip-position', `${indexedSliderPosition(index, options.length)}%`);
    pip.textContent = label(value);
    return pip;
  });
  container.setAttribute('aria-hidden', 'true');
  container.replaceChildren(...pips);
}

export function scaleConfigForBet(
  config: RuntimeGameConfig,
  totalBetCredits: number,
): RuntimeGameConfig {
  if (
    !Number.isSafeInteger(totalBetCredits) ||
    totalBetCredits <= 0 ||
    totalBetCredits % config.totalBetCredits !== 0
  )
    throw new RangeError('Selected bet must be a positive whole multiple of the base bet');
  const scale = totalBetCredits / config.totalBetCredits;
  const lineBetCredits = config.lineBetCredits * scale;
  const maximumWinCredits = config.maximumWinCredits * scale;
  if (!Number.isFinite(lineBetCredits) || lineBetCredits <= 0)
    throw new RangeError('Scaled line bet must be finite and positive');
  if (!Number.isSafeInteger(maximumWinCredits))
    throw new RangeError('Scaled bet configuration exceeds safe integer credits');
  if (config.paytable.some((award) => !Number.isSafeInteger(award.awardCredits * lineBetCredits)))
    throw new RangeError('Scaled line bet must resolve every configured award to whole credits');
  return {
    ...config,
    lineBetCredits,
    totalBetCredits,
    maximumWinCredits,
    rules: {
      ...config.rules,
      lineAwardRules: {
        ...config.rules.lineAwardRules,
        lineBetCredits,
        totalBetCredits,
      },
    },
  };
}

export async function animateCreditValue(
  target: HTMLElement,
  value: number,
  wait: (milliseconds: number) => Promise<void> = delay,
  speed: number = 1,
  format: (value: number) => string = String,
): Promise<void> {
  if (value <= 0) {
    target.textContent = format(0);
    return;
  }
  const frames = 8;
  const frameDelay = Math.max(1, Math.floor(presentationTiming(speed).payoutCountUp / frames));
  for (let frame = 1; frame <= frames; frame += 1) {
    target.textContent = format(Math.round((value * frame) / frames));
    await wait(frameDelay);
  }
}

interface SpinExecution {
  readonly winCredits: number;
}

export function attachController(
  config: RuntimeGameConfig,
  scene: Pick<SlotScene, 'present' | 'setPresentationSpeed'>,
  rng: RandomSource,
  diagnostics: SpinDiagnosticsRecorder,
  localization: Localization,
  wait: (milliseconds: number) => Promise<void> = delay,
): () => void {
  const button = element<HTMLButtonElement>('spin');
  const creditsText = element<HTMLElement>('credits');
  const betText = element<HTMLElement>('bet');
  const winText = element<HTMLElement>('win');
  const message = element<HTMLElement>('message');
  const speedControl = element<HTMLInputElement>('speed-control');
  const speedValue = element<HTMLOutputElement>('speed-value');
  const speedPips = element<HTMLElement>('speed-pips');
  const betControl = element<HTMLInputElement>('bet-control');
  const betValue = element<HTMLOutputElement>('bet-value');
  const betPips = element<HTMLElement>('bet-pips');
  const spinsControl = element<HTMLInputElement>('spins-control');
  const spinsValue = element<HTMLOutputElement>('spins-value');
  const spinsPips = element<HTMLElement>('spins-pips');
  const controls = [speedControl, betControl, spinsControl] as const;
  let credits = 1000;
  let latestWin = 0;
  let sequenceActive = false;
  let stopRequested = false;
  let disposed = false;
  let currentMessage: MessageDescriptor = { key: 'ready', params: {} };

  const selectedSpeed = (): PresentationSpeed =>
    selectedOption(speedControl, PRESENTATION_SPEED_OPTIONS);
  const selectedBet = (): number => selectedOption(betControl, BET_OPTIONS);
  const selectedSpins = (): number => selectedOption(spinsControl, SPIN_COUNT_OPTIONS);
  const localizedNumber = (value: number): string => formatNumber(localization.locale, value);

  configureIndexedSlider(speedControl, PRESENTATION_SPEED_OPTIONS);
  configureIndexedSlider(betControl, BET_OPTIONS);
  configureIndexedSlider(spinsControl, SPIN_COUNT_OPTIONS);

  const renderPips = (): void => {
    renderSliderPips(
      speedPips,
      PRESENTATION_SPEED_OPTIONS,
      (value) => `${localizedNumber(value)}×`,
    );
    renderSliderPips(betPips, BET_OPTIONS, localizedNumber);
    renderSliderPips(spinsPips, SPIN_COUNT_OPTIONS, localizedNumber);
  };

  const renderMessage = (): void => {
    message.textContent = localization.renderMessage(currentMessage);
  };
  const setMessage = (next: MessageDescriptor): void => {
    currentMessage = next;
    renderMessage();
  };

  const refreshControls = (): void => {
    const dictionary = localization.dictionary;
    const speed = selectedSpeed();
    const bet = selectedBet();
    const spins = selectedSpins();
    speedValue.value = `${formatDecimal(localization.locale, speed, 1)}×`;
    betValue.value = formatNumber(localization.locale, bet);
    spinsValue.value = formatNumber(localization.locale, spins);
    speedControl.setAttribute('aria-valuetext', dictionary.controls.speedValue(speed));
    betControl.setAttribute('aria-valuetext', dictionary.controls.betValue(bet));
    spinsControl.setAttribute('aria-valuetext', dictionary.controls.spinsValue(spins));
    creditsText.textContent = localizedNumber(credits);
    betText.textContent = localizedNumber(bet);
    winText.textContent = localizedNumber(latestWin);
    button.textContent = sequenceActive ? dictionary.controls.stop : dictionary.controls.spin;
    button.setAttribute(
      'aria-label',
      sequenceActive ? dictionary.controls.stopAria : dictionary.controls.spinAria(spins),
    );
    button.classList.toggle('spin-button--stop', sequenceActive);
    button.disabled = disposed || (!sequenceActive && credits < bet);
    scene.setPresentationSpeed(speed);
  };

  const setControlsLocked = (locked: boolean): void => {
    for (const control of controls) control.disabled = locked;
    refreshControls();
  };

  const executeSpin = async (
    spinConfig: RuntimeGameConfig,
    speed: PresentationSpeed,
    paidCurrent: number,
    paidTotal: number,
  ): Promise<SpinExecution | null> => {
    let debited = false;
    let credited = false;
    try {
      const creditsBefore = credits;
      const result = resolveSpin(spinConfig, rng);
      credits -= spinConfig.totalBetCredits;
      debited = true;
      latestWin = 0;
      refreshControls();
      setMessage({ key: 'paidSpin', params: { current: paidCurrent, total: paidTotal } });
      await scene.present(result);

      const timing = presentationTiming(speed);
      if (result.uncappedBaseWinCredits > 0) {
        setMessage({ key: 'baseWin', params: { amount: result.uncappedBaseWinCredits } });
        await animateCreditValue(
          winText,
          result.uncappedBaseWinCredits,
          wait,
          speed,
          localizedNumber,
        );
        latestWin = result.uncappedBaseWinCredits;
        await wait(timing.baseWinHold);
      } else if (!result.feature) {
        setMessage({ key: 'noWin', params: {} });
      }

      if (result.feature) {
        setMessage({
          key: 'freeSpinsAwarded',
          params: { count: result.feature.initialAwardedSpins },
        });
        await wait(timing.freeSpinTransition);
        let featureSubtotal = 0;
        for (const freeSpin of result.feature.freeSpins) {
          if (disposed) return null;
          const remaining = result.feature.totalPlayedSpins - freeSpin.spinIndex;
          setMessage({
            key: 'freeSpinProgress',
            params: {
              paidCurrent,
              paidTotal,
              current: freeSpin.spinIndex,
              total: result.feature.totalPlayedSpins,
              remaining,
            },
          });
          await scene.present(freeSpin, 'free-spin');
          featureSubtotal += freeSpin.winCredits;
          latestWin = featureSubtotal;
          winText.textContent = localizedNumber(featureSubtotal);
          if (freeSpin.retriggeredFreeSpins > 0) {
            setMessage({
              key: 'retrigger',
              params: { count: freeSpin.retriggeredFreeSpins, subtotal: featureSubtotal },
            });
            await wait(timing.retriggerDisplay);
          } else {
            setMessage({ key: 'featureSubtotal', params: { amount: featureSubtotal } });
          }
        }
        setMessage({
          key: 'featureComplete',
          params: { amount: result.uncappedFeatureWinCredits },
        });
        await wait(timing.featureCompletion);
      }

      if (disposed) return null;
      credits += result.totalWinCredits;
      credited = true;
      latestWin = result.totalWinCredits;
      creditsText.textContent = localizedNumber(credits);
      if (result.totalWinCredits > 0)
        await animateCreditValue(winText, result.totalWinCredits, wait, speed, localizedNumber);
      else winText.textContent = localizedNumber(0);
      diagnostics.recordCompletedSpin({
        timestamp: new Date().toISOString(),
        betCredits: spinConfig.totalBetCredits,
        uncappedBaseWinCredits: result.uncappedBaseWinCredits,
        uncappedFeatureWinCredits: result.uncappedFeatureWinCredits,
        uncappedTotalWinCredits: result.uncappedTotalWinCredits,
        creditedTotalWinCredits: result.totalWinCredits,
        capReductionCredits: result.capReductionCredits,
        creditsBefore,
        creditsAfter: credits,
        featureTriggered: result.featureTriggered,
        scatterCount: result.scatterCount,
        initialFreeSpins: result.feature?.initialAwardedSpins ?? 0,
        totalFreeSpinsPlayed: result.feature?.totalPlayedSpins ?? 0,
        totalRetriggeredSpins: result.feature?.totalRetriggeredSpins ?? 0,
        retriggerCount: result.feature?.retriggerCount ?? 0,
        maximumWinApplied: result.maximumWinApplied,
        feature: result.feature,
        outcome: {
          visibleWindow: result.window,
          reelStops: result.stops,
          lineWins: result.lineWins,
        },
      });
      setMessage(
        result.totalWinCredits === 0
          ? { key: 'noWin', params: {} }
          : result.featureTriggered
            ? {
                key: 'finalWin',
                params: {
                  amount: result.totalWinCredits,
                  base: result.uncappedBaseWinCredits,
                  feature: result.uncappedFeatureWinCredits,
                },
              }
            : { key: 'won', params: { amount: result.totalWinCredits } },
      );
      return { winCredits: result.totalWinCredits };
    } catch (error: unknown) {
      console.error('LUCKY888 spin failed', error);
      if (!disposed) {
        if (debited && !credited) credits += spinConfig.totalBetCredits;
        latestWin = 0;
        refreshControls();
        setMessage({ key: 'spinFailed', params: {} });
      }
      return null;
    }
  };

  const runSequence = async (): Promise<void> => {
    if (disposed || sequenceActive) return;
    const bet = selectedBet();
    const requestedSpins = selectedSpins();
    const speed = selectedSpeed();
    if (credits < bet) {
      setMessage({ key: 'insufficientCredits', params: {} });
      return;
    }
    const spinConfig = scaleConfigForBet(config, bet);
    stopRequested = false;
    sequenceActive = true;
    setControlsLocked(true);
    let completedSpins = 0;
    let lastWin = 0;
    try {
      for (let index = 1; index <= requestedSpins; index += 1) {
        if (disposed || stopRequested) break;
        if (credits < bet) {
          setMessage({ key: 'insufficientCredits', params: {} });
          return;
        }
        const execution = await executeSpin(spinConfig, speed, index, requestedSpins);
        if (!execution) return;
        lastWin = execution.winCredits;
        completedSpins += 1;
      }
      if (stopRequested) {
        setMessage({
          key: 'sequenceStopped',
          params: { completed: completedSpins, total: requestedSpins },
        });
      } else if (requestedSpins > 1) {
        setMessage({
          key: 'sequenceCompleted',
          params: {
            completed: completedSpins,
            total: requestedSpins,
            current: completedSpins,
            amount: lastWin,
          },
        });
      }
    } finally {
      sequenceActive = false;
      stopRequested = false;
      if (!disposed) setControlsLocked(false);
    }
  };

  const activatePrimaryAction = (): void => {
    if (sequenceActive) {
      stopRequested = true;
      return;
    }
    void runSequence();
  };
  const clickHandler = (): void => activatePrimaryAction();
  const keyHandler = (event: KeyboardEvent): void => {
    if (event.code !== 'Space') return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, input, select, textarea, a')) return;
    event.preventDefault();
    activatePrimaryAction();
  };
  const controlHandler = (): void => refreshControls();
  button.addEventListener('click', clickHandler);
  window.addEventListener('keydown', keyHandler);
  for (const control of controls) control.addEventListener('input', controlHandler);
  const unsubscribeLocale = localization.subscribe(() => {
    renderPips();
    refreshControls();
    renderMessage();
  });

  renderPips();
  refreshControls();
  renderMessage();

  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribeLocale();
    button.removeEventListener('click', clickHandler);
    window.removeEventListener('keydown', keyHandler);
    for (const control of controls) control.removeEventListener('input', controlHandler);
    setControlsLocked(true);
  };
}
