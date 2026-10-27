/** Shared transaction-derived holdings and accounting calculations. */
export function deriveTransactionLedger(transactions) {
  if (!Array.isArray(transactions)) throw new TypeError('transactions must be an array.');
  const sorted = [...transactions].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const positions = new Map();
  const rows = [];
  let totalBuyCost = 0;
  let realizedPnl = 0;
  for (const transaction of sorted) {
    const { instrument, quantity, unitPrice, fees } = transaction;
    if (!instrument || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(fees) || fees < 0 || !['BUY', 'SELL'].includes(transaction.type)) {
      throw new TypeError('Transaction values must contain a valid instrument, BUY/SELL type, positive quantity and price, and non-negative fees.');
    }
    const key = `${instrument.micCode}:${instrument.symbol}`;
    const position = positions.get(key) || { instrument, quantity: 0, costBasis: 0, realizedPnl: 0 };
    let realized = null;
    if (transaction.type === 'BUY') {
      const cost = quantity * unitPrice + fees;
      if (!Number.isFinite(cost) || !Number.isFinite(position.costBasis + cost)) throw new TypeError('Transaction cost exceeds the supported numeric range.');
      totalBuyCost += cost;
      position.quantity += quantity;
      position.costBasis += cost;
    } else {
      if (quantity > position.quantity + 1e-10) throw new TypeError(`Sale of ${instrument.symbol} on ${transaction.date} exceeds the available quantity.`);
      const costRemoved = position.quantity === 0 ? 0 : position.costBasis / position.quantity * quantity;
      realized = quantity * unitPrice - fees - costRemoved;
      position.quantity = Math.max(0, position.quantity - quantity);
      position.costBasis = Math.max(0, position.costBasis - costRemoved);
      position.realizedPnl += realized;
      realizedPnl += realized;
    }
    positions.set(key, position);
    rows.push({ ...transaction, realizedPnl: realized });
  }
  const holdings = [...positions.values()].map((position) => ({ ...position, averageCost: position.quantity > 0 ? position.costBasis / position.quantity : 0 }));
  return { holdings, transactions: rows.reverse(), totalBuyCost, realizedPnl };
}

export function valueTransactionLedger(derived, quotes = {}, baseCurrency = '') {
  const holdings = derived.holdings.map((position) => {
    const key = `${position.instrument.micCode}:${position.instrument.symbol}`;
    const candidate = quotes[key] || null;
    const currency = candidate?.currency?.trim?.().toUpperCase();
    const valid = candidate && Number.isFinite(candidate.price) && candidate.price > 0 && /^[A-Z]{3}$/.test(currency || '');
    const quoteCurrencyMismatch = Boolean(valid && baseCurrency && currency !== baseCurrency.toUpperCase());
    const quote = valid ? candidate : null;
    const marketValue = quote && !quoteCurrencyMismatch && position.quantity > 0 ? position.quantity * quote.price : null;
    const unrealizedPnl = marketValue == null ? null : marketValue - position.costBasis;
    return { ...position, quote, quoteCurrencyMismatch, marketValue, unrealizedPnl, unrealizedPnlPercent: position.costBasis > 0 && unrealizedPnl != null ? unrealizedPnl / position.costBasis : null };
  });
  const quoted = holdings.filter((holding) => holding.marketValue != null);
  const open = holdings.filter((holding) => holding.quantity > 0);
  const marketValue = quoted.length === open.length ? quoted.reduce((sum, holding) => sum + holding.marketValue, 0) : null;
  const openCostBasis = open.reduce((sum, holding) => sum + holding.costBasis, 0);
  const unrealizedPnl = open.every((holding) => holding.unrealizedPnl != null) ? open.reduce((sum, holding) => sum + holding.unrealizedPnl, 0) : null;
  return { ...derived, holdings, marketValue, openCostBasis, unrealizedPnl,
    unrealizedPnlPercent: openCostBasis > 0 && unrealizedPnl != null ? unrealizedPnl / openCostBasis : null,
    totalPnl: unrealizedPnl == null ? null : derived.realizedPnl + unrealizedPnl,
    totalPnlPercent: derived.totalBuyCost > 0 && unrealizedPnl != null ? (derived.realizedPnl + unrealizedPnl) / derived.totalBuyCost : null };
}
