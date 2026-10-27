export class PortfolioApiError extends Error {
  constructor(message, { kind = 'server', status = 0, code = 'NETWORK_ERROR' } = {}) {
    super(message);
    this.name = 'PortfolioApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

const apiBaseUrl = import.meta.env?.VITE_API_BASE_URL ?? '';
let csrfToken = '';
async function csrfHeaders() {
  if (!csrfToken) {
    const response = await fetch(`${apiBaseUrl}/api/auth/csrf`, { credentials: 'include' });
    const body = await response.json();
    if (!response.ok || !body.csrfToken) throw new PortfolioApiError('Could not start a secure session. Please try again.');
    csrfToken = body.csrfToken;
  }
  return { 'X-CSRF-Token': csrfToken };
}
export async function authRequest(path, { method = 'GET', body } = {}) {
  const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}) };
  if (method !== 'GET') Object.assign(headers, await csrfHeaders());
  const response = await fetch(`${apiBaseUrl}${path}`, { method, credentials: 'include', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 || response.status === 403) csrfToken = '';
  if (!response.ok) throw new PortfolioApiError(data?.error?.message || 'The request could not be completed.', { status: response.status, code: data?.error?.code || 'API_ERROR' });
  if (data.csrfToken) csrfToken = data.csrfToken;
  if (path.endsWith('/logout')) csrfToken = '';
  return data;
}

async function getApiJson(path) {
  let response;
  try { response = await fetch(`${apiBaseUrl}${path}`); }
  catch { throw new PortfolioApiError('Could not reach the Quantara API. Check that the backend is running and try again.'); }
  let body;
  try { body = await response.json(); }
  catch { throw new PortfolioApiError('The Quantara API returned an unreadable response.', { status: response.status, code: 'INVALID_RESPONSE' }); }
  if (!response.ok) {
    const error = body?.error;
    const kind = response.status === 400 ? 'validation' : 'server';
    throw new PortfolioApiError(error?.message || 'The market-data request failed.', { kind, status: response.status, code: error?.code || 'API_ERROR' });
  }
  return body;
}

