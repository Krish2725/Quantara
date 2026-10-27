const API_ROOT = 'https://api.twelvedata.com';
const TIMEOUT_MS = 8000;
// Verified through Twelve Data's United States trial-symbol listing and live Basic search.
export const BASIC_TRIAL_INSTRUMENT = Object.freeze({
  symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', access: 'Basic trial symbol',
});

export class MarketDataError extends Error {
  constructor(message, { code = 'MARKET_DATA_ERROR', status = 502 } = {}) {
    super(message);
    this.name = 'MarketDataError';
    this.code = code;
    this.status = status;
  }
}

function finiteProviderNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new MarketDataError(`The market-data provider returned an invalid ${label}.`, { code: 'INVALID_PROVIDER_RESPONSE' });
  return number;
}

function providerMessage(data, httpStatus, apiKey) {
  const message = typeof data?.message === 'string' ? data.message : '';
  const safeMessage = message && apiKey ? message.split(apiKey).join('[redacted]') : message;
  const code = String(data?.code ?? '');
  if (httpStatus === 429 || code === '429' || /rate.?limit|credits per minute|credits per day/i.test(message)) return new MarketDataError(safeMessage || 'Market-data provider rate limit reached. Wait briefly before retrying.', { code: 'PROVIDER_RATE_LIMIT', status: 429 });
  if (/plan|upgrade|subscription|available starting with|not included|entitlement/i.test(message)) return new MarketDataError(safeMessage, { code: 'PROVIDER_PLAN_REQUIRED', status: 503 });
  if (/invalid\s+(api\s*)?key|api.?key.*(invalid|missing|unauthorized)|unauthorized|unauthorised|authentication/i.test(message) || httpStatus === 401 || code === '401') return new MarketDataError(safeMessage || 'Twelve Data rejected the backend API key.', { code: 'PROVIDER_INVALID_CREDENTIALS', status: 503 });
  if (/no (quote|price|data)|quote data (is )?not available|data not available/i.test(message)) return new MarketDataError(safeMessage, { code: 'QUOTE_DATA_UNAVAILABLE', status: 404 });
  if (/symbol|instrument/i.test(message) && /not found|unknown|unsupported/i.test(message)) return new MarketDataError(safeMessage, { code: 'INSTRUMENT_UNAVAILABLE', status: 404 });
  if (httpStatus === 404 || code === '404') return new MarketDataError(safeMessage || 'The provider returned no data for this request.', { code: 'PROVIDER_DATA_UNAVAILABLE', status: 404 });
  if (/apikey|api key|invalid key|authorization/i.test(message) || httpStatus === 403 || code === '403') return new MarketDataError(safeMessage || 'Twelve Data denied access to this request.', { code: 'PROVIDER_ACCESS_DENIED', status: 503 });
  if (httpStatus >= 500) return new MarketDataError('Market-data provider is temporarily unavailable. Try again later.', { code: 'PROVIDER_UNAVAILABLE', status: 503 });
  return new MarketDataError(safeMessage || 'Market-data provider rejected the request. Check the instrument and account entitlements.', { code: 'PROVIDER_REQUEST_FAILED', status: 502 });
}

