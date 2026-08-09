import Phaser from 'phaser';
import type {
  LineWin,
  ReelOutcome,
  ReelStop,
  RuntimeGameConfig,
  SymbolId,
} from '@lucky/shared-types';
import { presentationTiming } from '../presentation-timing.js';
import {
  matchedPaylineCenters,
  paylineColor,
  RetainedPaylinePresentation,
} from '../payline-presentation.js';
import { formatNumber, type Localization } from '../../i18n/index.js';
import { symbolTextureKey, symbolVisual } from '../symbol-visuals.js';
import { initialReelWindow } from '../initial-window.js';

interface SceneLifecycle {
  readonly ready: () => void;
  readonly failed: (error: Error) => void;
}

interface ReelView {
  readonly container: Phaser.GameObjects.Container;
  readonly symbols: readonly SymbolView[];
  readonly maskShape: Phaser.GameObjects.Graphics;
}

interface SymbolView {
  readonly container: Phaser.GameObjects.Container;
  readonly frame: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;
}

interface PresentationToken {
  cancelled: boolean;
}

type WinLabelState =
  | { readonly kind: 'single'; readonly win: LineWin }
  | { readonly kind: 'all'; readonly count: number };

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 480;
export class SlotScene extends Phaser.Scene {
  private reelViews: ReelView[] = [];
  private currentStops: ReelStop[] = [];
  private readonly shutdownCallbacks = new Set<() => void>();
  private finishPresentation: (() => void) | undefined;
  private presentationToken: PresentationToken | undefined;
  private lineOverlay: Phaser.GameObjects.Graphics | undefined;
  private winLabel: Phaser.GameObjects.Text | undefined;
  private presentationSpeed = 1;
  private winLabelState: WinLabelState | undefined;
  private readonly retainedPaylines = new RetainedPaylinePresentation();
  private disposeLocalization: (() => void) | undefined;
  private created = false;

  constructor(
    private readonly gameConfig: RuntimeGameConfig,
    private readonly localization: Localization,
    private readonly lifecycle: SceneLifecycle,
  ) {
    super('slot');
  }

  create(): void {
    try {
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
      this.currentStops = this.gameConfig.reelStrips.map(() => 0);
      initialReelWindow(this.gameConfig);
      this.createReelBackgrounds();
      this.createSymbolTextures();
      for (const symbol of this.gameConfig.symbols) {
        if (!this.textures.exists(symbolTextureKey(symbol.id)))
          throw new Error(`Unable to render symbol: texture creation failed for ${symbol.id}`);
      }
      this.reelViews = this.gameConfig.reelStrips.map((_, reel) => this.createReelView(reel));
      this.currentStops.forEach((stop, reel) => this.setReelAtStop(reel, stop));
      this.lineOverlay = this.add.graphics().setDepth(20);
      this.winLabel = this.add
        .text(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 14, '', {
          fontFamily: 'system-ui',
          fontSize: '22px',
          color: '#ffffff',
          backgroundColor: '#07111fdd',
          padding: { x: 12, y: 6 },
        })
        .setOrigin(0.5, 1)
        .setDepth(21)
        .setVisible(false);
      this.disposeLocalization = this.localization.subscribe(() => this.renderWinLabel());
      this.created = true;
      this.lifecycle.ready();
    } catch (error: unknown) {
      this.lifecycle.failed(this.toError(error, 'Slot scene initialization failed'));
    }
  }

  registerShutdown(callback: () => void): void {
    if (!this.created) throw new Error('Cannot register cleanup before the slot scene is created');
    this.shutdownCallbacks.add(callback);
  }

  setPresentationSpeed(multiplier: number): void {
    presentationTiming(multiplier);
    this.presentationSpeed = multiplier;
  }

