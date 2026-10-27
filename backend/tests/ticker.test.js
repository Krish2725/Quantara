import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyChangePercent, createTickerService, getTickerWatchlist, DEFAULT_TICKER_REFRESH_MS } from '../src/ticker.js';

test('daily change requires real finite positive quote and previous close', () => {
  assert.equal(dailyChangePercent(110, 100), 10);
  assert.equal(dailyChangePercent(90, 100), -10);
  assert.equal(dailyChangePercent(100, 100), 0);
  assert.equal(dailyChangePercent(10, null), null);
  assert.equal(dailyChangePercent(10, 0), null);
});

test('watchlist is configurable and limited to maintained listing identities', () => {
  assert.deepEqual(getTickerWatchlist('NVDA,AAPL,NVDA,NOPE').map((item) => item.symbol), ['NVDA', 'AAPL']);
  const defaults = getTickerWatchlist();
  assert.equal(defaults.length, 30);
  assert.equal(new Set(defaults.map((item) => item.symbol)).size, 30);
  assert.deepEqual(defaults.find((item) => item.symbol === 'WMT'), {
    symbol: 'WMT', name: 'Walmart Inc.', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', sector: 'Consumer Staples',
  });
  assert.equal(getTickerWatchlist('WMT')[0].micCode, 'XNGS');
  assert.ok(defaults.every((item) => item.name && item.exchange && /^[A-Z0-9]{4}$/.test(item.micCode) && item.currency === 'USD'));
  assert.ok(defaults.some((item) => item.sector === 'Industrials' && item.symbol === 'CAT'));
  for (const sector of ['Technology', 'Financials', 'Health Care', 'Consumer Staples', 'Energy', 'Industrials']) assert.ok(defaults.some((item) => item.sector === sector));
});

test('default ticker cadence targets a full 30-symbol pass in about 15 minutes', () => {
  assert.equal(DEFAULT_TICKER_REFRESH_MS, 110_000);
  assert.equal(Math.ceil(30 / 4) * DEFAULT_TICKER_REFRESH_MS, 14 * 60_000 + 40_000);
});

test('ticker caches quotes, deduplicates overlapping requests, and retains stale quote after failure', async () => {
  let now = 1000, attempts = 0, fail = false, resolveQuote;
  const marketData = { status: () => ({ configured: true }), quote: async () => { attempts++; if (fail) throw Object.assign(new Error('offline'), { code: 'PROVIDER_UNAVAILABLE' }); return new Promise((resolve) => { resolveQuote = resolve; }); } };
  const ticker = createTickerService({ marketData, now: () => now, intervalMs: 1000, retryAfterMs: 0, watchlist: [{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD' }] });
  const a = ticker(), b = ticker();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 1);
  resolveQuote({ symbol: 'AAPL', price: 110, previousClose: 100, currency: 'USD' });
  assert.equal((await a).items[0].dailyChangePercent, 10);
  await b;
  assert.equal((await ticker()).stale, false);
  now += 1001; fail = true;
  const stale = await ticker();
  assert.equal(stale.stale, true);
  assert.equal(stale.items[0].price, 110);
});

test('ticker returns multiple independent quotes, preserves missing change and isolates rate limits', async () => {
  const requests = [];
  const marketData = {
    status: () => ({ configured: true }),
    quote: async (instrument) => {
      requests.push(instrument.symbol);
      if (instrument.symbol === 'NVDA') throw Object.assign(new Error('Twelve Data rate limit reached'), { code: 'PROVIDER_RATE_LIMIT' });
      return { symbol: instrument.symbol, name: instrument.name, exchange: instrument.exchange, micCode: instrument.micCode, currency: instrument.currency, price: 100, previousClose: instrument.symbol === 'AAPL' ? 95 : null, quoteTimestamp: '2026-10-26T19:59:00.000Z', isMarketOpen: false };
    },
  };
  const watchlist = getTickerWatchlist('AAPL,NVDA,AMZN');
  const ticker = createTickerService({ marketData, now: () => 1000, intervalMs: 90_000, watchlist });
  const data = await ticker();
  assert.deepEqual(data.items.map((item) => item.symbol), ['AAPL', 'NVDA', 'AMZN']);
  assert.equal(data.items[0].dailyChangePercent, ((100 - 95) / 95) * 100);
  assert.equal(data.items[0].isMarketOpen, false);
  assert.equal(data.items[1].error.code, 'PROVIDER_RATE_LIMIT');
  assert.equal(data.items[1].price, null);
  assert.equal(data.items[2].dailyChangePercent, null);
  assert.deepEqual(await ticker(), data);
  assert.equal(requests.length, 3);
});

test('initially fetches the full watchlist, then rotates at most four quote requests per refresh', async () => {
  const requested = [];
  const marketData = { status: () => ({ configured: true }), quote: async (instrument) => {
    requested.push(instrument.symbol);
    return { symbol: instrument.symbol, price: 101, previousClose: 100, quoteTimestamp: '2026-10-26T20:00:00Z' };
  } };
  let now = 100_000;
  const ticker = createTickerService({ marketData, now: () => now, intervalMs: 60_000, retryAfterMs: 0 });
  const first = await ticker();
  assert.equal(requested.length, 30);
  assert.equal(first.items.length, 30);
  assert.equal(first.items.filter((item) => item.quoteState === 'available').length, 30);
  assert.equal(first.items.filter((item) => item.quoteState === 'pending').length, 0);
  assert.equal(first.items[0].dailyChange, 1);
  now += 60_001;
  const second = await ticker();
  assert.equal(requested.length, 34);
  assert.equal(second.items.filter((item) => item.quoteState === 'available').length, 30);
  assert.equal(new Set(requested.slice(30)).size, 4);
});
