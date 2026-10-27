import { describe, expect, it } from 'vitest';
import { createEmptyLedger, currencyMismatchMessage, derivePortfolio, readLedger, validateLedger, valuePortfolio, writeLedger, deserializePersistedLedger, isProviderEligibleInstrument, markProviderQuoteVerified } from './ledger.js';

const instrument = { symbol: 'ABC', name: 'Alpha Corp', exchange: 'NYSE', micCode: 'XNYS', currency: 'USD', country: 'United States', type: 'Common Stock' };
function txn(id, type, date, quantity, unitPrice, fees = 0) { return { id, type, date, instrument, quantity, unitPrice, fees, createdAt: `${date}T12:00:00Z` }; }
function usdLedger(transactions = []) { return { ...createEmptyLedger(), config: { baseCurrency: 'USD' }, transactions }; }

describe('transaction ledger weighted-average costing', () => {
  it('preserves persisted instrument identity and safely enables exact quote verification for legacy metadata', () => {
    const savedInstrument = { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD' };
    const restored = deserializePersistedLedger({ config: { baseCurrency: 'USD' }, transactions: [txn('legacy', 'BUY', '2025-01-01', 1, 100), { ...txn('nvda', 'BUY', '2025-01-01', 1, 100), instrument: savedInstrument }] });
    const instrument = restored.transactions[1].instrument;
    expect(instrument).toMatchObject({ symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', verification: 'legacy-unverified' });
    expect(isProviderEligibleInstrument(instrument)).toBe(true);
    const verified = markProviderQuoteVerified(restored, instrument);
    expect(verified.transactions[1].instrument.verification).toBe('provider-quote');
    expect(isProviderEligibleInstrument({ ...savedInstrument, verification: 'manual' })).toBe(false);
  });
  it('starts a new Indian-market ledger in INR', () => {
    expect(createEmptyLedger().config.baseCurrency).toBe('INR');
  });
  it('calculates weighted-average basis across buys including purchase fees', () => {
    const ledger = usdLedger([txn('b1', 'BUY', '2025-01-01', 10, 10, 2), txn('b2', 'BUY', '2025-02-01', 10, 20, 4)]);
    const [holding] = derivePortfolio(ledger).holdings;
    expect(holding.quantity).toBe(20);
    expect(holding.costBasis).toBe(306);
    expect(holding.averageCost).toBeCloseTo(15.3);
  });

  it('calculates realized P/L on partial and full sales and removes sold-share basis once', () => {
    const ledger = usdLedger([
      txn('b1', 'BUY', '2025-01-01', 10, 10, 2), txn('b2', 'BUY', '2025-01-02', 10, 20, 4),
      txn('s1', 'SELL', '2025-01-03', 5, 25, 3), txn('s2', 'SELL', '2025-01-04', 15, 12, 3),
    ]);
    const result = derivePortfolio(ledger);
    expect(result.transactions.find((x) => x.id === 's1').realizedPnl).toBeCloseTo(125 - 3 - 76.5);
    expect(result.transactions.find((x) => x.id === 's2').realizedPnl).toBeCloseTo(180 - 3 - 229.5);
    expect(result.realizedPnl).toBeCloseTo((125 - 3 - 76.5) + (180 - 3 - 229.5));
    expect(result.holdings[0].quantity).toBe(0);
    expect(result.holdings[0].costBasis).toBe(0);
  });

  it('preserves remaining-share basis and values only when a real quote is supplied', () => {
    const ledger = usdLedger([txn('b1', 'BUY', '2025-01-01', 10, 10, 2), txn('s1', 'SELL', '2025-01-03', 4, 15, 1)]);
    const key = 'XNYS:ABC';
    expect(valuePortfolio(ledger).marketValue).toBeNull();
    const summary = valuePortfolio(ledger, { [key]: { price: 12, currency: 'USD' } });
    expect(summary.holdings[0].quantity).toBe(6);
    expect(summary.holdings[0].costBasis).toBeCloseTo(61.2);
    expect(summary.holdings[0].averageCost).toBeCloseTo(10.2);
    expect(summary.holdings[0].marketValue).toBe(72);
    expect(summary.holdings[0].unrealizedPnl).toBeCloseTo(10.8);
    expect(summary.realizedPnl).toBeCloseTo(18.2);
  });

  it('rejects invalid transactions, impossible dates, overselling and unsupported currency mixing', () => {
    const base = usdLedger();
    for (const item of [txn('a', 'BUY', '2025-02-30', 1, 10), txn('b', 'BUY', '2025-01-01', 0, 10), txn('c', 'BUY', '2025-01-01', 1, Infinity), txn('d', 'BUY', '2025-01-01', 1, 10, -1)]) {
      expect(() => validateLedger({ ...base, transactions: [item] })).toThrow();
    }
    expect(() => validateLedger({ ...base, transactions: [txn('s', 'SELL', '2025-01-01', 1, 10)] })).toThrow(/exceeds/);
    expect(() => validateLedger({ ...base, config: { baseCurrency: 'INR' }, transactions: [txn('b', 'BUY', '2025-01-01', 1, 10)] })).toThrow(/portfolio uses INR but the instrument is quoted in USD.*Currency conversion is not supported/i);
    expect(currencyMismatchMessage('EUR', 'INR')).toContain('This portfolio uses INR but the instrument is quoted in EUR. Currency conversion is not supported.');
  });

  it('accepts an INR portfolio buying an INR instrument without conversion', () => {
    const instrumentINR = { ...instrument, symbol: 'FORCEMOT', currency: 'INR', exchange: 'NSE', micCode: 'XNSE' };
    const ledger = { ...createEmptyLedger(), config: { baseCurrency: 'INR' }, transactions: [{ ...txn('inr-buy', 'BUY', '2024-06-14', 2, 8300, 20), instrument: instrumentINR }] };
    expect(validateLedger(ledger)).toBe(true);
    expect(derivePortfolio(ledger).holdings[0].costBasis).toBe(16620);
  });

  it('clearly blocks a USD portfolio from recording an INR instrument without FX conversion', () => {
    const instrumentINR = { ...instrument, symbol: 'FORCEMOT', currency: 'INR', exchange: 'NSE', micCode: 'XNSE' };
    const ledger = { ...createEmptyLedger(), config: { baseCurrency: 'USD' }, transactions: [{ ...txn('inr-buy', 'BUY', '2024-06-14', 2, 8300, 20), instrument: instrumentINR }] };
    expect(() => validateLedger(ledger)).toThrow('This portfolio uses USD but the instrument is quoted in INR. Currency conversion is not supported.');
  });

  it('accepts a historical purchase without a quote and keeps execution price separate from current quote', () => {
    const ledger = usdLedger([txn('past-buy', 'BUY', '2023-02-10', 2, 10, 1)]);
    const unavailable = valuePortfolio(ledger);
    expect(unavailable.holdings[0].costBasis).toBe(21);
    expect(unavailable.holdings[0].marketValue).toBeNull();
    const valued = valuePortfolio(ledger, { 'XNYS:ABC': { price: 15, currency: 'USD' } });
    expect(valued.holdings[0].costBasis).toBe(21);
    expect(valued.holdings[0].quote.price).toBe(15);
    expect(valued.holdings[0].marketValue).toBe(30);
  });

  it('does not calculate market value when a quote currency differs from the portfolio base', () => {
    const ledger = usdLedger([txn('b', 'BUY', '2025-01-01', 1, 10)]);
    const value = valuePortfolio(ledger, { 'XNYS:ABC': { price: 12, currency: 'INR' } });
    expect(value.holdings[0].quoteCurrencyMismatch).toBe(true);
    expect(value.holdings[0].marketValue).toBeNull();
    expect(value.marketValue).toBeNull();
  });

  it('does not value a quote with missing currency or merge conflicting identity metadata', () => {
    const ledger = usdLedger([txn('b1', 'BUY', '2025-01-01', 1, 10)]);
    const missingCurrency = valuePortfolio(ledger, { 'XNYS:ABC': { price: 20 } });
    expect(missingCurrency.holdings[0].marketValue).toBeNull();
    const changedIdentity = { ...txn('b2', 'BUY', '2025-01-02', 1, 12), instrument: { ...instrument, name: 'Not Alpha Corp' } };
    expect(() => validateLedger({ ...ledger, transactions: [...ledger.transactions, changedIdentity] })).toThrow(/conflicting instrument identity/);
  });

  it('persists a versioned source-of-truth transaction ledger and handles corrupt data safely', () => {
    const store = new Map();
    const storage = { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
    const ledger = usdLedger([txn('b', 'BUY', '2025-01-01', 1, 10)]);
    expect(writeLedger(ledger, storage)).toBe(true);
    expect(readLedger(storage)).toEqual(ledger);
    store.set('quantara.transaction-ledger.v1', JSON.stringify({ version: 99, transactions: [] }));
    expect(readLedger(storage)).toEqual(createEmptyLedger());
  });
});
