import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

test('portfolio API requires authenticated ownership and scopes full-ledger updates per user', async (t) => {
  const entries = new Map();
  const app = createApp({ marketData: { status: () => ({ configured: false }) }, portfolioStore: {
    read: async (key) => entries.get(key) || null,
    save: async (key, body) => { entries.set(key, { ...body, updatedAt: new Date().toISOString() }); return entries.get(key); },
  }, ticker: async () => ({ items: [] }), users: { exists: async ({ _id }) => _id ? { _id } : null }, dbStatus: () => ({ configured: true, connected: true }), sessionMiddleware: (req, _res, next) => { req.session = { userId: req.get('X-Test-User') || '', csrfToken: 'test-token' }; next(); } });
  const server = app.listen(0); t.after(() => server.close());
  const root = `http://127.0.0.1:${server.address().port}`;
  const bad = await fetch(`${root}/api/portfolio`);
  assert.equal(bad.status, 401);
  const userA = 'user-a';
  const importedHistory = {
    'XNGS:AAPL': { values: [{ date: '2026-01-02', price: 11 }, { date: '2026-01-03', price: 12 }], source: 'User-supplied historical CSV data (not live market data)' },
    'XNAS:NVDA': { instrument: { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNAS', currency: 'USD', type: 'Common Stock', verification: 'provider-search' }, values: [{ date: '2026-01-02', price: 180 }], source: 'User-supplied historical CSV data (not live market data)' },
  };
  const body = { config: { baseCurrency: 'USD', importedHistory, historyPreferences: { 'XNGS:AAPL': 'imported', 'XNAS:NVDA': 'imported' } }, transactions: [{ id: 't1', type: 'BUY', date: '2026-01-01', createdAt: '2026-01-01T10:00:00Z', instrument: { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', verification: 'provider-search' }, quantity: 2, unitPrice: 10, fees: 1 }] };
  const put = () => fetch(`${root}/api/portfolio`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Test-User': userA, 'X-CSRF-Token': 'test-token' }, body: JSON.stringify(body) });
  assert.equal((await put()).status, 200);
  assert.equal((await put()).status, 200);
  const get = await fetch(`${root}/api/portfolio`, { headers: { 'X-Test-User': userA } });
  const loadedA = (await get.json()).portfolio;
  assert.equal(loadedA.transactions.length, 1);
  assert.deepEqual(loadedA.transactions, body.transactions, 'price-history import leaves the BUY/SELL ledger untouched');
  assert.deepEqual(loadedA.config.importedHistory, importedHistory);
  assert.equal(loadedA.config.historyPreferences['XNGS:AAPL'], 'imported');
  assert.deepEqual(loadedA.summary.openHoldings.map((holding) => holding.instrument.symbol), ['AAPL']);
  assert.equal(loadedA.summary.openHoldings[0].quantity, 2);
  const userB = await fetch(`${root}/api/portfolio`, { headers: { 'X-Test-User': 'user-b' } });
  assert.equal((await userB.json()).portfolio, null);
  const badHistory = { ...body, config: { ...body.config, importedHistory: { 'XNGS:AAPL': { values: [{ date: '2026-01-03', price: 12 }, { date: '2026-01-03', price: 13 }] } } } };
  const rejectedHistory = await fetch(`${root}/api/portfolio`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Test-User': userA, 'X-CSRF-Token': 'test-token' }, body: JSON.stringify(badHistory) });
  assert.equal(rejectedHistory.status, 200, 'legacy price rows are preserved as opaque config and do not participate in portfolio validation');
  const stillSaved = await fetch(`${root}/api/portfolio`, { headers: { 'X-Test-User': userA } });
  const stillSavedBody = await stillSaved.json();
  assert.deepEqual(stillSavedBody.portfolio.config.importedHistory, badHistory.config.importedHistory);
  assert.deepEqual(stillSavedBody.portfolio.summary.openHoldings.map((holding) => holding.instrument.symbol), ['AAPL']);
  const bodyB = { config: { baseCurrency: 'USD' }, transactions: body.transactions };
  await fetch(`${root}/api/portfolio`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Test-User': 'user-b', 'X-CSRF-Token': 'test-token' }, body: JSON.stringify(bodyB) });
  await fetch(`${root}/api/portfolio`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Test-User': userA, 'X-CSRF-Token': 'test-token' }, body: JSON.stringify({ config: body.config, transactions: [{ ...body.transactions[0], quantity: 3 }] }) });
  const stillPrivate = await fetch(`${root}/api/portfolio`, { headers: { 'X-Test-User': 'user-b' } });
  assert.equal((await stillPrivate.json()).portfolio.transactions[0].quantity, 2);
  assert.equal((await (await fetch(`${root}/api/portfolio`, { headers: { 'X-Test-User': 'user-b' } })).json()).portfolio.config.importedHistory, undefined);
  const forged = await fetch(`${root}/api/portfolio`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Test-User': userA, 'X-CSRF-Token': 'test-token' }, body: JSON.stringify({ ...body, userId: 'user-b' }) });
  assert.equal(forged.status, 400);
  const invalid = await fetch(`${root}/api/portfolio`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Test-User': userA, 'X-CSRF-Token': 'test-token' }, body: JSON.stringify({ config: { baseCurrency: 'USD' }, transactions: [{ ...body.transactions[0], type: 'SELL', quantity: 5 }] }) });
  assert.equal(invalid.status, 400);
});
