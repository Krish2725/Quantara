import express from 'express';
import cors from 'cors';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import { rateLimit } from 'express-rate-limit';
import {
  CalculationError,
  ValidationError,
  calculateHistoricalPortfolioAnalysis,
  calculatePerformanceSummary,
} from '@quantara/analytics';
import { createMarketDataService, MarketDataError } from './marketData.js';
import { createTickerService } from './ticker.js';
import { databaseStatus, importPortfolioTransactions, readPortfolio, savePortfolio, validatePortfolio } from './persistence.js';
import { createAuthController } from './controllers/authController.js';
import { isAuthenticated } from './middleware/isAuthenticated.js';
import { createHash } from 'node:crypto';
import { summarizePortfolio } from './portfolioSummary.js';

const FREQUENCIES = new Set([
  'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUAL',
]);

export function createApp({ marketData = createMarketDataService(), portfolioStore = { read: readPortfolio, save: savePortfolio, importTransactions: importPortfolioTransactions }, ticker = null, dbStatus = databaseStatus, users, sessionMiddleware } = {}) {
  const app = express();
  const getTicker = ticker || createTickerService({ marketData });
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  const trustedOrigins = new Set((process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map((x) => x.trim()).filter(Boolean));
  if (trustedOrigins.has('*')) throw new Error('FRONTEND_ORIGIN must list explicit trusted origins; wildcard origins are not allowed.');
  app.use(cors({ origin(origin, callback) { if (!origin || trustedOrigins.has(origin)) return callback(null, true); return callback(new Error('Origin is not allowed.')); }, credentials: true, methods: ['GET', 'POST', 'PUT', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
  const mongoUri = process.env.MONGODB_URI;
  const store = sessionMiddleware || session({ name: 'quantara.sid', secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('SESSION_SECRET is required in production.'); })() : 'quantara-development-only-secret-change-me'), resave: false, saveUninitialized: false, rolling: true, cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 14 * 24 * 60 * 60 * 1000 }, ...(mongoUri ? { store: MongoStore.create({ mongoUrl: mongoUri, collectionName: 'sessions', ttl: 14 * 24 * 60 * 60 }) } : {}) });
  app.use(store);
  app.locals.sessionStore = store.store || null;
  // Provider history can contain up to 5,000 daily prices in a Risk Analysis request.
  app.use(express.json({ limit: '512kb' }));
  app.use(['/api/auth', '/api/portfolio'], (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  const auth = createAuthController({ users });
  const authenticated = isAuthenticated({ users });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } } });
  const marketDataLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many market-data requests. Try again later.' } } });
  app.use('/api/market-data', marketDataLimiter);
  const requireCsrf = (req, res, next) => req.session?.csrfToken && req.get('x-csrf-token') === req.session.csrfToken ? next() : res.status(403).json({ error: { code: 'CSRF_FAILED', message: 'Refresh the page and try again.' } });
  app.get('/api/auth/csrf', auth.csrf);
  app.post('/api/auth/register', authLimiter, requireCsrf, auth.register);
  app.post('/api/auth/login', authLimiter, requireCsrf, auth.login);
  app.get('/api/auth/me', auth.me);
  app.post('/api/auth/logout', requireCsrf, auth.logout);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', database: dbStatus() });
  });

  app.get('/api/portfolio', authenticated, async (req, res, next) => {
    try {
      if (!dbStatus().connected) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Portfolio database is unavailable.' } });
      const portfolio = await portfolioStore.read(req.userId);
      res.json({ portfolio: portfolio ? { config: portfolio.config, transactions: portfolio.transactions, updatedAt: portfolio.updatedAt, summary: summarizePortfolio(portfolio) } : null, database: dbStatus() });
    } catch (error) { next(error); }
  });
  app.put('/api/portfolio', authenticated, requireCsrf, async (req, res, next) => {
    try {
      if (!req.body || Object.keys(req.body).some((key) => !['config', 'transactions'].includes(key))) return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Portfolio includes unsupported fields.' } });
      validatePortfolio(req.body);
      const portfolio = await portfolioStore.save(req.userId, req.body);
      res.json({ portfolio: { config: portfolio.config, transactions: portfolio.transactions, updatedAt: portfolio.updatedAt, summary: summarizePortfolio(portfolio) } });
    } catch (error) { next(error); }
  });
  const transactionImportLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many transaction import attempts. Try again later.' } } });
  app.post('/api/portfolio/import-transactions', authenticated, requireCsrf, transactionImportLimiter, async (req, res, next) => {
    try {
      if (!dbStatus().connected) return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Portfolio database is unavailable.' } });
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !['importId', 'baseCurrency', 'transactions'].includes(key))) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Import request must include only importId, baseCurrency and transactions.' } });
      }
      if (typeof body.importId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.importId)) throw Object.assign(new Error('A valid UUID import identifier is required.'), { status: 400 });
      if (!/^[A-Z]{3}$/.test(body.baseCurrency || '') || !Array.isArray(body.transactions) || body.transactions.length < 1 || body.transactions.length > 500) throw Object.assign(new Error('Import requires a three-letter base currency and between 1 and 500 transaction rows.'), { status: 400 });
      const current = await portfolioStore.read(req.userId);
      const baseCurrency = current?.config?.baseCurrency || body.baseCurrency;
      if (current && body.baseCurrency !== baseCurrency) throw Object.assign(new Error(`This portfolio is denominated in ${baseCurrency}; imported transactions must use that currency.`), { status: 400 });
      const storedBySymbol = new Map();
      for (const transaction of current?.transactions || []) {
        const instrument = transaction.instrument;
        const symbol = instrument.symbol.toUpperCase();
        const identities = storedBySymbol.get(symbol) || new Map();
        identities.set(`${instrument.micCode}:${symbol}`, instrument);
        storedBySymbol.set(symbol, identities);
      }
      const rows = [];
      const rowNumbers = new Set();
      for (const [index, input] of body.transactions.entries()) {
        const allowed = new Set(['rowNumber', 'date', 'symbol', 'type', 'quantity', 'unitPrice', 'fees', 'instrument']);
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !allowed.has(key))) throw Object.assign(new Error(`Import row ${index + 1} contains unsupported fields.`), { status: 400 });
        const date = typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? new Date(`${input.date}T00:00:00.000Z`) : null;
        if (!Number.isInteger(input.rowNumber) || input.rowNumber < 2 || rowNumbers.has(input.rowNumber)) throw Object.assign(new Error(`Import row ${index + 1} has an invalid or duplicate source row number.`), { status: 400 });
        rowNumbers.add(input.rowNumber);
        if (!date || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== input.date) throw Object.assign(new Error(`Import row ${input.rowNumber} date must be a real YYYY-MM-DD or normalized DD-MM-YYYY calendar date.`), { status: 400 });
        const symbol = typeof input.symbol === 'string' ? input.symbol.trim().toUpperCase() : '';
        if (!/^[A-Z0-9][A-Z0-9.-]{0,39}$/.test(symbol)) throw Object.assign(new Error(`Import row ${input.rowNumber} has an invalid stock symbol.`), { status: 400 });
        if (!['BUY', 'SELL'].includes(input.type) || !Number.isFinite(input.quantity) || input.quantity <= 0 || !Number.isFinite(input.unitPrice) || input.unitPrice <= 0 || (input.fees !== undefined && (!Number.isFinite(input.fees) || input.fees < 0))) throw Object.assign(new Error(`Import row ${input.rowNumber} has an invalid type, quantity, price or fee.`), { status: 400 });
        rows.push({ sourceIndex: index, rowNumber: input.rowNumber, date: input.date, symbol, type: input.type, quantity: input.quantity, unitPrice: input.unitPrice, fees: input.fees ?? 0, requestedInstrument: input.instrument });
      }
      const symbols = [...new Set(rows.map((row) => row.symbol))];
      const resolved = new Map();
      for (const symbol of symbols) {
        const stored = [...(storedBySymbol.get(symbol)?.values() || [])];
        const requested = rows.find((row) => row.symbol === symbol)?.requestedInstrument;
        if (stored.length === 1) {
          const saved = stored[0];
          if (requested && (requested.symbol?.toUpperCase() !== symbol || requested.micCode?.toUpperCase() !== saved.micCode
            || requested.currency?.toUpperCase() !== saved.currency || requested.exchange?.toLowerCase() !== saved.exchange.toLowerCase())) {
            throw Object.assign(new Error(`CSV symbol ${symbol} conflicts with its existing account instrument identity.`), { status: 400 });
          }
          resolved.set(symbol, saved);
          continue;
        }
        if (!requested || requested.symbol?.trim().toUpperCase() !== symbol || !/^[A-Z0-9]{4}$/.test(requested.micCode?.toUpperCase() || '')
          || !/^[A-Z]{3}$/.test(requested.currency?.toUpperCase() || '') || !requested.exchange?.trim() || !requested.name?.trim()) {
          throw Object.assign(new Error(`CSV symbol ${symbol} needs one exact provider-verified stock listing. Select its exchange and currency in the preview.`), { status: 400 });
        }
        const providerMatches = (await marketData.search(symbol)).filter((item) => item.symbol.toUpperCase() === symbol && /stock/i.test(item.type || '')
          && item.micCode.toUpperCase() === requested.micCode.toUpperCase() && item.currency.toUpperCase() === requested.currency.toUpperCase()
          && item.exchange.toLowerCase() === requested.exchange.trim().toLowerCase());
        if (providerMatches.length !== 1) throw Object.assign(new Error(`Could not verify one exact provider stock listing for ${symbol}. No transactions were imported.`), { status: 400 });
        resolved.set(symbol, providerMatches[0]);
      }
      const createdAtBase = Date.now();
      const transactions = rows.map((row, index) => ({
        id: `import:${body.importId}:${index + 1}`, type: row.type, date: row.date,
        createdAt: new Date(createdAtBase + index).toISOString(), source: 'import', importBatchId: body.importId, importRowNumber: row.rowNumber,
        instrument: resolved.get(row.symbol), quantity: row.quantity, unitPrice: row.unitPrice, fees: row.fees,
      }));
      const config = current?.config || { baseCurrency };
      const isKnownImportId = Boolean(current?.importBatches?.[body.importId]);
      validatePortfolio({ config, transactions: isKnownImportId ? (current?.transactions || []) : [...(current?.transactions || []), ...transactions] });
      const canonicalBatch = transactions.map((tx) => [tx.importRowNumber, tx.date, tx.instrument.symbol, tx.type, tx.quantity, tx.unitPrice, tx.fees,
        tx.instrument.micCode, tx.instrument.exchange, tx.instrument.currency]);
      const hash = createHash('sha256').update(JSON.stringify(canonicalBatch)).digest('hex');
      const dates = transactions.map((tx) => tx.date).sort();
      const symbolsUsed = [...new Set(transactions.map((tx) => tx.instrument.symbol))].sort();
      const result = await portfolioStore.importTransactions(req.userId, { importId: body.importId, hash, config, transactions,
        summary: { dateRange: `${dates[0]}–${dates.at(-1)}`, symbols: symbolsUsed } });
      res.json({ portfolio: { config: result.portfolio.config, transactions: result.portfolio.transactions, updatedAt: result.portfolio.updatedAt, summary: summarizePortfolio(result.portfolio) },
        import: { duplicate: result.duplicate, rowCount: result.batch.rowCount, dateRange: result.batch.dateRange, symbols: result.batch.symbols } });
    } catch (error) { next(error); }
  });
  app.get('/api/market-data/ticker', async (_req, res, next) => {
    try { res.json(await getTicker()); } catch (error) { next(error); }
  });

  app.get('/api/market-data/status', (_req, res) => {
    res.json(marketData.status());
  });

  app.get('/api/market-data/test-connection', async (_req, res, next) => {
    try { res.json(await marketData.testConnection()); }
    catch (error) { next(error); }
  });

  app.get('/api/market-data/search', async (req, res, next) => {
    try { res.json({ instruments: await marketData.search(req.query.q) }); }
    catch (error) { next(error); }
  });

  app.get('/api/market-data/quote', async (req, res, next) => {
    try { res.json({ quote: await marketData.quote({ symbol: req.query.symbol, micCode: req.query.micCode, currency: req.query.currency, exchange: req.query.exchange }) }); }
    catch (error) { next(error); }
  });

  app.get('/api/market-data/history', async (req, res, next) => {
    try { res.json({ history: await marketData.history({ symbol: req.query.symbol, micCode: req.query.micCode, currency: req.query.currency, exchange: req.query.exchange }) }); }
    catch (error) { next(error); }
  });

  app.post('/api/portfolio-analysis', (req, res, next) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object.');
      }

      const allowedKeys = new Set(['values', 'riskFreeRate', 'frequency']);
      const unknownKey = Object.keys(body).find((key) => !allowedKeys.has(key));
      if (unknownKey) {
        throw new ValidationError(`Unknown request field "${unknownKey}".`);
      }

      const { values, riskFreeRate, frequency } = body;
      if (!Array.isArray(values) || values.length < 3) {
        throw new ValidationError('values must be an array with at least 3 portfolio values.');
      }
      if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) {
        throw new ValidationError('values must contain only positive finite numbers.');
      }
      if (riskFreeRate !== undefined && (typeof riskFreeRate !== 'number' || !Number.isFinite(riskFreeRate))) {
        throw new ValidationError('riskFreeRate must be a finite number.');
      }
      if (frequency !== undefined) {
        const validFrequency = (typeof frequency === 'string' && FREQUENCIES.has(frequency.trim().toUpperCase().replace(/[-\s]/g, '_')))
          || (typeof frequency === 'number' && Number.isFinite(frequency) && frequency > 0);
        if (!validFrequency) {
          throw new ValidationError('frequency must be a supported frequency name or positive number.');
        }
      }

      res.json({
        analysis: calculatePerformanceSummary(values, {
          ...(riskFreeRate === undefined ? {} : { riskFreeRate }),
          ...(frequency === undefined ? {} : { frequency }),
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/portfolio-comparison', (req, res, next) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ValidationError('Request body must be a JSON object.');
      }
      const allowedKeys = new Set(['holdings', 'benchmark', 'riskFreeRate', 'frequency']);
      const unknownKey = Object.keys(body).find((key) => !allowedKeys.has(key));
      if (unknownKey) throw new ValidationError(`Unknown request field "${unknownKey}".`);
      res.json({ analysis: calculateHistoricalPortfolioAnalysis(body) });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 512 KB limit.' } });
    }
    if (error instanceof MarketDataError) {
      return res.status(error.status).json({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ValidationError || error.status === 400 || error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: error.message } });
    }
    if (error instanceof CalculationError) {
      return res.status(422).json({ error: { code: 'CALCULATION_FAILED', message: error.message } });
    }
    if (Number.isInteger(error.status) && error.status >= 400 && error.status < 500) return res.status(error.status).json({ error: { code: error.code || 'INVALID_REQUEST', message: error.message } });
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
  });

  return app;
}
