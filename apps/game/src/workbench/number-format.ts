const integerFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const decimalFormatters = new Map<number, Intl.NumberFormat>();

export function formatInteger(value: number): string {
  return integerFormatter.format(value);
}

export function formatCredits(value: number): string {
  return formatInteger(Math.round(value));
}

export function formatDecimal(value: number, digits = 2): string {
  let formatter = decimalFormatters.get(digits);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    decimalFormatters.set(digits, formatter);
  }
  return formatter.format(value);
}

export function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}×`;
}

export function formatPercent(value: number): string {
  return `${formatDecimal(value * 100)}%`;
}
