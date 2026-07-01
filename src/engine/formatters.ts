export function formatCurrency(value: number, decimals = 0): string {
  if (value === 0) return '—';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-CA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const withPrefix = `$${formatted}`;
  return value < 0 ? `(${withPrefix})` : withPrefix;
}

export function formatCurrencyCompact(value: number): string {
  if (value === 0) return '—';
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1_000_000) {
    formatted = `$${(abs / 1_000_000).toFixed(2)}M`;
  } else if (abs >= 1_000) {
    formatted = `$${(abs / 1_000).toFixed(1)}K`;
  } else {
    formatted = `$${abs.toFixed(0)}`;
  }
  return value < 0 ? `(${formatted})` : formatted;
}

export function formatPercent(value: number | null, decimals = 1): string {
  if (value === null || Number.isNaN(value)) return 'N/A';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-CA', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDSCR(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  return `${value.toFixed(2)}x`;
}

export function formatQuarterLabel(year: number, quarter: number): string {
  return `Y${year}Q${quarter}`;
}
