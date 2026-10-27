import { DEFAULT_TICKER_SYMBOLS, VERIFIED_WATCHLIST } from './tickerWatchlist.js';
export { DEFAULT_TICKER_SYMBOLS, VERIFIED_WATCHLIST } from './tickerWatchlist.js';

export const DEFAULT_TICKER_REFRESH_MS = 110_000;

export function getTickerWatchlist(value = process.env.TICKER_SYMBOLS || DEFAULT_TICKER_SYMBOLS.join(',')) {
  const symbols = (Array.isArray(value) ? value : String(value).split(',')).map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
  const unsupported = [...new Set(symbols.filter((symbol) => !VERIFIED_WATCHLIST[symbol]))];
  if (unsupported.length) console.warn(`Unsupported TICKER_SYMBOLS ignored (not in the maintained ticker configuration): ${unsupported.join(', ')}`);
  return [...new Set(symbols)].map((symbol) => VERIFIED_WATCHLIST[symbol]).filter(Boolean);
}

export function dailyChange(price, previousClose) {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(previousClose) || previousClose <= 0) return null;
  return price - previousClose;
}

export function dailyChangePercent(price, previousClose) {
  const change = dailyChange(price, previousClose);
  return change == null ? null : (change / previousClose) * 100;
}

export function createTickerService({
  marketData, now = () => Date.now(),
  intervalMs = Math.max(60_000, Number(process.env.TICKER_REFRESH_MS) || DEFAULT_TICKER_REFRESH_MS),
  batchSize = Number(process.env.TICKER_BATCH_SIZE) || 4,
  retryAfterMs = 15 * 60_000,
  watchlist = getTickerWatchlist(),
} = {}) {
  let cached = null, expires = 0, pending = null, cursor = 0, initialFillComplete = false;
  const itemsBySymbol = new Map();
  const lastAttempt = new Map();
  const boundedBatchSize = Math.max(1, Math.min(4, Math.floor(batchSize) || 4));
  return async function getTicker() {
    if (cached && expires > now()) return cached;
    if (pending) return pending;
    if (watchlist.length === 0) {
      cached = { items: [], updatedAt: now(), marketDataConfigured: marketData.status().configured, stale: false, configurationError: 'No ticker symbols are configured. Update backend/src/tickerWatchlist.js or set TICKER_SYMBOLS.' };
      expires = now() + intervalMs;
      return cached;
    }
    pending = (async () => {
      const selected = [];
      // Warm the whole watchlist on the first dashboard request so a demo is populated immediately.
      // Subsequent refreshes stay within the four-symbol request cap.
      if (!initialFillComplete) {
        watchlist.forEach((instrument, index) => selected.push({ instrument, index }));
      } else {
        for (let offset = 0; offset < watchlist.length && selected.length < boundedBatchSize; offset += 1) {
          const index = (cursor + offset) % watchlist.length;
          const instrument = watchlist[index];
          const attemptedAt = lastAttempt.get(instrument.symbol);
          if (attemptedAt == null || now() - attemptedAt >= retryAfterMs) selected.push({ instrument, index });
        }
      }
      if (selected.length) cursor = (selected.at(-1).index + 1) % watchlist.length;
      const fetched = await Promise.all(selected.map(async ({ instrument }) => {
        lastAttempt.set(instrument.symbol, now());
        try {
          const quote = await marketData.quote(instrument);
          const item = { ...instrument, ...quote, dailyChange: dailyChange(quote.price, quote.previousClose), dailyChangePercent: dailyChangePercent(quote.price, quote.previousClose), refreshedAt: now(), stale: false, error: null, quoteState: 'available' };
          itemsBySymbol.set(instrument.symbol, item);
          return item;
        } catch (error) {
          const previous = itemsBySymbol.get(instrument.symbol);
          const item = previous?.price != null
            ? { ...previous, stale: true, error: { code: error.code || 'MARKET_DATA_ERROR', message: error.message || 'Quote refresh failed.' }, quoteState: 'stale' }
            : { ...instrument, price: null, previousClose: null, dailyChange: null, dailyChangePercent: null, quoteTimestamp: null, refreshedAt: null, stale: false, error: { code: error.code || 'MARKET_DATA_ERROR', message: error.message || 'Quote unavailable.' }, quoteState: 'unavailable' };
          itemsBySymbol.set(instrument.symbol, item);
          return item;
        }
      }));
      const fetchedBySymbol = new Map(fetched.map((item) => [item.symbol, item]));
      initialFillComplete = true;
      const items = watchlist.map((instrument) => fetchedBySymbol.get(instrument.symbol) || itemsBySymbol.get(instrument.symbol) || {
        ...instrument, price: null, previousClose: null, dailyChange: null, dailyChangePercent: null, quoteTimestamp: null,
        refreshedAt: null, stale: false, error: null, quoteState: 'pending',
      });
      cached = { items, updatedAt: now(), marketDataConfigured: marketData.status().configured, stale: items.some((item) => item.stale) };
      expires = now() + intervalMs;
      pending = null;
      return cached;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
