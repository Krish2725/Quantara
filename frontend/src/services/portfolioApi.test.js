import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzePortfolio, getInstrumentHistory, getInstrumentQuote, getPersistedPortfolio, importPersistedTransactions, PortfolioApiError, savePersistedPortfolio, testLiveDataConnection } from './portfolioApi.js';
import { samplePortfolioRequest } from '../data/samplePortfolio.js';
import { deserializePersistedLedger, derivePortfolio, valuePortfolio } from '../data/ledger.js';

const sampleResponse = {
  portfolio: {
    values: [3274, 3320, 3377],
    dates: ['2025-01-06', '2025-01-07', '2025-01-08'],
    performance: {},
    allocations: [],
    holdingContributions: [],
  },
  benchmark: {
    name: 'Illustrative benchmark',
    alignedDates: ['2025-01-06', '2025-01-07', '2025-01-08'],
    alignedValues: [100, 100.8, 100.2],
    performance: {},
  },
  comparison: { alignedDates: ['2025-01-06', '2025-01-07', '2025-01-08'] },
};

afterEach(() => vi.unstubAllGlobals());

describe('portfolio API service', () => {
  it('retrieves a current quote as a separate provider value with price, currency and timestamp', async () => {
    const quote = { symbol: 'FORCEMOT', micCode: 'XNSE', price: 8300, currency: 'INR', quoteTimestamp: '2025-03-04T10:00:00.000Z', source: 'Twelve Data' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ quote }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getInstrumentQuote({ symbol: 'FORCEMOT', micCode: 'XNSE', currency: 'INR' })).resolves.toEqual(quote);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/market-data/quote?');
    expect(fetchMock.mock.calls[0][0]).toContain('micCode=XNSE');
    expect(fetchMock.mock.calls[0][0]).toContain('currency=INR');
  });

  it('rejects a successful HTTP quote that belongs to a different exchange listing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ quote: { symbol: 'GOOGM', micCode: 'IEXG', price: 45.88, currency: 'USD' } }) }));
    await expect(getInstrumentQuote({ symbol: 'GOOGM', micCode: 'XNGS', currency: 'USD' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('validates historical listing metadata and currency', async () => {
    const history = { symbol: 'AAPL', micCode: 'XNGS', currency: 'USD', values: [{ date: '2025-01-01', price: 100 }] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ history }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getInstrumentHistory({ symbol: 'AAPL', micCode: 'XNGS', currency: 'USD' })).resolves.toEqual(history);
    expect(fetchMock.mock.calls[0][0]).toContain('currency=USD');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ history: { ...history, currency: 'INR' } }) }));
    await expect(getInstrumentHistory({ symbol: 'AAPL', micCode: 'XNGS', currency: 'USD' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('surfaces provider quote failures without turning them into a price', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 503, json: async () => ({ error: { code: 'PROVIDER_ACCESS_DENIED', message: 'Provider plan does not include this exchange.' } }),
    }));
    await expect(getInstrumentQuote({ symbol: 'FORCEMOT', micCode: 'XNSE' })).rejects.toMatchObject({
      kind: 'server', status: 503, code: 'PROVIDER_ACCESS_DENIED', message: 'Provider plan does not include this exchange.',
    });
  });

  it('returns the isolated AAPL trial-symbol connection test without changing any portfolio input', async () => {
    const result = { instrument: { symbol: 'AAPL', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD' }, success: true, quote: { price: 342.6, currency: 'USD' }, history: { values: [{ date: '2026-10-26', price: 342.6 }] }, errors: { quote: null, history: null } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => result });
    vi.stubGlobal('fetch', fetchMock);
    await expect(testLiveDataConnection()).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith('/api/market-data/test-connection');
  });

  it('posts the backend request schema and returns its analysis object', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ analysis: sampleResponse }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const analysis = await analyzePortfolio(samplePortfolioRequest);

    expect(fetchMock).toHaveBeenCalledWith('/api/portfolio-comparison', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePortfolioRequest),
    }));
    expect(analysis).toEqual(sampleResponse);
  });

  it('posts a confirmed investment batch with credentials and requires persisted portfolio confirmation', async () => {
    const saved = { config: { baseCurrency: 'USD' }, transactions: [{ id: 'import-id-1', type: 'BUY', source: 'import' }] };
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).endsWith('/api/auth/csrf')) return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-transaction-import' }) };
      return { ok: true, status: 200, json: async () => ({ portfolio: saved, import: { duplicate: false, rowCount: 1, dateRange: '2026-09-07–2026-09-07', symbols: ['NVDA'] } }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const body = { importId: 'ec8a22db-1a1c-4c3a-a8b9-111111111111', baseCurrency: 'USD', transactions: [{ rowNumber: 2, date: '2026-09-07', symbol: 'NVDA', type: 'BUY', quantity: 10, unitPrice: 150, fees: 1 }] };
    await expect(importPersistedTransactions(body)).resolves.toMatchObject({ portfolio: saved, import: { rowCount: 1 } });
    const request = fetchMock.mock.calls.find(([, options]) => options.method === 'POST');
    expect(request[0]).toContain('/api/portfolio/import-transactions');
    expect(request[1]).toMatchObject({ credentials: 'include', headers: expect.objectContaining({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ import: { rowCount: 1 } }) }));
    await expect(importPersistedTransactions(body)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('keeps legacy uploaded price history inert and derives holdings only from persisted transactions', async () => {
    const instrument = { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD' };
    const legacyHistory = { 'XNGS:NVDA': { values: [{ date: '2026-09-01', price: 180 }], source: 'legacy upload' } };
    const portfolio = { config: { baseCurrency: 'USD', importedHistory: legacyHistory }, transactions: [
      { id: 'saved-tsla', type: 'BUY', date: '2023-10-27', createdAt: '2023-10-27T10:00:00Z', instrument, quantity: 100, unitPrice: 219, fees: 0 },
    ] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ portfolio }) }));
    const ledger = deserializePersistedLedger((await getPersistedPortfolio()).portfolio);
    expect(ledger.config.importedHistory).toEqual(legacyHistory);
    expect(derivePortfolio(ledger).holdings.map((holding) => holding.instrument.symbol)).toEqual(['TSLA']);
    expect(valuePortfolio(ledger).holdings[0].marketValue).toBeNull();
  });

  it('rehydrates imported transactions through the existing weighted-average and realized P/L accounting', async () => {
    const instrument = { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', verification: 'provider-search' };
    const portfolio = { config: { baseCurrency: 'USD' }, transactions: [
      { id: 'import:batch:1', type: 'BUY', date: '2026-09-07', createdAt: '2026-09-07T10:00:00.000Z', instrument, quantity: 10, unitPrice: 150, fees: 1, source: 'import', importBatchId: 'batch', importRowNumber: 2 },
      { id: 'import:batch:2', type: 'BUY', date: '2026-09-10', createdAt: '2026-09-10T10:00:00.000Z', instrument, quantity: 5, unitPrice: 155, fees: 1, source: 'import', importBatchId: 'batch', importRowNumber: 3 },
      { id: 'import:batch:3', type: 'SELL', date: '2026-09-15', createdAt: '2026-09-15T10:00:00.000Z', instrument, quantity: 3, unitPrice: 165, fees: 1, source: 'import', importBatchId: 'batch', importRowNumber: 4 },
    ] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ portfolio }) }));
    const reloaded = deserializePersistedLedger((await getPersistedPortfolio()).portfolio);
    const calculated = derivePortfolio(reloaded);
    expect(calculated.holdings[0].quantity).toBe(12);
    expect(calculated.holdings[0].costBasis).toBeCloseTo(1821.6);
    expect(calculated.holdings[0].averageCost).toBeCloseTo(151.8);
    expect(calculated.transactions.find((transaction) => transaction.type === 'SELL').realizedPnl).toBeCloseTo(38.6);
    expect(calculated.realizedPnl).toBeCloseTo(38.6);
  });

  it('classifies backend validation responses separately from server failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: { code: 'INVALID_REQUEST', message: 'holdings are invalid' } }),
    }));
    await expect(analyzePortfolio(samplePortfolioRequest)).rejects.toMatchObject({
      name: 'PortfolioApiError', kind: 'validation', status: 400, code: 'INVALID_REQUEST',
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'safe server message' } }),
    }));
    await expect(analyzePortfolio(samplePortfolioRequest)).rejects.toMatchObject({
      name: 'PortfolioApiError', kind: 'server', status: 500, code: 'INTERNAL_ERROR',
    });
  });

  it('surfaces network failures and rejects malformed success payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(analyzePortfolio(samplePortfolioRequest)).rejects.toBeInstanceOf(PortfolioApiError);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ analysis: {} }),
    }));
    await expect(analyzePortfolio(samplePortfolioRequest)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
