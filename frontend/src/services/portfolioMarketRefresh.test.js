import { describe, expect, it } from 'vitest';
import { derivePortfolio, deserializePersistedLedger } from '../data/ledger.js';
import { refreshPortfolioMarketData } from './portfolioMarketRefresh.js';

describe('persisted portfolio market refresh', () => {
  it('requests quote and history for legacy Mongo listings after hydration without querying manual instruments', async () => {
    const portfolio = deserializePersistedLedger({
      config: { baseCurrency: 'USD' },
      transactions: [
        { id: 'nvidia', type: 'BUY', date: '2025-01-01', createdAt: '2025-01-01T12:00:00Z', quantity: 1, unitPrice: 100, fees: 0, instrument: { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD' } },
        { id: 'manual', type: 'BUY', date: '2025-01-01', createdAt: '2025-01-01T12:00:00Z', quantity: 1, unitPrice: 50, fees: 0, instrument: { symbol: 'TEST', name: 'Manual Example', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', verification: 'manual' } },
      ],
    });
    const calls = [], quotes = [], histories = [];
    await refreshPortfolioMarketData(derivePortfolio(portfolio).holdings, {
      getQuote: async (instrument) => { calls.push(`quote:${instrument.symbol}`); return { symbol: instrument.symbol, price: 120, currency: 'USD' }; },
      getHistory: async (instrument) => { calls.push(`history:${instrument.symbol}`); return { symbol: instrument.symbol, values: [{ date: '2025-01-01', price: 100 }] }; },
      onQuote: (...args) => quotes.push(args),
      onHistory: (...args) => histories.push(args),
    });
    expect(calls).toEqual(['quote:NVDA', 'history:NVDA']);
    expect(quotes[0][0]).toBe('XNGS:NVDA');
    expect(quotes[0][1].verification).toBe('legacy-unverified');
    expect(histories[0][1].values).toHaveLength(1);
  });

  it('reports quote and history failures independently', async () => {
    const failures = [];
    await refreshPortfolioMarketData([{ quantity: 1, instrument: { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', verification: 'legacy-unverified' } }], {
      getQuote: async () => { throw new Error('Provider plan denied quote'); },
      getHistory: async () => { throw new Error('Daily history unavailable'); },
      onError: (...args) => failures.push(args),
    });
    expect(failures.map(([, type, error]) => [type, error.message])).toEqual([
      ['quote', 'Provider plan denied quote'], ['history', 'Daily history unavailable'],
    ]);
  });
});
