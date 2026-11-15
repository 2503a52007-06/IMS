const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrNumberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '₹—';
  }
  return inrFormatter.format(Math.round(amount));
}

export function formatIndianNumber(amount: number): string {
  if (Number.isNaN(amount)) return '0';
  return inrNumberFormatter.format(Math.round(amount));
}

export function formatForeignOrigin(amount: number, currency: string): string {
  if (!currency || currency.toUpperCase() === 'INR') {
    return formatINR(amount);
  }
  return `${currency.toUpperCase()} ${amount.toLocaleString('en-US')}`;
}