export async function getPersistedPortfolio() {
  const response = await fetch(`${apiBaseUrl}/api/portfolio`, { credentials: 'include' });
  let body; try { body = await response.json(); } catch { throw new PortfolioApiError('The Quantara API returned an unreadable portfolio response.', { status: response.status }); }
  if (!response.ok) throw new PortfolioApiError(body?.error?.message || 'Could not load the saved portfolio.', { status: response.status, code: body?.error?.code });
  if (body.database?.connected === false) throw new PortfolioApiError('MongoDB is not connected. Configure MONGODB_URI and verify GET /health before relying on server persistence.', { status: 503, code: 'DATABASE_UNAVAILABLE' });
  return body;
}
export async function savePersistedPortfolio(ledger) {
  const response = await fetch(`${apiBaseUrl}/api/portfolio`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) }, body: JSON.stringify({ config: ledger.config, transactions: ledger.transactions }) });
  if (response.status === 401 || response.status === 403) csrfToken = '';
  let body; try { body = await response.json(); } catch { throw new PortfolioApiError('The Quantara API returned an unreadable save response.', { status: response.status }); }
  if (!response.ok) throw new PortfolioApiError(body?.error?.message || 'Could not save the portfolio.', { status: response.status, code: body?.error?.code });
  return body;
}
export async function importPersistedTransactions(batch) {
  const response = await fetch(`${apiBaseUrl}/api/portfolio/import-transactions`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', ...(await csrfHeaders()) }, body: JSON.stringify(batch) });
  if (response.status === 401 || response.status === 403) csrfToken = '';
  let body; try { body = await response.json(); } catch { throw new PortfolioApiError('The Quantara API returned an unreadable transaction-import response.', { status: response.status }); }
  if (!response.ok) throw new PortfolioApiError(body?.error?.message || 'Could not import the transaction batch.', { status: response.status, code: body?.error?.code || 'API_ERROR' });
  if (!body.portfolio || !Array.isArray(body.portfolio.transactions) || !body.import) throw new PortfolioApiError('The API did not confirm the saved transaction import.', { code: 'INVALID_RESPONSE' });
  return body;
}
export async function getMarketTicker() {
  const body = await getApiJson('/api/market-data/ticker');
  if (!Array.isArray(body?.items)) throw new PortfolioApiError('The API returned invalid ticker data.', { code: 'INVALID_RESPONSE' });
  return body;
}

export async function getMarketDataStatus() {
  const body = await getApiJson('/api/market-data/status');
  if (typeof body?.configured !== 'boolean') throw new PortfolioApiError('The API returned invalid market-data setup information.', { code: 'INVALID_RESPONSE' });
  return body;
}

export async function testLiveDataConnection() {
  const body = await getApiJson('/api/market-data/test-connection');
  if (!body?.instrument || typeof body.success !== 'boolean' || !body.errors) {
    throw new PortfolioApiError('The API returned an invalid live connection test result.', { code: 'INVALID_RESPONSE' });
  }
  return body;
}

export async function searchInstruments(query) {
  const body = await getApiJson(`/api/market-data/search?q=${encodeURIComponent(query)}`);
  if (!Array.isArray(body?.instruments)) throw new PortfolioApiError('The API returned invalid instrument search results.', { code: 'INVALID_RESPONSE' });
  return body.instruments;
}

export async function getInstrumentQuote(instrument) {
  const params = new URLSearchParams({ symbol: instrument.symbol, micCode: instrument.micCode, ...(instrument.currency ? { currency: instrument.currency } : {}), ...(instrument.exchange ? { exchange: instrument.exchange } : {}) });
  const body = await getApiJson(`/api/market-data/quote?${params}`);
  if (!body?.quote || !Number.isFinite(body.quote.price) || body.quote.symbol?.toUpperCase() !== instrument.symbol.toUpperCase() || body.quote.micCode?.toUpperCase() !== instrument.micCode.toUpperCase() || (instrument.exchange && body.quote.exchange?.toLowerCase() !== instrument.exchange.toLowerCase()) || (instrument.currency && body.quote.currency?.toUpperCase() !== instrument.currency.toUpperCase())) throw new PortfolioApiError('The API returned a quote that does not match the selected instrument listing and currency.', { code: 'INVALID_RESPONSE' });
  return body.quote;
}

export async function getInstrumentHistory(instrument) {
  const params = new URLSearchParams({ symbol: instrument.symbol, micCode: instrument.micCode, ...(instrument.currency ? { currency: instrument.currency } : {}), ...(instrument.exchange ? { exchange: instrument.exchange } : {}) });
  const body = await getApiJson(`/api/market-data/history?${params}`);
  if (!Array.isArray(body?.history?.values) || body.history.symbol?.toUpperCase() !== instrument.symbol.toUpperCase() || body.history.micCode?.toUpperCase() !== instrument.micCode.toUpperCase() || (instrument.exchange && body.history.exchange?.toLowerCase() !== instrument.exchange.toLowerCase()) || (instrument.currency && body.history.currency?.toUpperCase() !== instrument.currency.toUpperCase())) throw new PortfolioApiError('The API returned historical prices that do not match the selected instrument listing and currency.', { code: 'INVALID_RESPONSE' });
  return body.history;
}

export async function analyzeValueSeries(values, { riskFreeRate = 0.065, frequency = 'DAILY' } = {}) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/api/portfolio-analysis`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values, riskFreeRate, frequency }),
    });
  } catch { throw new PortfolioApiError('Could not reach the Quantara analytics API.'); }
  let body;
  try { body = await response.json(); }
  catch { throw new PortfolioApiError('The Quantara API returned an unreadable response.', { status: response.status, code: 'INVALID_RESPONSE' }); }
  if (!response.ok) {
    const error = body?.error;
    throw new PortfolioApiError(error?.message || 'Historical risk analysis failed.', { kind: response.status === 400 || response.status === 422 ? 'validation' : 'server', status: response.status, code: error?.code || 'API_ERROR' });
  }
  if (!body?.analysis || body.analysis.observations !== values.length) throw new PortfolioApiError('The API returned an invalid risk-analysis response.', { code: 'INVALID_RESPONSE' });
  return body.analysis;
}

/** Sends the backend's portfolio-comparison request contract without reshaping it. */
export async function analyzePortfolio(requestBody, { signal } = {}) {
  let response;
  try {
    response = await fetch(`${apiBaseUrl}/api/portfolio-comparison`, {
      method: 'POST',
      credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new PortfolioApiError('Could not reach the Quantara API. Check that the backend is running and try again.');
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new PortfolioApiError('The Quantara API returned an unreadable response.', {
      status: response.status,
      code: 'INVALID_RESPONSE',
    });
  }

  if (!response.ok) {
    const error = body?.error;
    const kind = response.status === 400 || response.status === 422 ? 'validation' : 'server';
    throw new PortfolioApiError(
      error?.message || (kind === 'validation' ? 'The portfolio input could not be analyzed.' : 'The server could not complete the analysis.'),
      { kind, status: response.status, code: error?.code || 'API_ERROR' },
    );
  }

  const analysis = body?.analysis;
  const portfolio = analysis?.portfolio;
  const hasPortfolioShape = portfolio
    && Array.isArray(portfolio.values)
    && Array.isArray(portfolio.dates)
    && portfolio.values.length === portfolio.dates.length
    && portfolio.performance
    && Array.isArray(portfolio.allocations)
    && Array.isArray(portfolio.holdingContributions);
  const hasBenchmarkShape = analysis?.benchmark == null
    ? analysis?.comparison == null
    : Array.isArray(analysis.benchmark.alignedDates)
      && Array.isArray(analysis.benchmark.alignedValues)
      && analysis.benchmark.alignedDates.length === analysis.benchmark.alignedValues.length
      && analysis.benchmark.performance
      && Array.isArray(analysis.comparison?.alignedDates)
      && analysis.comparison.alignedDates.length === analysis.benchmark.alignedDates.length;

  if (!hasPortfolioShape || !hasBenchmarkShape) {
    throw new PortfolioApiError('The Quantara API response did not include portfolio analysis.', {
      status: response.status,
      code: 'INVALID_RESPONSE',
    });
  }
  return analysis;
}