  present(result: ReelOutcome, reelSet: 'base' | 'free-spin' = 'base'): Promise<void> {
    if (!this.created)
      return Promise.reject(new Error('Cannot present a spin before scene creation'));
    if (this.finishPresentation)
      return Promise.reject(new Error('Cannot present a second spin while presentation is active'));
    const strips =
      reelSet === 'free-spin' ? this.gameConfig.freeSpinReelStrips : this.gameConfig.reelStrips;
    this.validateResult(result, strips);
    this.beginSpinPresentation();
    const timing = presentationTiming(this.presentationSpeed);

    return new Promise((resolve) => {
      let completedReels = 0;
      let settled = false;
      const token: PresentationToken = { cancelled: false };
      const finish = (): void => {
        if (settled) return;
        settled = true;
        this.finishPresentation = undefined;
        this.presentationToken = undefined;
        resolve();
      };
      this.finishPresentation = finish;
      this.presentationToken = token;

      const reelsFinished = async (): Promise<void> => {
        this.rememberWinningStage(0, result.window, result.lineWins);
        await this.presentLineWins(result.lineWins, token);
        const cascadeStages = result.cascades?.slice(1) ?? [];
        for (const stage of cascadeStages) {
          if (token.cancelled) break;
          this.clearTransientWinPresentation();
          stage.window.forEach((column, reel) => {
            this.snapToResolvedWindow(reel, result.stops[reel] ?? 0, column, strips);
          });
          await new Promise<void>((stageReady) => {
            this.time.delayedCall(timing.symbolLanding, stageReady);
          });
          this.rememberWinningStage(stage.index, stage.window, stage.lineWins);
          await this.presentLineWins(stage.lineWins, token);
        }
        if (!token.cancelled) this.renderRetainedWinningStage(result.stops, strips);
        finish();
      };
      this.reelViews.forEach((_, reel) => {
        const finalStop = this.reelStop(result, reel, strips);
        const stripLength = strips[reel]?.length ?? 0;
        const storedStop = this.currentStops[reel];
        if (storedStop === undefined) throw new Error(`Reel ${reel + 1} has no current stop`);
        const currentStop = storedStop % stripLength;
        const distance = (currentStop - finalStop + stripLength) % stripLength;
        const totalSteps = stripLength + distance;
        this.time.delayedCall(timing.reelStopStagger * reel, () => {
          if (token.cancelled) return;
          this.animateReel(
            reel,
            finalStop,
            result.window[reel] ?? [],
            totalSteps,
            strips,
            token,
            timing,
            () => {
              completedReels += 1;
              if (completedReels === this.reelViews.length) void reelsFinished();
            },
          );
        });
      });
    });
  }

  /** The sole normal-play boundary that retires a resolved spin's retained paylines. */
  beginSpinPresentation(): void {
    this.retainedPaylines.beginSpin();
    this.clearTransientWinPresentation();
  }

  visibleWinningPaylineIds(): readonly string[] {
    return this.retainedPaylines.current()?.lineWins.map((win) => win.paylineId) ?? [];
  }

  private rememberWinningStage(
    stageIndex: number,
    window: readonly (readonly SymbolId[])[],
    lineWins: readonly LineWin[],
  ): void {
    this.retainedPaylines.rememberWinningStage({ stageIndex, window, lineWins });
  }

  private renderRetainedWinningStage(
    stops: readonly ReelStop[],
    strips: readonly (readonly SymbolId[])[],
  ): void {
    const stage = this.retainedPaylines.current();
    if (!stage) return;
    this.clearTransientWinPresentation();
    stage.window.forEach((column, reel) => {
      this.snapToResolvedWindow(reel, stops[reel] ?? 0, column, strips);
    });
    for (const win of stage.lineWins) this.drawLineWin(win, false, false);
    this.winLabelState = { kind: 'all', count: stage.lineWins.length };
    this.renderWinLabel();
  }

  private createReelBackgrounds(): void {
    const width = CANVAS_WIDTH / this.gameConfig.reelCount;
    const height = CANVAS_HEIGHT / this.gameConfig.visibleRows;
    for (let reel = 0; reel < this.gameConfig.reelCount; reel += 1) {
      for (let row = 0; row < this.gameConfig.visibleRows; row += 1) {
        this.add
          .rectangle(
            reel * width + width / 2,
            row * height + height / 2,
            width - 8,
            height - 8,
            0x173b52,
          )
          .setStrokeStyle(2, 0x37677a);
      }
    }
  }

