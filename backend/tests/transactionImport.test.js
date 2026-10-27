import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { validatePortfolio } from '../src/persistence.js';

const userA = 'user-a';
const tsla = { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', verification: 'provider-search' };
const nvda = { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', type: 'Common Stock', verification: 'provider-search' };
const aapl = { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', type: 'Common Stock', verification: 'provider-search' };
const initial = { config: { baseCurrency: 'USD', importedHistory: { 'XNGS:TSLA': { values: [{ date: '2026-09-01', price: 200 }] } } }, transactions: [
  { id: 'manual-tsla', type: 'BUY', date: '2023-10-27', createdAt: '2023-10-27T10:00:00Z', instrument: tsla, quantity: 100, unitPrice: 219, fees: 0 },
] };
function store() {
  const portfolios = new Map([[userA, { ...structuredClone(initial), importBatches: {}, revision: 1 }]]);
  return {
    portfolios,
    async read(userId) { return portfolios.get(userId) || null; },
    async save(userId, body) { const prior = portfolios.get(userId); const next = { ...(prior || {}), ...structuredClone(body) }; portfolios.set(userId, next); return next; },
    async importTransactions(userId, payload) {
      const prior = portfolios.get(userId) || { config: payload.config, transactions: [], importBatches: {}, revision: 0 };
      const batch = prior.importBatches[payload.importId];
      if (batch) {
        if (batch.hash !== payload.hash) throw Object.assign(new Error('Import identifier conflict.'), { status: 409, code: 'IMPORT_ID_REUSED' });
        return { portfolio: prior, duplicate: true, batch };
      }
      const transactions = [...prior.transactions, ...structuredClone(payload.transactions)];
      validatePortfolio({ config: prior.config, transactions });
      const storedBatch = { hash: payload.hash, rowCount: transactions.length - prior.transactions.length, dateRange: payload.summary.dateRange, symbols: payload.summary.symbols };
      const next = { ...prior, transactions, importBatches: { ...prior.importBatches, [payload.importId]: storedBatch }, revision: prior.revision + 1 };
      portfolios.set(userId, next);
      return { portfolio: next, duplicate: false, batch: storedBatch };
    },
  };
}
function fixture() {
  const db = store();
  const marketData = {
    status: () => ({ configured: true }),
    async search(symbol) { return ({ NVDA: [nvda], AAPL: [aapl], BAD: [] })[symbol] || []; },
  };
  const app = createApp({ marketData, portfolioStore: db, ticker: async () => ({ items: [] }),
    users: { exists: async ({ _id }) => _id ? { _id } : null }, dbStatus: () => ({ configured: true, connected: true }),
    sessionMiddleware: (req, _res, next) => { req.session = { userId: req.get('X-Test-User') || '', csrfToken: 'test-token' }; next(); } });
  const server = app.listen(0);
  return { db, server, root: `http://127.0.0.1:${server.address().port}` };
}
function batch(importId, transactions) { return { importId, baseCurrency: 'USD', transactions }; }
const row = (rowNumber, date, symbol, type, quantity, unitPrice, fees = 0, instrument = null) => ({ rowNumber, date, symbol, type, quantity, unitPrice, fees, ...(instrument ? { instrument } : {}) });
async function send(root, body, user = userA) {
  return fetch(`${root}/api/portfolio/import-transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Test-User': user, 'X-CSRF-Token': 'test-token' }, body: JSON.stringify(body) });
}

test('authenticated import creates BUY/SELL records through ledger rules, preserves old TSLA/history, and retries idempotently', async (t) => {
  const { db, server, root } = fixture(); t.after(() => server.close());
  const importId = 'ec8a22db-1a1c-4c3a-a8b9-111111111111';
  const input = batch(importId, [
    row(2, '2026-09-07', 'NVDA', 'BUY', 10, 150, 1, nvda),
    row(3, '2026-09-10', 'NVDA', 'BUY', 5, 155, 1, nvda),
    row(4, '2026-09-15', 'NVDA', 'SELL', 3, 165, 1, nvda),
    row(5, '2026-09-08', 'AAPL', 'BUY', 4, 230, 0.5, aapl),
  ]);
  const response = await send(root, input);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(saved.import, { duplicate: false, rowCount: 4, dateRange: '2026-09-07–2026-09-15', symbols: ['AAPL', 'NVDA'] });
  assert.equal(saved.portfolio.transactions.length, 5);
  assert.equal(saved.portfolio.transactions[0].id, 'manual-tsla');
  assert.equal(saved.portfolio.transactions.find((tx) => tx.type === 'SELL').fees, 1);
  assert.equal(saved.portfolio.config.importedHistory['XNGS:TSLA'].values[0].price, 200);
  assert.deepEqual(saved.portfolio.summary.openHoldings.map((holding) => holding.instrument.symbol).sort(), ['AAPL', 'NVDA', 'TSLA']);
  assert.equal(saved.portfolio.summary.openHoldings.find((holding) => holding.instrument.symbol === 'NVDA').quantity, 12);
  assert.ok(Math.abs(saved.portfolio.summary.openHoldings.find((holding) => holding.instrument.symbol === 'NVDA').costBasis - 1821.6) < 1e-8);
  assert.ok(Math.abs(saved.portfolio.summary.realizedPnl - 38.6) < 1e-8);
  const retry = await send(root, input);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).import.duplicate, true);
  assert.equal(db.portfolios.get(userA).transactions.length, 5);
  assert.equal((await (await fetch(`${root}/api/portfolio`, { headers: { 'X-Test-User': 'user-b' } })).json()).portfolio, null);
});

test('chronological SELL validation rejects oversells and sell-before-buy without partial writes', async (t) => {
  const { db, server, root } = fixture(); t.after(() => server.close());
  const before = structuredClone(db.portfolios.get(userA));
  const oversell = batch('ec8a22db-1a1c-4c3a-a8b9-222222222222', [row(2, '2026-09-01', 'NVDA', 'BUY', 2, 100, 0, nvda), row(3, '2026-09-02', 'NVDA', 'SELL', 3, 110, 0, nvda)]);
  assert.equal((await send(root, oversell)).status, 400);
  const sellFirst = batch('ec8a22db-1a1c-4c3a-a8b9-333333333333', [row(2, '2026-09-01', 'NVDA', 'SELL', 1, 110, 0, nvda), row(3, '2026-09-02', 'NVDA', 'BUY', 2, 100, 0, nvda)]);
  assert.equal((await send(root, sellFirst)).status, 400);
  assert.deepEqual(db.portfolios.get(userA), before);
});

test('unknown symbols and malformed values are rejected atomically; IDs cannot replay altered content', async (t) => {
  const { db, server, root } = fixture(); t.after(() => server.close());
  const before = structuredClone(db.portfolios.get(userA));
  const badSymbol = batch('ec8a22db-1a1c-4c3a-a8b9-444444444444', [row(2, '2026-09-01', 'BAD', 'BUY', 1, 10, 0, { ...nvda, symbol: 'BAD' })]);
  assert.equal((await send(root, badSymbol)).status, 400);
  const badPrice = batch('ec8a22db-1a1c-4c3a-a8b9-555555555555', [row(2, '2026-09-01', 'NVDA', 'BUY', 1, -10, 0, nvda)]);
  assert.equal((await send(root, badPrice)).status, 400);
  assert.deepEqual(db.portfolios.get(userA), before);
  const first = batch('ec8a22db-1a1c-4c3a-a8b9-666666666666', [row(2, '2026-09-01', 'NVDA', 'BUY', 1, 100, 0, nvda)]);
  assert.equal((await send(root, first)).status, 200);
  assert.equal((await send(root, batch(first.importId, [row(2, '2026-09-01', 'NVDA', 'BUY', 2, 100, 0, nvda)]))).status, 409);
});
