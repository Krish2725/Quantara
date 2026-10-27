import { deriveTransactionLedger } from '@quantara/analytics';

/** Canonical persisted-ledger summary. Quotes and provider histories remain separate market-data inputs. */
export function summarizePortfolio(portfolio) {
  if (!portfolio) return null;
  const derived = deriveTransactionLedger(portfolio.transactions || []);
  const openHoldings = derived.holdings.filter((holding) => holding.quantity > 0);
  return {
    transactionCount: derived.transactions.length,
    realizedPnl: derived.realizedPnl,
    totalBuyCost: derived.totalBuyCost,
    openHoldings: openHoldings.map((holding) => ({
      instrument: holding.instrument, quantity: holding.quantity, costBasis: holding.costBasis, averageCost: holding.averageCost,
    })),
    historicalPriceSource: 'Twelve Data provider history only',
  };
}
