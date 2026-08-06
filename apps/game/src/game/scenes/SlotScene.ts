import Phaser from 'phaser';
import type { ReelOutcome, ReelStop, RuntimeGameConfig, SymbolId } from '@lucky/shared-types';

interface SceneLifecycle {
  readonly ready: () => void;
  readonly failed: (error: Error) => void;
}

interface ReelView {
  readonly container: Phaser.GameObjects.Container;
  readonly symbols: readonly Phaser.GameObjects.Text[];
  readonly maskShape: Phaser.GameObjects.Graphics;
}

interface PresentationToken {
  cancelled: boolean;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 480;
const DECELERATION_DURATIONS = [54, 66, 82, 104, 134, 172] as const;

export class SlotScene extends Phaser.Scene {
  private reelViews: ReelView[] = [];
  private currentStops: ReelStop[] = [];
  private readonly shutdownCallbacks = new Set<() => void>();
  private finishPresentation: (() => void) | undefined;
  private presentationToken: PresentationToken | undefined;
  private created = false;

  constructor(
    private readonly gameConfig: RuntimeGameConfig,
    private readonly lifecycle: SceneLifecycle,
  ) {
    super('slot');
  }

  create(): void {
    try {
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
      this.currentStops = this.gameConfig.reelStrips.map(() => 0);
      this.createReelBackgrounds();
      this.reelViews = this.gameConfig.reelStrips.map((_, reel) => this.createReelView(reel));
      this.currentStops.forEach((stop, reel) => this.setReelAtStop(reel, stop));
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

  present(result: ReelOutcome, reelSet: 'base' | 'free-spin' = 'base'): Promise<void> {
    if (!this.created)
      return Promise.reject(new Error('Cannot present a spin before scene creation'));
    if (this.finishPresentation)
      return Promise.reject(new Error('Cannot present a second spin while presentation is active'));
    const strips =
      reelSet === 'free-spin' ? this.gameConfig.freeSpinReelStrips : this.gameConfig.reelStrips;
    this.validateResult(result, strips);

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

      this.reelViews.forEach((_, reel) => {
        const finalStop = this.reelStop(result, reel, strips);
        const stripLength = strips[reel]?.length ?? 0;
        const storedStop = this.currentStops[reel];
        if (storedStop === undefined) throw new Error(`Reel ${reel + 1} has no current stop`);
        const currentStop = storedStop % stripLength;
        const distance = (currentStop - finalStop + stripLength) % stripLength;
        const totalSteps = (reel + 1) * stripLength + distance;
        this.animateReel(
          reel,
          finalStop,
          result.window[reel] ?? [],
          totalSteps,
          strips,
          token,
          () => {
            completedReels += 1;
            if (completedReels === this.reelViews.length) finish();
          },
        );
      });
    });
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
    const symbols = Array.from({ length: this.gameConfig.visibleRows + 1 }, (_, index) =>
      this.add
        .text(centerX, (index - 1) * height + height / 2, '', {
          fontFamily: 'system-ui',
          fontSize: '54px',
          color: '#ffd66b',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );
    container.add(symbols).setMask(maskShape.createGeometryMask());
    return { container, symbols, maskShape };
  }

  private animateReel(
    reel: number,
    finalStop: ReelStop,
    finalWindow: readonly SymbolId[],
    totalSteps: number,
    strips: readonly (readonly SymbolId[])[],
    token: PresentationToken,
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
      const decelerationIndex = DECELERATION_DURATIONS.length - remaining;
      const duration =
        decelerationIndex >= 0 ? (DECELERATION_DURATIONS[decelerationIndex] ?? 172) : 36;
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
          done();
        },
      });
    };
    advance();
  }

  private setReelAtStop(
    reel: number,
    stop: ReelStop,
    strips: readonly (readonly SymbolId[])[] = this.gameConfig.reelStrips,
  ): void {
    const strip = strips[reel];
    const view = this.reelViews[reel];
    if (!strip || strip.length === 0 || !view) throw new Error(`Cannot display reel ${reel + 1}`);
    view.symbols.forEach((text, index) => {
      const stripIndex = (stop + index - 1 + strip.length) % strip.length;
      const symbolId = strip[stripIndex];
      if (symbolId === undefined) throw new Error(`Reel ${reel + 1} is missing stop ${stripIndex}`);
      text.setText(this.displaySymbol(symbolId));
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
    view.symbols[0]?.setText(this.displaySymbol(preceding));
    finalWindow.forEach((symbol, row) => {
      const text = view.symbols[row + 1];
      if (!text) throw new Error(`Reel ${reel + 1} is missing display row ${row + 1}`);
      text.setText(this.displaySymbol(symbol));
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

  private readonly handleShutdown = (): void => {
    this.created = false;
    for (const callback of this.shutdownCallbacks) callback();
    this.shutdownCallbacks.clear();
    if (this.presentationToken) this.presentationToken.cancelled = true;
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
