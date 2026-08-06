import type { RandomSource } from './random-source.js';

/** Mulberry32: deterministic development/simulation PRNG; not production-grade randomness. */
export class SeededRandom implements RandomSource {
  private state: number;

  constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) throw new RangeError('Seed must be a safe integer');
    this.state = seed >>> 0;
  }

  nextUint32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  nextInt(exclusiveMaximum: number): number {
    if (!Number.isSafeInteger(exclusiveMaximum) || exclusiveMaximum <= 0) {
      throw new RangeError('exclusiveMaximum must be a positive safe integer');
    }
    const limit = Math.floor(0x1_0000_0000 / exclusiveMaximum) * exclusiveMaximum;
    let value: number;
    do value = this.nextUint32();
    while (value >= limit);
    return value % exclusiveMaximum;
  }
}
