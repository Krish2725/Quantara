import { describe, expect, it } from 'vitest';
import { deriveTransactionLedger, valueTransactionLedger } from '../src/transactionLedger.js';

const instrument = { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD' };
const transaction = (id, type, date, quantity, unitPrice, fees = 0, createdAt = date) => ({ id, type, date, createdAt, instrument, quantity, unitPrice, fees, source: 'import' });

describe('shared transaction ledger accounting', () => {
  it('derives weighted-average basis, buy and sell fees, remaining shares and realized P/L', () => {
    const result = deriveTransactionLedger([
      transaction('b1', 'BUY', '2026-09-07', 10, 150, 1),
      transaction('b2', 'BUY', '2026-09-10', 5, 155, 1),
      transaction('s1', 'SELL', '2026-09-15', 3, 165, 1),
    ]);
    expect(result.holdings[0]).toMatchObject({ quantity: 12, costBasis: 1821.6 });
    expect(result.holdings[0].averageCost).toBeCloseTo(151.8);
    expect(result.transactions.find((item) => item.id === 's1').realizedPnl).toBeCloseTo(38.6);
    expect(result.realizedPnl).toBeCloseTo(38.6);
    expect(result.totalBuyCost).toBe(2277);
  });

  it('uses CSV creation order for trades on the same date and rejects selling before a buy', () => {
    expect(() => deriveTransactionLedger([
      transaction('s', 'SELL', '2026-09-07', 1, 120, 0, '2026-09-07T10:00:00Z'),
      transaction('b', 'BUY', '2026-09-07', 1, 100, 0, '2026-09-07T10:00:01Z'),
    ])).toThrow(/exceeds the available quantity/);
  });

  it('values only with a valid provider quote and reports missing quote values as unavailable', () => {
    const derived = deriveTransactionLedger([transaction('b', 'BUY', '2026-09-07', 2, 100, 1)]);
    expect(valueTransactionLedger(derived, { 'XNGS:NVDA': { price: 120, currency: 'USD', source: 'Twelve Data' } }, 'USD').holdings[0])
      .toMatchObject({ marketValue: 240, unrealizedPnl: 39, quote: { source: 'Twelve Data' } });
    expect(valueTransactionLedger(derived, {}, 'USD').marketValue).toBeNull();
  });
});