export function createMarketDataService({ apiKey = process.env.TWELVE_DATA_API_KEY, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const cache = new Map();
  const pending = new Map();
  const configured = typeof apiKey === 'string' && apiKey.trim().length > 0;

  async function request(endpoint, params, { cacheKey, ttl = 0 } = {}) {
    if (!configured) throw new MarketDataError('Market data is not configured. Set TWELVE_DATA_API_KEY on the backend; no prices were substituted.', { code: 'MARKET_DATA_NOT_CONFIGURED', status: 503 });
    if (cacheKey) {
      const hit = cache.get(cacheKey);
      if (hit && hit.expiresAt > now()) return hit.value;
      if (pending.has(cacheKey)) return pending.get(cacheKey);
    }
    const work = (async () => {
      const url = new URL(`${API_ROOT}/${endpoint}`);
      for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
      url.searchParams.set('apikey', apiKey);
      let response;
      try {
        response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new MarketDataError('Market-data provider timed out. Retry in a moment.', { code: 'PROVIDER_TIMEOUT', status: 504 });
        throw new MarketDataError('Could not reach the market-data provider. Check the backend connection and retry.', { code: 'PROVIDER_UNAVAILABLE', status: 503 });
      }
      let data;
      try { data = await response.json(); } catch { throw new MarketDataError('Market-data provider returned an unreadable response.', { code: 'INVALID_PROVIDER_RESPONSE' }); }
      if (!response.ok || data?.status === 'error' || data?.code) throw providerMessage(data, response.status, apiKey);
      if (cacheKey && ttl > 0) cache.set(cacheKey, { value: data, expiresAt: now() + ttl });
      return data;
    })();
    if (cacheKey) pending.set(cacheKey, work);
    try { return await work; } finally { if (cacheKey) pending.delete(cacheKey); }
  }

  function selectedInstrument(input) {
    const { symbol, micCode, currency, exchange } = input || {};
    if (typeof symbol !== 'string' || !symbol.trim() || symbol.length > 40) throw new MarketDataError('A valid ticker symbol is required.', { code: 'INVALID_INSTRUMENT', status: 400 });
    if (typeof micCode !== 'string' || !/^[A-Z0-9]{4}$/.test(micCode)) throw new MarketDataError('Select a valid exchange result before requesting prices.', { code: 'INVALID_INSTRUMENT', status: 400 });
    if (currency != null && (typeof currency !== 'string' || !/^[A-Z]{3}$/i.test(currency))) throw new MarketDataError('Select an instrument with a valid quote currency.', { code: 'INVALID_INSTRUMENT', status: 400 });
    if (exchange != null && (typeof exchange !== 'string' || !exchange.trim() || exchange.length > 80)) throw new MarketDataError('Select a valid exchange listing.', { code: 'INVALID_INSTRUMENT', status: 400 });
    return { symbol: symbol.trim(), micCode, currency: currency?.toUpperCase(), exchange };
  }

  function assertIdentity(data, instrument, { requireCurrency = true } = {}) {
    const symbol = String(data?.symbol || '').trim();
    const exchange = String(data?.exchange || '').trim();
    const micCode = String(data?.mic_code || '').trim().toUpperCase();
    const currency = String(data?.currency || '').trim().toUpperCase();
    if (!symbol || symbol.toUpperCase() !== instrument.symbol.toUpperCase()
      || !micCode || micCode !== instrument.micCode.toUpperCase()
      || (instrument.exchange && exchange.toLowerCase() !== instrument.exchange.trim().toLowerCase())
      || (requireCurrency && !/^[A-Z]{3}$/.test(currency))
      || (instrument.currency && currency !== instrument.currency)) {
      throw new MarketDataError(`Provider response did not match the selected listing ${instrument.symbol} (${instrument.micCode}${instrument.currency ? `, ${instrument.currency}` : ''}).`, { code: 'PROVIDER_IDENTITY_MISMATCH' });
    }
    return { symbol, exchange, micCode, currency };
  }

  return {
    status() {
      return { configured, provider: 'Twelve Data', setupMessage: configured ? null : 'Set TWELVE_DATA_API_KEY in backend/.env and restart the API. Demo mode and transaction entry remain available.' };
    },
    async search(query) {
      if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 80) throw new MarketDataError('Search text must contain 2 to 80 characters.', { code: 'INVALID_SEARCH', status: 400 });
      const q = query.trim();
      const data = await request('symbol_search', { symbol: q, outputsize: 20, show_plan: true }, { cacheKey: `search:${q.toLowerCase()}`, ttl: 5 * 60_000 });
      if (!Array.isArray(data?.data)) throw new MarketDataError('Market-data provider returned an invalid instrument search response.', { code: 'INVALID_PROVIDER_RESPONSE' });
      return data.data.map((row) => ({
        symbol: String(row.symbol || ''), name: String(row.instrument_name || ''), exchange: String(row.exchange || ''),
        micCode: String(row.mic_code || ''), currency: String(row.currency || ''), country: String(row.country || ''),
        type: String(row.instrument_type || ''), access: row.access ? { global: row.access.global, plan: row.access.plan } : null,
        verification: 'provider-search',
      })).filter((row) => row.symbol && row.name && /^[A-Z0-9]{4}$/.test(row.micCode) && row.exchange && /^[A-Z]{3}$/.test(row.currency.toUpperCase()));
    },
    async quote(input) {
      const instrument = selectedInstrument(input);
      const data = await request('quote', { symbol: instrument.symbol, mic_code: instrument.micCode }, { cacheKey: `quote:${instrument.micCode}:${instrument.symbol}`, ttl: 60_000 });
      const identity = assertIdentity(data, instrument);
      const price = finiteProviderNumber(data.close, 'quote price');
      if (price <= 0) throw new MarketDataError('Market-data provider returned a non-positive quote.', { code: 'INVALID_PROVIDER_RESPONSE' });
      const currency = identity.currency;
      const timestamp = Number(data.last_quote_at || data.timestamp);
      return {
        symbol: String(data.symbol || instrument.symbol), name: String(data.name || ''), exchange: String(data.exchange || ''),
        micCode: String(data.mic_code || instrument.micCode), currency, price,
        previousClose: data.previous_close == null ? null : finiteProviderNumber(data.previous_close, 'previous close'),
        quoteTimestamp: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : (data.datetime || null),
        isMarketOpen: typeof data.is_market_open === 'boolean' ? data.is_market_open : null,
        source: 'Twelve Data',
      };
    },
    async history(input) {
      const instrument = selectedInstrument(input);
      const data = await request('time_series', { symbol: instrument.symbol, mic_code: instrument.micCode, interval: '1day', outputsize: 5000, order: 'asc', adjust: 'splits' }, { cacheKey: `history:${instrument.micCode}:${instrument.symbol}`, ttl: 6 * 60 * 60_000 });
      if (!Array.isArray(data?.values) || !data.values.length) throw new MarketDataError('No daily price history is available for this instrument.', { code: 'HISTORY_UNAVAILABLE', status: 404 });
      const identity = assertIdentity({ symbol: data.meta?.symbol, exchange: data.meta?.exchange, mic_code: data.meta?.mic_code, currency: data.meta?.currency }, instrument);
      const values = data.values.map((row) => {
        const price = finiteProviderNumber(row.close, 'historical close');
        const date = typeof row.datetime === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.datetime) ? new Date(`${row.datetime}T00:00:00.000Z`) : null;
        if (price <= 0 || !date || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== row.datetime) throw new MarketDataError('Market-data provider returned invalid daily history.', { code: 'INVALID_PROVIDER_RESPONSE' });
        return { date: row.datetime, price };
      }).sort((a, b) => a.date.localeCompare(b.date));
      for (let i = 1; i < values.length; i++) if (values[i].date === values[i - 1].date) throw new MarketDataError('Market-data provider returned duplicate daily observations.', { code: 'INVALID_PROVIDER_RESPONSE' });
      return { symbol: identity.symbol, exchange: String(data.meta?.exchange || ''), micCode: identity.micCode, currency: identity.currency, interval: '1day', adjustment: 'splits', values };
    },
    async testConnection() {
      const instrument = { ...BASIC_TRIAL_INSTRUMENT };
      const [quoteResult, historyResult] = await Promise.allSettled([
        this.quote(instrument), this.history(instrument),
      ]);
      const errorDetails = (result) => result.status === 'rejected'
        ? { code: result.reason?.code || 'MARKET_DATA_ERROR', message: result.reason?.message || 'Market-data request failed.' }
        : null;
      return {
        instrument,
        success: quoteResult.status === 'fulfilled' && historyResult.status === 'fulfilled',
        quote: quoteResult.status === 'fulfilled' ? quoteResult.value : null,
        history: historyResult.status === 'fulfilled' ? historyResult.value : null,
        errors: { quote: errorDetails(quoteResult), history: errorDetails(historyResult) },
      };
    },
  };
}
