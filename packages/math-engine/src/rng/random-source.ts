export interface RandomSource {
  nextUint32(): number;
  nextFloat(): number;
  nextInt(exclusiveMaximum: number): number;
}

export interface ProductionRandomSource extends RandomSource {
  readonly productionApproved: boolean;
}
