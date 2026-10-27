import { deriveTransactionLedger, valueTransactionLedger } from '@quantara/analytics';
export const LEDGER_VERSION = 1;
export const LEDGER_STORAGE_KEY = `quantara.transaction-ledger.v${LEDGER_VERSION}`;

function validateDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be a date in YYYY-MM-DD format.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} is not a valid calendar date.`);
}

export function createEmptyLedger() {
  return { version: LEDGER_VERSION, config: { baseCurrency: 'INR' }, transactions: [] };
}

export function deserializePersistedLedger(portfolio) {
  return {
    version: LEDGER_VERSION,
    config: portfolio.config,
    transactions: portfolio.transactions.map((transaction) => ({
      ...transaction,
      instrument: { ...transaction.instrument, verification: transaction.instrument.verification || 'legacy-unverified' },
    })),
  };
}

export function isProviderEligibleInstrument(instrument) {
  if (!instrument || instrument.verification === 'manual') return false;
  const metadataValid = typeof instrument.symbol === 'string' && instrument.symbol.trim()
    && typeof instrument.exchange === 'string' && instrument.exchange.trim()
    && /^[A-Z0-9]{4}$/i.test(instrument.micCode || '')
    && /^[A-Z]{3}$/i.test(instrument.currency || '');
  return Boolean(metadataValid && ['provider-search', 'provider-quote', 'legacy-unverified'].includes(instrument.verification));
}

export function markProviderQuoteVerified(ledger, instrument) {
  const key = `${instrument.micCode}:${instrument.symbol}`;
  return {
    ...ledger,
    transactions: ledger.transactions.map((transaction) => `${transaction.instrument.micCode}:${transaction.instrument.symbol}` === key
      ? { ...transaction, instrument: { ...transaction.instrument, verification: 'provider-quote' } }
      : transaction),
  };
}

export function currencyMismatchMessage(instrumentCurrency, baseCurrency) {
  const quoteCurrency = String(instrumentCurrency || '').trim().toUpperCase();
  const portfolioCurrency = String(baseCurrency || '').trim().toUpperCase();
  return `This portfolio uses ${portfolioCurrency} but the instrument is quoted in ${quoteCurrency}. Currency conversion is not supported. Set the portfolio base currency to ${quoteCurrency} before recording transactions.`;
}

export function validateTransaction(transaction) {
  if (!transaction || typeof transaction !== 'object') throw new Error('Transaction must be an object.');
  if (!['BUY', 'SELL'].includes(transaction.type)) throw new Error('Transaction type must be BUY or SELL.');
  validateDate(transaction.date, 'Transaction date');
  if (!transaction.instrument || typeof transaction.instrument !== 'object') throw new Error('Select an instrument from search results.');
  for (const field of ['symbol', 'exchange', 'micCode', 'currency', 'name']) {
    if (typeof transaction.instrument[field] !== 'string' || !transaction.instrument[field].trim()) throw new Error(`Instrument ${field} is required.`);
  }
  if (!/^[A-Z0-9]{4}$/.test(transaction.instrument.micCode.toUpperCase())) throw new Error('Instrument exchange MIC must contain four letters or numbers.');
  if (!/^[A-Z]{3}$/.test(transaction.instrument.currency.toUpperCase())) throw new Error('Instrument quote currency must be a three-letter code.');
  for (const [field, value] of [['quantity', transaction.quantity], ['unit price', transaction.unitPrice], ['fees', transaction.fees]]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || ((field === 'quantity' || field === 'unit price') && value === 0)) {
      throw new Error(`${field} must be a ${field === 'fees' ? 'non-negative' : 'positive'} finite number.`);
    }
  }
  return true;
}

export function validateLedger(ledger) {
  if (!ledger || ledger.version !== LEDGER_VERSION || !ledger.config || !Array.isArray(ledger.transactions)) {
    throw new Error('Saved transaction data is invalid or uses an unsupported version.');
  }
  if (typeof ledger.config.baseCurrency !== 'string' || !/^[A-Z]{3}$/.test(ledger.config.baseCurrency)) throw new Error('Saved base currency must be a three-letter currency code.');
  for (const txn of ledger.transactions) validateTransaction(txn);
  const transactions = [...ledger.transactions].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const balances = new Map();
  const identities = new Map();
  for (const txn of transactions) {
    if (txn.instrument.currency.trim().toUpperCase() !== ledger.config.baseCurrency.trim().toUpperCase()) throw new Error(currencyMismatchMessage(txn.instrument.currency, ledger.config.baseCurrency));
    const key = `${txn.instrument.micCode}:${txn.instrument.symbol}`;
    const identity = [txn.instrument.name.trim().toLowerCase(), txn.instrument.exchange.trim().toLowerCase(), txn.instrument.currency.trim().toUpperCase()];
    const knownIdentity = identities.get(key);
    if (knownIdentity && knownIdentity.some((part, index) => part !== identity[index])) throw new Error(`Transactions for ${txn.instrument.symbol} contain conflicting instrument identity details.`);
    identities.set(key, identity);
    const balance = balances.get(key) || { quantity: 0, costBasis: 0 };
    if (txn.type === 'BUY') {
      balance.costBasis += txn.quantity * txn.unitPrice + txn.fees;
      balance.quantity += txn.quantity;
    } else {
      if (txn.quantity > balance.quantity + 1e-10) throw new Error(`Sale of ${txn.instrument.symbol} on ${txn.date} exceeds the available quantity.`);
      const soldCostBasis = balance.quantity === 0 ? 0 : balance.costBasis / balance.quantity * txn.quantity;
      balance.costBasis = Math.max(0, balance.costBasis - soldCostBasis);
      balance.quantity = Math.max(0, balance.quantity - txn.quantity);
    }
    balances.set(key, balance);
  }
  return true;
}

export function derivePortfolio(ledger) {
  validateLedger(ledger);
  return deriveTransactionLedger(ledger.transactions);
}

export function valuePortfolio(ledger, quotes = {}) {
  const derived = derivePortfolio(ledger);
  return valueTransactionLedger(derived, quotes, ledger.config.baseCurrency);
}export function readLedger(storage = globalThis.localStorage) {
  if (!storage) return createEmptyLedger();
  try {
    const value = JSON.parse(storage.getItem(LEDGER_STORAGE_KEY) || 'null');
    if (value == null) return createEmptyLedger();
    validateLedger(value);
    return value;
  } catch { return createEmptyLedger(); }
}

export function writeLedger(ledger, storage = globalThis.localStorage) {
  if (!storage) return false;
  try { validateLedger(ledger); storage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledger)); return true; }
  catch { return false; }
}
