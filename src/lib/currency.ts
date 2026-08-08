// Shared currency formatting for the whole app.
// Never display raw floats — always round to exactly 2 decimal places.

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: number): string {
  return roundCurrency(value).toFixed(2);
}

export function formatCurrencyWithSymbol(value: number): string {
  return `RM${formatCurrency(value)}`;
}
