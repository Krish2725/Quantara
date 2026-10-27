import mongoose from 'mongoose';
import { deriveTransactionLedger } from '@quantara/analytics';

const transactionSchema = new mongoose.Schema({
  id: { type: String, required: true }, type: { type: String, enum: ['BUY', 'SELL'], required: true },
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ }, createdAt: { type: Date, required: true }, updatedAt: { type: Date, default: Date.now },
  source: { type: String, enum: ['manual', 'import'], default: 'manual' }, importBatchId: { type: String }, importRowNumber: { type: Number, min: 2 },
  instrument: { symbol: { type: String, required: true }, name: { type: String, required: true }, exchange: { type: String, required: true }, micCode: { type: String, required: true, match: /^[A-Z0-9]{4}$/ }, currency: { type: String, required: true, match: /^[A-Z]{3}$/ }, verification: { type: String, default: 'legacy-unverified' } },
  quantity: { type: Number, required: true, min: Number.MIN_VALUE }, unitPrice: { type: Number, required: true, min: Number.MIN_VALUE }, fees: { type: Number, required: true, min: 0 },
}, { _id: false, strict: true });
const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'QuantaraUser', required: true }, version: { type: Number, default: 1 }, config: { type: mongoose.Schema.Types.Mixed, required: true },
  transactions: { type: [transactionSchema], default: [] }, importBatches: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }, revision: { type: Number, default: 0 }, updatedAt: { type: Date, default: Date.now },
}, { strict: true, autoIndex: false });
portfolioSchema.index({ userId: 1 }, { name: 'quantara_userId_unique', unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
export const Portfolio = mongoose.models.QuantaraPortfolio || mongoose.model('QuantaraPortfolio', portfolioSchema);

async function ensurePortfolioOwnershipIndex() {
  const indexes = await Portfolio.collection.indexes();
  const oldIndex = indexes.find((index) => index.key?.userId === 1 && index.unique && !index.partialFilterExpression);
  if (oldIndex) await Portfolio.collection.dropIndex(oldIndex.name);
  await Portfolio.collection.createIndex({ userId: 1 }, { name: 'quantara_userId_unique', unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
}

export async function connectDatabase(uri = process.env.MONGODB_URI, connector = mongoose.connect.bind(mongoose)) {
  if (!uri) return { configured: false, connected: false };
  try { await connector(uri, { serverSelectionTimeoutMS: 5000 }); if (mongoose.connection.readyState === 1) await ensurePortfolioOwnershipIndex(); console.log("MongoDB connected successfully"); return { configured: true, connected: true }; }
  catch { return { configured: true, connected: false }; }
}
export function databaseStatus() { return { configured: Boolean(process.env.MONGODB_URI), connected: mongoose.connection.readyState === 1 }; }

export function validatePortfolio(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !body.config || typeof body.config !== 'object' || !Array.isArray(body.transactions)) throw Object.assign(new Error('Portfolio must include settings and a transaction list.'), { status: 400 });
  if (!/^[A-Z]{3}$/.test(body.config.baseCurrency || '')) throw Object.assign(new Error('Base currency must be a three-letter code.'), { status: 400 });
  const ids = new Set(), identity = new Map();
  const ordered = [...body.transactions].sort((a, b) => String(a?.date || '').localeCompare(String(b?.date || '')) || String(a?.createdAt || '').localeCompare(String(b?.createdAt || '')));
  for (const tx of ordered) {
    const parsedDate = typeof tx?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(tx.date) ? new Date(`${tx.date}T00:00:00.000Z`) : null;
    if (!tx || !['BUY','SELL'].includes(tx.type) || typeof tx.id !== 'string' || !tx.id || ids.has(tx.id) || !parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0,10) !== tx.date || !Number.isFinite(Date.parse(tx.createdAt)) || !Number.isFinite(tx.quantity) || tx.quantity <= 0 || !Number.isFinite(tx.unitPrice) || tx.unitPrice <= 0 || !Number.isFinite(tx.fees) || tx.fees < 0) throw Object.assign(new Error('Transaction data is invalid or duplicated.'), { status: 400 });
    ids.add(tx.id);
    if (tx.source != null && !['manual', 'import'].includes(tx.source)) throw Object.assign(new Error('Transaction source is invalid.'), { status: 400 });
    if (tx.source === 'import' && (!/^[0-9a-f-]{36}$/i.test(tx.importBatchId || '') || !Number.isInteger(tx.importRowNumber) || tx.importRowNumber < 2)) throw Object.assign(new Error('Imported transaction metadata is invalid.'), { status: 400 });
    const i = tx.instrument;
    if (!i || typeof i.symbol !== 'string' || typeof i.name !== 'string' || typeof i.exchange !== 'string' || !/^[A-Z0-9]{4}$/.test(i.micCode || '') || !/^[A-Z]{3}$/.test(i.currency || '') || i.currency !== body.config.baseCurrency) throw Object.assign(new Error('Instrument identity or currency is invalid.'), { status: 400 });
    const key = `${i.micCode}:${i.symbol}`, prev = identity.get(key);
    if (prev && JSON.stringify(prev) !== JSON.stringify([i.name,i.exchange,i.currency])) throw Object.assign(new Error('Instrument identity conflicts across transactions.'), { status: 400 });
    identity.set(key,[i.name,i.exchange,i.currency]);
  }
  try { deriveTransactionLedger(body.transactions); }
  catch (error) { throw Object.assign(error, { status: 400 }); }
  // Legacy importedHistory/historyPreferences config is retained as opaque account data for
  // backward compatibility, but is never validated, consumed as market data, or used to derive holdings.
}
export async function readPortfolio(userId) {
  if (mongoose.connection.readyState !== 1) return null;
  return Portfolio.findOne({ userId }).lean();
}
export async function savePortfolio(userId, body) {
  validatePortfolio(body);
  if (mongoose.connection.readyState !== 1) throw Object.assign(new Error('Portfolio database is unavailable.'), { status: 503 });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await Portfolio.findOne({ userId }).lean();
    const transactions = mergeAppendOnlyTransactions(existing?.transactions || [], body.transactions);
    const candidate = { config: body.config, transactions };
    validatePortfolio(candidate);
    if (!existing) {
      try { return await new Portfolio({ userId, version: 1, revision: 1, config: candidate.config, transactions, importBatches: {} }).save().then((doc) => doc.toObject()); }
      catch (error) { if (error?.code === 11000) continue; throw error; }
    }
    const revisionFilter = existing.revision == null ? { $or: [{ revision: { $exists: false } }, { revision: 0 }] } : { revision: existing.revision };
    const doc = await Portfolio.findOneAndUpdate({ userId, ...revisionFilter }, { $set: { config: candidate.config, transactions, updatedAt: new Date() }, $inc: { revision: 1 } }, { new: true, runValidators: true });
    if (doc) return doc.toObject();
  }
  throw Object.assign(new Error('Portfolio changed during save. Refresh the account and retry.'), { status: 409, code: 'PORTFOLIO_WRITE_CONFLICT' });
}

function transactionIdentity(tx) {
  const instrument = tx.instrument || {};
  return JSON.stringify([tx.id, tx.type, tx.date, new Date(tx.createdAt).toISOString(), instrument.symbol, instrument.name, instrument.exchange,
    instrument.micCode, instrument.currency, tx.quantity, tx.unitPrice, tx.fees, tx.source || 'manual', tx.importBatchId || null, tx.importRowNumber || null]);
}

function mergeAppendOnlyTransactions(existingTransactions, incomingTransactions) {
  const byId = new Map(existingTransactions.map((tx) => [tx.id, tx]));
  for (const tx of incomingTransactions) {
    const previous = byId.get(tx.id);
    if (previous && transactionIdentity(previous) !== transactionIdentity(tx)) {
      const sameExceptVerification = transactionIdentity({ ...previous, instrument: { ...previous.instrument, verification: undefined } })
        === transactionIdentity({ ...tx, instrument: { ...tx.instrument, verification: undefined } });
      if (!sameExceptVerification) throw Object.assign(new Error(`Transaction ${tx.id} conflicts with an existing append-only ledger entry.`), { status: 409, code: 'TRANSACTION_ID_CONFLICT' });
      if (['provider-search', 'provider-quote'].includes(tx.instrument?.verification)) byId.set(tx.id, tx);
      continue;
    }
    if (!previous) byId.set(tx.id, tx);
  }
  return [...byId.values()];
}

export async function importPortfolioTransactions(userId, { importId, hash, config, transactions, summary }) {
  if (mongoose.connection.readyState !== 1) throw Object.assign(new Error('Portfolio database is unavailable.'), { status: 503 });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await Portfolio.findOne({ userId }).lean();
    const batches = existing?.importBatches || {};
    const previous = batches[importId];
    if (previous) {
      if (previous.hash !== hash) throw Object.assign(new Error('This import identifier was already used for a different transaction batch.'), { status: 409, code: 'IMPORT_ID_REUSED' });
      return { portfolio: existing, duplicate: true, batch: previous };
    }
    const nextTransactions = mergeAppendOnlyTransactions(existing?.transactions || [], transactions);
    const nextConfig = existing?.config || config;
    validatePortfolio({ config: nextConfig, transactions: nextTransactions });
    const batch = { hash, transactionIds: transactions.map((tx) => tx.id), rowCount: transactions.length, ...summary, importedAt: new Date().toISOString() };
    const nextBatches = { ...batches, [importId]: batch };
    if (!existing) {
      try {
        const created = await new Portfolio({ userId, version: 1, revision: 1, config: nextConfig, transactions: nextTransactions, importBatches: nextBatches }).save();
        return { portfolio: created.toObject(), duplicate: false, batch };
      } catch (error) { if (error?.code === 11000) continue; throw error; }
    }
    const revisionFilter = existing.revision == null ? { $or: [{ revision: { $exists: false } }, { revision: 0 }] } : { revision: existing.revision };
    const updated = await Portfolio.findOneAndUpdate({ userId, ...revisionFilter }, { $set: { transactions: nextTransactions, importBatches: nextBatches, updatedAt: new Date() }, $inc: { revision: 1 } }, { new: true, runValidators: true });
    if (updated) return { portfolio: updated.toObject(), duplicate: false, batch };
  }
  throw Object.assign(new Error('Portfolio changed during import. Retry the same batch; no duplicate transactions will be created.'), { status: 409, code: 'PORTFOLIO_WRITE_CONFLICT' });
}