  private createReelView(reel: number): ReelView {
    const width = CANVAS_WIDTH / this.gameConfig.reelCount;
    const height = CANVAS_HEIGHT / this.gameConfig.visibleRows;
    const centerX = reel * width + width / 2;
    const maskShape = this.make.graphics({ x: 0, y: 0 });
    maskShape.fillStyle(0xffffff).fillRect(reel * width + 4, 0, width - 8, CANVAS_HEIGHT);
    const container = this.add.container(0, 0);
    const defaultSymbol = this.gameConfig.symbols[0];
    if (!defaultSymbol) throw new Error('At least one symbol is required');
    const symbols = Array.from({ length: this.gameConfig.visibleRows + 1 }, (_, index) => {
      const cell = this.add.container(centerX, (index - 1) * height + height / 2);
      const frame = this.add
        .image(0, 0, symbolTextureKey(defaultSymbol.id))
        .setDisplaySize(width - 14, height - 14);
      const label = this.add
        .text(0, 0, '', {
          fontFamily: 'system-ui',
          fontSize: '54px',
          color: '#ffd66b',
          fontStyle: 'bold',
          stroke: '#251300',
          strokeThickness: 5,
          shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 8, fill: true },
        })
        .setOrigin(0.5);
      cell.add([frame, label]);
      return { container: cell, frame, label };
    });
    container
      .add(symbols.map((symbol) => symbol.container))
      .setMask(maskShape.createGeometryMask());
    return { container, symbols, maskShape };
  }

  private createSymbolTextures(): void {
    const width = CANVAS_WIDTH / this.gameConfig.reelCount - 14;
    const height = CANVAS_HEIGHT / this.gameConfig.visibleRows - 14;
    for (const symbol of this.gameConfig.symbols) {
      const key = symbolTextureKey(symbol.id);
      if (this.textures.exists(key)) continue;
      const visual = symbolVisual(symbol.id);
      const texture = this.textures.createCanvas(key, width, height);
      if (!texture) throw new Error(`Unable to create visual texture for symbol '${symbol.id}'`);
      const context = texture.getContext();
      const radius = 17;
      context.save();
      context.beginPath();
      context.roundRect(2, 2, width - 4, height - 4, radius);
      context.clip();
      const gradient = context.createRadialGradient(
        width * 0.34,
        height * 0.22,
        3,
        width * 0.52,
        height * 0.58,
        Math.max(width, height) * 0.72,
      );
      gradient.addColorStop(0, visual.highlight);
      gradient.addColorStop(0.46, visual.mid);
      gradient.addColorStop(1, visual.shadow);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      const glow = context.createRadialGradient(
        width * 0.5,
        height * 0.42,
        0,
        width * 0.5,
        height * 0.42,
        width * 0.42,
      );
      glow.addColorStop(0, `${visual.glow}55`);
      glow.addColorStop(1, `${visual.glow}00`);
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);
      context.restore();
      context.beginPath();
      context.roundRect(2, 2, width - 4, height - 4, radius);
      context.lineWidth = 5;
      context.strokeStyle = '#101820';
      context.stroke();
      context.beginPath();
      context.roundRect(6, 6, width - 12, height - 12, radius - 4);
      context.lineWidth = 2;
      context.strokeStyle = '#d5a94f';
      context.stroke();
      context.beginPath();
      context.moveTo(18, 10);
      context.lineTo(width - 18, 10);
      context.lineWidth = 2;
      context.strokeStyle = `${visual.accent}aa`;
      context.stroke();
      texture.refresh();
    }
  }

  private animateReel(
    reel: number,
    finalStop: ReelStop,
    finalWindow: readonly SymbolId[],
    totalSteps: number,
    strips: readonly (readonly SymbolId[])[],
    token: PresentationToken,
    timing: ReturnType<typeof presentationTiming>,
    done: () => void,
  ): void {
    const view = this.reelViews[reel];
    const strip = strips[reel];
    if (!view || !strip || strip.length === 0) {
      throw new Error(`Cannot animate missing or empty reel ${reel + 1}`);
    }
    const height = CANVAS_HEIGHT / this.gameConfig.visibleRows;
    let completedSteps = 0;
    let visualStop = this.currentStops[reel] ?? 0;

    const advance = (): void => {
      if (token.cancelled) return;
      const remaining = totalSteps - completedSteps;
      const decelerationIndex = timing.reelDeceleration.length - remaining;
      const duration =
        decelerationIndex >= 0
          ? (timing.reelDeceleration[decelerationIndex] ??
            timing.reelDeceleration.at(-1) ??
            timing.reelStep)
          : timing.reelStep;
      this.tweens.add({
        targets: view.container,
        y: height,
        duration,
        ease: decelerationIndex >= 0 ? 'Sine.Out' : 'Linear',
        onComplete: () => {
          if (token.cancelled) return;
          completedSteps += 1;
          visualStop = (visualStop - 1 + strip.length) % strip.length;
          view.container.y = 0;
          this.setReelAtStop(reel, visualStop, strips);
          if (completedSteps < totalSteps) {
            advance();
            return;
          }
          this.snapToResolvedWindow(reel, finalStop, finalWindow, strips);
          this.tweens.add({
            targets: view.symbols.slice(1).map((symbol) => symbol.container),
            scaleX: 1.08,
            scaleY: 1.08,
            yoyo: true,
            duration: timing.symbolLanding,
            onComplete: done,
          });
        },
      });
    };
    advance();
  }

  private async presentLineWins(
    lineWins: readonly LineWin[],
    token: PresentationToken,
  ): Promise<void> {
    if (lineWins.length === 0 || token.cancelled) return;
    const timing = presentationTiming(this.presentationSpeed);
    for (const win of lineWins) {
      if (token.cancelled) return;
      this.drawLineWin(win, true);
      await this.wait(timing.paylineDisplay, token);
    }
    if (token.cancelled) return;
    this.clearTransientWinPresentation();
    for (const win of lineWins) this.drawLineWin(win, false);
    this.winLabelState = { kind: 'all', count: lineWins.length };
    this.renderWinLabel();
    await this.wait(timing.allPaylinesDisplay, token);
  }

  private drawLineWin(win: LineWin, clear: boolean, animate = true): void {
    if (clear) this.clearTransientWinPresentation();
    const payline = this.gameConfig.paylines.find((candidate) => candidate.id === win.paylineId);
    if (!payline) throw new Error(`Resolved win references unknown payline '${win.paylineId}'`);
    const color = paylineColor(win.paylineId);
    const points = matchedPaylineCenters(
      payline,
      win.count,
      this.gameConfig.reelCount,
      this.gameConfig.visibleRows,
      CANVAS_WIDTH,
      CANVAS_HEIGHT,
    );
    if (points.length > 0) {
      this.lineOverlay?.lineStyle(8, color, 0.9).strokePoints([...points], false, false);
    }
    points.forEach((_, reel) => {
      const row = payline.rows[reel];
      const symbol = row === undefined ? undefined : this.reelViews[reel]?.symbols[row + 1];
      if (!symbol) return;
      symbol.frame.setTint(color);
      symbol.label.setTint(color);
      if (animate)
        this.tweens.add({
          targets: symbol.container,
          scaleX: 1.18,
          scaleY: 1.18,
          alpha: 0.72,
          yoyo: true,
          repeat: 1,
          duration: Math.max(
            24,
            Math.floor(presentationTiming(this.presentationSpeed).paylineDisplay / 4),
          ),
        });
    });
    if (clear) {
      this.winLabelState = { kind: 'single', win };
      this.renderWinLabel();
    }
  }

  private renderWinLabel(): void {
    if (!this.winLabelState) return;
    const text =
      this.winLabelState.kind === 'all'
        ? this.localization.dictionary.presentation.winningPaylines(this.winLabelState.count)
        : `${this.winLabelState.win.paylineId} · ${this.winLabelState.win.symbolId} ×${this.winLabelState.win.count} · +${formatNumber(this.localization.locale, this.winLabelState.win.awardCredits)}`;
    this.winLabel?.setText(text).setVisible(true);
  }

  private clearTransientWinPresentation(): void {
    this.lineOverlay?.clear();
    this.winLabelState = undefined;
    this.winLabel?.setVisible(false).setText('');
    for (const view of this.reelViews) {
      for (const symbol of view.symbols) {
        this.tweens.killTweensOf(symbol.container);
        symbol.frame.clearTint();
        symbol.label.clearTint();
        symbol.container.setAlpha(1).setScale(1);
      }
    }
  }

  private wait(milliseconds: number, token: PresentationToken): Promise<void> {
    return new Promise((resolve) => {
      this.time.delayedCall(milliseconds, () => resolve());
      if (token.cancelled) resolve();
    });
  }

  private setReelAtStop(
    reel: number,
    stop: ReelStop,
    strips: readonly (readonly SymbolId[])[] = this.gameConfig.reelStrips,
  ): void {
    const strip = strips[reel];
    const view = this.reelViews[reel];
    if (!strip || strip.length === 0 || !view) throw new Error(`Cannot display reel ${reel + 1}`);
    view.symbols.forEach((symbol, index) => {
      const stripIndex = (stop + index - 1 + strip.length) % strip.length;
      const symbolId = strip[stripIndex];
      if (symbolId === undefined) throw new Error(`Reel ${reel + 1} is missing stop ${stripIndex}`);
      this.setSymbol(symbol, symbolId);
    });
  }

  private snapToResolvedWindow(
    reel: number,
    finalStop: ReelStop,
    finalWindow: readonly SymbolId[],
    strips: readonly (readonly SymbolId[])[],
  ): void {
    const view = this.reelViews[reel];
    const strip = strips[reel];
    if (!view || !strip || strip.length === 0) throw new Error(`Cannot stop reel ${reel + 1}`);
    view.container.y = 0;
    const preceding = strip[(finalStop - 1 + strip.length) % strip.length];
    if (preceding === undefined) throw new Error(`Reel ${reel + 1} has no preceding symbol`);
    const precedingView = view.symbols[0];
    if (precedingView) this.setSymbol(precedingView, preceding);
    finalWindow.forEach((symbol, row) => {
      const symbolView = view.symbols[row + 1];
      if (!symbolView) throw new Error(`Reel ${reel + 1} is missing display row ${row + 1}`);
      this.setSymbol(symbolView, symbol);
    });
    this.currentStops[reel] = finalStop;
  }

  private validateResult(result: ReelOutcome, strips: readonly (readonly SymbolId[])[]): void {
    if (result.window.length !== this.gameConfig.reelCount) {
      throw new Error(
        `Spin window has ${result.window.length} reels; expected ${this.gameConfig.reelCount}`,
      );
    }
    if (result.stops.length !== this.gameConfig.reelCount) {
      throw new Error(
        `Spin result has ${result.stops.length} stops; expected ${this.gameConfig.reelCount}`,
      );
    }
    result.window.forEach((reel, index) => {
      if (reel.length !== this.gameConfig.visibleRows) {
        throw new Error(
          `Spin window reel ${index + 1} has ${reel.length} rows; expected ${this.gameConfig.visibleRows}`,
        );
      }
      reel.forEach((symbol) => this.displaySymbol(symbol));
      this.reelStop(result, index, strips);
    });
    result.cascades?.forEach((stage) => {
      if (stage.window.length !== this.gameConfig.reelCount)
        throw new Error(`Cascade ${stage.index} has an invalid reel count`);
      stage.window.forEach((column, reel) => {
        if (column.length !== this.gameConfig.visibleRows)
          throw new Error(`Cascade ${stage.index}, reel ${reel + 1} has an invalid row count`);
        column.forEach((symbol) => this.displaySymbol(symbol));
      });
    });
  }

  private reelStop(
    result: ReelOutcome,
    reel: number,
    strips: readonly (readonly SymbolId[])[],
  ): ReelStop {
    const stop = result.stops[reel];
    const stripLength = strips[reel]?.length ?? 0;
    if (stop === undefined || stop < 0 || stop >= stripLength) {
      throw new Error(`Spin result contains invalid stop '${String(stop)}' for reel ${reel + 1}`);
    }
    return stop;
  }

  private displaySymbol(symbolId: SymbolId): string {
    const symbol = this.gameConfig.symbols.find((candidate) => candidate.id === symbolId);
    if (!symbol) throw new Error(`Spin window references unknown symbol '${symbolId}'`);
    return symbol.display;
  }

  private setSymbol(view: SymbolView, symbolId: SymbolId): void {
    view.frame.setTexture(symbolTextureKey(symbolId));
    view.label.setText(this.displaySymbol(symbolId));
  }

  private readonly handleShutdown = (): void => {
    this.created = false;
    for (const callback of this.shutdownCallbacks) callback();
    this.shutdownCallbacks.clear();
    if (this.presentationToken) this.presentationToken.cancelled = true;
    this.disposeLocalization?.();
    this.disposeLocalization = undefined;
    this.retainedPaylines.shutdown();
    this.clearTransientWinPresentation();
    this.tweens.killTweensOf(this.reelViews.map((view) => view.container));
    if (this.finishPresentation) this.finishPresentation();
    this.finishPresentation = undefined;
    this.presentationToken = undefined;
    for (const view of this.reelViews) view.maskShape.destroy();
    this.reelViews = [];
    this.currentStops = [];
  };

  private toError(error: unknown, context: string): Error {
    return error instanceof Error
      ? new Error(`${context}: ${error.message}`, { cause: error })
      : new Error(context);
  }
}
