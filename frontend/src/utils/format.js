const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumber(value) {
  return Number.isFinite(value) ? numberFormatter.format(value) : '—';
}

export function formatPercent(value, { signed = true, digits = 1 } = {}) {
  if (!Number.isFinite(value)) return '—';
  const formatted = `${(value * 100).toFixed(digits)}%`;
  return signed && value > 0 ? `+${formatted}` : formatted;
}

export function formatSharpe(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

export function formatDate(date, options = { month: 'short', day: 'numeric' }) {
  if (typeof date !== 'string') return '—';
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.valueOf())
    ? date
    : new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(parsed);
}
