import Phaser from 'phaser';
import type { RuntimeGameConfig, SpinResult, SymbolId } from '@lucky/shared-types';

export class SlotScene extends Phaser.Scene {
  private cells: Phaser.GameObjects.Text[][] = [];

  constructor(private readonly gameConfig: RuntimeGameConfig) {
    super('slot');
  }

  create(): void {
    const width = 800 / this.gameConfig.reelCount;
    const height = 480 / this.gameConfig.visibleRows;
    this.cells = Array.from({ length: this.gameConfig.reelCount }, (_, reel) =>
      Array.from({ length: this.gameConfig.visibleRows }, (_, row) => {
        this.add
          .rectangle(
            reel * width + width / 2,
            row * height + height / 2,
            width - 8,
            height - 8,
            0x173b52,
          )
          .setStrokeStyle(2, 0x37677a);
        return this.add
          .text(reel * width + width / 2, row * height + height / 2, '?', {
            fontFamily: 'system-ui',
            fontSize: '54px',
            color: '#ffd66b',
            fontStyle: 'bold',
          })
          .setOrigin(0.5);
      }),
    );
  }

  async present(result: SpinResult): Promise<void> {
    const display = new Map(this.gameConfig.symbols.map((symbol) => [symbol.id, symbol.display]));
    await Promise.all(
      this.cells.map(
        (reelCells, reel) =>
          new Promise<void>((resolve) => {
            this.time.delayedCall(reel * 120, () => {
              reelCells.forEach((cell, row) => {
                cell
                  .setText(display.get(result.window[reel]?.[row] as SymbolId) ?? '?')
                  .setScale(0.6);
                this.tweens.add({ targets: cell, scale: 1, duration: 260, ease: 'Back.Out' });
              });
              this.time.delayedCall(280, resolve);
            });
          }),
      ),
    );
  }
}
