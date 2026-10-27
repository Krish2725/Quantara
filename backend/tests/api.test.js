import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('Quantara API', () => {
  it('reports healthy status', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', database: { configured: false, connected: false } });
  });

  it('exposes market-data setup without requiring a provider key', async () => {
    const response = await fetch(`${baseUrl}/api/market-data/status`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.provider, 'Twelve Data');
    assert.equal(body.configured, false);
    assert.equal(JSON.stringify(body).includes('apiKey'), false);
  });

  it('limits public market-data requests per client', async (t) => {
    const rateLimitServer = createApp({ marketData: { status: () => ({ configured: false }), search: async () => [] } }).listen(0);
    await new Promise((resolve) => rateLimitServer.once('listening', resolve));
    t.after(() => rateLimitServer.close());
    const rateLimitUrl = `http://127.0.0.1:${rateLimitServer.address().port}`;
    let response;
    for (let request = 0; request < 61; request += 1) {
      response = await fetch(`${rateLimitUrl}/api/market-data/search?q=SYMBOL${request}`);
    }
    assert.equal(response.status, 429);
    assert.equal((await response.json()).error.code, 'RATE_LIMITED');
  });

  it('exposes an isolated trial connection check without inventing prices when credentials are missing', async () => {
    const response = await fetch(`${baseUrl}/api/market-data/test-connection`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.instrument.symbol, 'AAPL');
    assert.equal(result.instrument.micCode, 'XNGS');
    assert.equal(result.success, false);
    assert.equal(result.quote, null);
    assert.equal(result.history, null);
    assert.equal(result.errors.quote.code, 'MARKET_DATA_NOT_CONFIGURED');
  });

  it('returns analytics output from the existing package', async () => {
    const response = await fetch(`${baseUrl}/api/portfolio-analysis`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values: [100, 105, 102, 110, 108], riskFreeRate: 0.06, frequency: 'DAILY' }),
    });
    const { analysis } = await response.json();
    assert.equal(response.status, 200);
    assert.equal(analysis.observations, 5);
    assert.ok(Math.abs(analysis.cumulativeReturn - 0.08) < 1e-12);
    assert.ok(Math.abs(analysis.maxDrawdown - (-3 / 105)) < 1e-12);
    assert.ok(Number.isFinite(analysis.sharpeRatio));
    assert.equal(analysis.drawdownDetails.troughIndex, 2);
  });

  it('accepts the 4,107-point daily price series used by Risk Analysis', async () => {
    const values = Array.from({ length: 4107 }, (_, index) => 100 + index * 0.015 + Math.sin(index / 7) * 2);
    const body = JSON.stringify({ values, riskFreeRate: 0.065, frequency: 'DAILY' });
    assert.ok(Buffer.byteLength(body) > 32 * 1024);
    const response = await fetch(`${baseUrl}/api/portfolio-analysis`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    const { analysis } = await response.json();
    assert.equal(response.status, 200);
    assert.equal(analysis.observations, values.length);
    assert.equal(analysis.drawdownDetails.drawdownSeries.length, values.length);
  });

  it('returns a useful bounded-payload error instead of a generic server failure', async () => {
    const response = await fetch(`${baseUrl}/api/portfolio-analysis`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values: [100, 101, 102], padding: 'x'.repeat(520 * 1024) }),
    });
    assert.equal(response.status, 413);
    assert.deepEqual((await response.json()).error, { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 512 KB limit.' });
  });

  it('rejects missing, malformed, and unsupported input with 400', async () => {
    const requests = [
      { body: { values: [100, 101] } },
      { body: { values: [100, '101', 103] } },
      { body: { values: [0, 101, 103] } },
      { body: { values: [100, 101, 102], frequency: 'FORTNIGHTLY' } },
      { body: { values: [100, 101, 102], extra: true } },
    ];
    for (const { body } of requests) {
      const response = await fetch(`${baseUrl}/api/portfolio-analysis`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
    }
  });

  it('reports analytics calculation failures as 422', async () => {
    const response = await fetch(`${baseUrl}/api/portfolio-analysis`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values: [100, 100, 100] }),
    });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'CALCULATION_FAILED');
  });

  it('rejects zero values because the analytics summary requires positive prices', async () => {
    const response = await fetch(`${baseUrl}/api/portfolio-analysis`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ values: [100, 0, 10] }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
  });

  it('constructs dated holdings and returns a date-aligned benchmark comparison', async () => {
    const response = await fetch(`${baseUrl}/api/portfolio-comparison`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        holdings: [
          { assetId: 'AAA', quantity: 2, prices: [
            { date: '2025-01-01', price: 10 }, { date: '2025-01-02', price: 12 },
            { date: '2025-01-03', price: 11 }, { date: '2025-01-04', price: 12 },
          ] },
          { assetId: 'BBB', quantity: 1, prices: [
            { date: '2025-01-01', price: 20 }, { date: '2025-01-02', price: 18 },
            { date: '2025-01-03', price: 19 }, { date: '2025-01-04', price: 19 },
          ] },
        ],
        benchmark: { name: 'Example Index', values: [
          { date: '2025-01-01', value: 100 }, { date: '2025-01-03', value: 99 },
          { date: '2025-01-04', value: 102 },
        ] },
        riskFreeRate: 0,
        frequency: 'DAILY',
      }),
    });
    const { analysis } = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(analysis.portfolio.values, [40, 42, 41, 43]);
    assert.deepEqual(analysis.comparison.alignedDates, ['2025-01-01', '2025-01-03', '2025-01-04']);
    assert.ok(Math.abs(analysis.comparison.cumulativeReturnDifference - 0.055) < 1e-12);
  });

  it('rejects incompatible dated holding series with 400', async () => {
    const response = await fetch(`${baseUrl}/api/portfolio-comparison`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ holdings: [
        { assetId: 'AAA', quantity: 1, prices: [
          { date: '2025-01-01', price: 10 }, { date: '2025-01-02', price: 11 }, { date: '2025-01-03', price: 12 },
        ] },
        { assetId: 'BBB', quantity: 1, prices: [
          { date: '2025-01-01', price: 10 }, { date: '2025-01-03', price: 11 }, { date: '2025-01-04', price: 12 },
        ] },
      ] }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'INVALID_REQUEST');
  });
});
