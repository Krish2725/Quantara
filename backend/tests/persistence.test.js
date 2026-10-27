import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, Portfolio } from '../src/persistence.js';

test('database connection reports success and failure without returning credentials', async () => {
  const success = await connectDatabase('mongodb://secret.example/db', async () => {});
  assert.deepEqual(success, { configured: true, connected: true });
  const failure = await connectDatabase('mongodb://secret.example/db', async () => { throw new Error('private connection detail'); });
  assert.deepEqual(failure, { configured: true, connected: false });
  assert.equal(JSON.stringify(failure).includes('secret'), false);
  assert.deepEqual(await connectDatabase(''), { configured: false, connected: false });
});

test('persisted instrument listing fields survive Mongoose validation and legacy verification defaults safely', async () => {
  const importedHistory = {
    'XNGS:NVDA': { values: [{ date: '2025-01-01', price: 100 }], source: 'User-supplied historical CSV data (not live market data)' },
    'XNAS:TSLA': { instrument: { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', micCode: 'XNAS', currency: 'USD', type: 'Common Stock', verification: 'provider-search' }, values: [{ date: '2025-01-01', price: 400 }], source: 'User-supplied historical CSV data (not live market data)' },
  };
  const portfolio = new Portfolio({ userId: '507f1f77bcf86cd799439011', config: { baseCurrency: 'USD', importedHistory, historyPreferences: { 'XNGS:NVDA': 'imported', 'XNAS:TSLA': 'imported' } }, transactions: [{
    id: 'legacy-nvda', type: 'BUY', date: '2025-01-01', createdAt: '2025-01-01T12:00:00Z', quantity: 1, unitPrice: 100, fees: 0,
    instrument: { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD' },
  }] });
  await portfolio.validate();
  assert.deepEqual(portfolio.config.importedHistory, importedHistory);
  assert.equal(portfolio.config.historyPreferences['XNGS:NVDA'], 'imported');
  assert.deepEqual({
    symbol: portfolio.transactions[0].instrument.symbol,
    name: portfolio.transactions[0].instrument.name,
    exchange: portfolio.transactions[0].instrument.exchange,
    micCode: portfolio.transactions[0].instrument.micCode,
    currency: portfolio.transactions[0].instrument.currency,
    verification: portfolio.transactions[0].instrument.verification,
  }, { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', verification: 'legacy-unverified' });
});
