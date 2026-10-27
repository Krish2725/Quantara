import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createMarketDataService, MarketDataError } from '../src/marketData.js';

function response(data, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

describe('Twelve Data market-data service', () => {
  it('reports configuration without exposing the key and fails clearly when it is missing', async () => {
    let calls = 0;
    const service = createMarketDataService({ apiKey: '', fetchImpl: async () => { calls++; } });
    assert.deepEqual(service.status(), { configured: false, provider: 'Twelve Data', setupMessage: 'Set TWELVE_DATA_API_KEY in backend/.env and restart the API. Demo mode and transaction entry remain available.' });
    await assert.rejects(service.search('Apple'), (error) => error instanceof MarketDataError && error.code === 'MARKET_DATA_NOT_CONFIGURED');
    assert.equal(calls, 0);
  });

  it('keeps the Basic connection check truthful when credentials are missing', async () => {
    const service = createMarketDataService({ apiKey: '', fetchImpl: async () => { throw new Error('should not call provider'); } });
    const result = await service.testConnection();
    assert.equal(result.instrument.symbol, 'AAPL');
    assert.equal(result.instrument.micCode, 'XNGS');
    assert.equal(result.success, false);
    assert.equal(result.quote, null);
    assert.equal(result.history, null);
    assert.equal(result.errors.quote.code, 'MARKET_DATA_NOT_CONFIGURED');
    assert.equal(result.errors.history.code, 'MARKET_DATA_NOT_CONFIGURED');
  });

  it('tests the verified AAPL Basic trial symbol quote and daily history', async () => {
    const requests = [];
    const service = createMarketDataService({ apiKey: 'test-key', fetchImpl: async (url) => {
      const parsed = new URL(url); requests.push(parsed);
      if (parsed.pathname.endsWith('/quote')) return response({ symbol: 'AAPL', exchange: 'NASDAQ', mic_code: 'XNGS', currency: 'USD', close: '342.6', last_quote_at: 1793036880 });
      return response({ meta: { symbol: 'AAPL', exchange: 'NASDAQ', mic_code: 'XNGS', currency: 'USD' }, values: [{ datetime: '2026-10-24', close: '340' }, { datetime: '2026-10-27', close: '342.6' }] });
    } });
    const result = await service.testConnection();
    assert.equal(result.success, true);
    assert.equal(result.quote.price, 342.6);
    assert.equal(result.quote.currency, 'USD');
    assert.equal(result.history.values.length, 2);
    assert.equal(requests[0].searchParams.get('symbol'), 'AAPL');
    assert.equal(requests[0].searchParams.get('mic_code'), 'XNGS');
    assert.equal(requests[1].pathname, '/time_series');
  });

  it('parses instrument search, quote timestamps and exchange daily history', async () => {
    const seen = [];
    const service = createMarketDataService({ apiKey: 'test-secret', fetchImpl: async (url) => {
      seen.push(new URL(url));
      if (String(url).includes('/symbol_search')) return response({ data: [{ symbol: 'AAPL', instrument_name: 'Apple Inc', exchange: 'NASDAQ', mic_code: 'XNAS', currency: 'USD', country: 'United States', instrument_type: 'Common Stock', access: { global: 'Basic' } }] });
      if (String(url).includes('/quote')) return response({ symbol: 'AAPL', name: 'Apple Inc', exchange: 'NASDAQ', mic_code: 'XNAS', currency: 'USD', close: '190.25', previous_close: '189.50', last_quote_at: 1735812000, is_market_open: false });
      return response({ meta: { symbol: 'AAPL', exchange: 'NASDAQ', mic_code: 'XNAS', currency: 'USD' }, values: [{ datetime: '2025-01-02', close: '101' }, { datetime: '2025-01-01', close: '100' }] });
    } });
    const [instrument] = await service.search('Apple');
    assert.equal(instrument.micCode, 'XNAS');
    assert.equal(instrument.verification, 'provider-search');
    const quote = await service.quote(instrument);
    assert.deepEqual({ price: quote.price, previousClose: quote.previousClose, isMarketOpen: quote.isMarketOpen, currency: quote.currency }, { price: 190.25, previousClose: 189.5, isMarketOpen: false, currency: 'USD' });
    assert.equal(quote.quoteTimestamp, new Date(1735812000 * 1000).toISOString());
    const history = await service.history(instrument);
    assert.deepEqual(history.values, [{ date: '2025-01-01', price: 100 }, { date: '2025-01-02', price: 101 }]);
    assert.equal(history.adjustment, 'splits');
    assert.equal(seen[0].searchParams.get('apikey'), 'test-secret');
    assert.equal(seen[1].searchParams.get('mic_code'), 'XNAS');
  });

  it('caches quote data, deduplicates simultaneous requests and maps provider errors', async () => {
    let calls = 0;
    let clock = 1000;
    const service = createMarketDataService({ apiKey: 'test-key', now: () => clock, fetchImpl: async () => { calls++; return response({ close: '25', symbol: 'ABC', exchange: 'NYSE', mic_code: 'XNYS', currency: 'USD', is_market_open: true }); } });
    const instrument = { symbol: 'ABC', micCode: 'XNYS' };
    const [one, two] = await Promise.all([service.quote(instrument), service.quote(instrument)]);
    assert.equal(one.price, two.price);
    assert.equal(calls, 1);
    await service.quote(instrument);
    assert.equal(calls, 1);
    clock += 60_001;
    await service.quote(instrument);
    assert.equal(calls, 2);

    const denied = createMarketDataService({ apiKey: 'test-key', fetchImpl: async () => response({ code: 403, message: 'Invalid API key test-key' }) });
    await assert.rejects(denied.quote(instrument), (error) => error.code === 'PROVIDER_INVALID_CREDENTIALS' && !error.message.includes('test-key'));
    const limited = createMarketDataService({ apiKey: 'test-key', fetchImpl: async () => response({ code: 429, message: 'limit' }, false, 429) });
    await assert.rejects(limited.search('ABC'), (error) => error.status === 429 && error.code === 'PROVIDER_RATE_LIMIT');
  });

  it('preserves specific provider plan, instrument, and missing-quote diagnostics', async () => {
    const instrument = { symbol: 'FORCEMOT', micCode: 'XNSE' };
    const planRequired = createMarketDataService({ apiKey: 'test-key', fetchImpl: async () => response({ status: 'error', code: 404, message: 'This symbol is available starting with the Grow or Venture plan.' }) });
    await assert.rejects(planRequired.quote(instrument), (error) => error.code === 'PROVIDER_PLAN_REQUIRED' && error.message === 'This symbol is available starting with the Grow or Venture plan.');
    const unsupported = createMarketDataService({ apiKey: 'test-key', fetchImpl: async () => response({ status: 'error', code: 404, message: 'Symbol not found on this exchange.' }) });
    await assert.rejects(unsupported.quote(instrument), (error) => error.code === 'INSTRUMENT_UNAVAILABLE' && error.message === 'Symbol not found on this exchange.');
    const noQuote = createMarketDataService({ apiKey: 'test-key', fetchImpl: async () => response({ status: 'error', code: 404, message: 'No quote data available for this symbol.' }) });
    await assert.rejects(noQuote.quote(instrument), (error) => error.code === 'QUOTE_DATA_UNAVAILABLE' && error.message === 'No quote data available for this symbol.');
  });

  it('reports unavailable historical data without inventing a series', async () => {
    const service = createMarketDataService({ apiKey: 'test-key', fetchImpl: async () => response({ status: 'error', code: 404, message: 'No data available for the requested time series.' }) });
    await assert.rejects(service.history({ symbol: 'AAPL', micCode: 'XNGS' }), (error) => error.code === 'QUOTE_DATA_UNAVAILABLE');
  });

  it('searches and requests Force Motors using the returned exchange symbol and MIC', async () => {
    const requests = [];
    const service = createMarketDataService({ apiKey: 'test-key', fetchImpl: async (url) => {
      const parsed = new URL(url); requests.push(parsed);
      if (parsed.pathname.endsWith('/symbol_search')) return response({ data: [{ symbol: 'FORCEMOT', instrument_name: 'Force Motors Ltd.', exchange: 'NSE', mic_code: 'XNSE', currency: 'INR' }] });
      return response({ status: 'error', code: 404, message: 'This symbol is available starting with the Grow or Venture plan.' });
    } });
    const [found] = await service.search('Force Motors');
    assert.deepEqual({ symbol: found.symbol, exchange: found.exchange, micCode: found.micCode, currency: found.currency }, { symbol: 'FORCEMOT', exchange: 'NSE', micCode: 'XNSE', currency: 'INR' });
    await assert.rejects(service.quote(found), (error) => error.code === 'PROVIDER_PLAN_REQUIRED');
    assert.equal(requests[1].searchParams.get('symbol'), 'FORCEMOT');
    assert.equal(requests[1].searchParams.get('mic_code'), 'XNSE');
  });

  it('rejects an instrument without an exchange MIC and invalid provider quotes', async () => {
    const service = createMarketDataService({ apiKey: 'test-key', fetchImpl: async () => response({ symbol: 'ABC', exchange: 'NYSE', mic_code: 'XNYS', currency: 'USD', close: 'NaN' }) });
    await assert.rejects(service.quote({ symbol: 'ABC', micCode: '' }), /exchange result/);
    await assert.rejects(service.quote({ symbol: 'ABC', micCode: 'XNYS' }), (error) => error.code === 'INVALID_PROVIDER_RESPONSE');
  });

  it('rejects provider quote and history metadata that identify a different listing', async () => {
    const instrument = { symbol: 'GOOGM', micCode: 'XNGS', currency: 'USD' };
    const wrongQuote = createMarketDataService({ apiKey: 'test-key', fetchImpl: async () => response({ symbol: 'GOOGM', exchange: 'IEX', mic_code: 'IEXG', currency: 'USD', close: '45.88' }) });
    await assert.rejects(wrongQuote.quote(instrument), (error) => error.code === 'PROVIDER_IDENTITY_MISMATCH');
    const wrongHistory = createMarketDataService({ apiKey: 'test-key', fetchImpl: async () => response({ meta: { symbol: 'GOOGM', exchange: 'IEX', mic_code: 'IEXG', currency: 'USD' }, values: [{ datetime: '2025-01-02', close: '10' }] }) });
    await assert.rejects(wrongHistory.history(instrument), (error) => error.code === 'PROVIDER_IDENTITY_MISMATCH');
  });

  it('rejects impossible dates in provider history', async () => {
    const service = createMarketDataService({ apiKey: 'test-key', fetchImpl: async () => response({ meta: { symbol: 'AAPL', exchange: 'NASDAQ', mic_code: 'XNGS', currency: 'USD' }, values: [{ datetime: '2025-02-30', close: '10' }] }) });
    await assert.rejects(service.history({ symbol: 'AAPL', micCode: 'XNGS', currency: 'USD' }), (error) => error.code === 'INVALID_PROVIDER_RESPONSE');
  });
});
