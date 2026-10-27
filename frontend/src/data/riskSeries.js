function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

/** Validate and put dated provider/imported prices in deterministic chronological order. */
export function prepareRiskObservations(series) {
  if (!Array.isArray(series)) throw new Error('Price history is missing or invalid. Refresh the holding and try again.');
  const observations = series.map((point, index) => {
    if (!point || !isValidDate(point.date) || typeof point.price !== 'number' || !Number.isFinite(point.price) || point.price <= 0) {
      throw new Error(`Price history contains an invalid observation at row ${index + 1}. Refresh the holding or correct the imported data.`);
    }
    return { date: point.date, price: point.price };
  }).sort((a, b) => a.date.localeCompare(b.date));
  for (let index = 1; index < observations.length; index += 1) {
    if (observations[index].date === observations[index - 1].date) throw new Error(`Price history contains a duplicate observation for ${observations[index].date}.`);
  }
  if (observations.length < 3) throw new Error('At least three valid dated prices are required for risk analysis.');
  return observations;
}

export function describeMaximumDrawdown(observations, drawdownDetails) {
  const peak = observations?.[drawdownDetails?.peakIndex];
  const trough = observations?.[drawdownDetails?.troughIndex];
  const maxDrawdown = drawdownDetails?.maxDrawdown;
  if (!peak || !trough || !Number.isFinite(maxDrawdown) || maxDrawdown > 0) {
    throw new Error('Maximum drawdown details do not match the validated dated price observations.');
  }
  return { peakDate: peak.date, troughDate: trough.date, maxDrawdownPercent: maxDrawdown * 100 };
}
