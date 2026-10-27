const STORAGE_KEY = 'quantara.portfolios.v1';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(date, label) {
  if (!DATE_PATTERN.test(date)) throw new Error(`${label} must use YYYY-MM-DD format.`);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
}

export function normalizeTransactionDate(value, label) {
  let year; let month; let day;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dayFirst = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (iso) [, year, month, day] = iso;
  else if (dayFirst) [, day, month, year] = dayFirst;
  else throw new Error(`${label} must use YYYY-MM-DD or day-first DD-MM-YYYY format.`);
  const yearNumber = Number(year); const monthNumber = Number(month); const dayNumber = Number(day);
  const leapYear = yearNumber % 4 === 0 && (yearNumber % 100 !== 0 || yearNumber % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > monthLengths[monthNumber - 1]) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return `${year}-${month}-${day}`;
}

export function parseCsvRows(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('The CSV file is empty.');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let quoteClosed = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; quoteClosed = true; }
      else field += char;
    } else if (char === '"') {
      if (field) throw new Error('CSV contains a quote in an unquoted field.');
      quoted = true;
    } else if (char === ',') {
      row.push(field.trim()); field = ''; quoteClosed = false;
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((value) => value !== '')) rows.push(row);
      row = []; field = ''; quoteClosed = false;
    } else if (quoteClosed) {
      if (!/\s/.test(char)) throw new Error('CSV contains unexpected text after a closing quote.');
      field += char;
    } else field += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(field.trim());
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function headerIndexes(rows, expected, label) {
  if (!rows.length) throw new Error(`${label} has no header row.`);
  const headers = rows[0].map((header) => header.toLowerCase());
  if (headers.length !== expected.length || expected.some((header) => !headers.includes(header))) {
    throw new Error(`${label} must have exactly these headers: ${expected.join(', ')}.`);
  }
  return Object.fromEntries(expected.map((header) => [header, headers.indexOf(header)]));
}

export function parseBenchmarkCsv(text, name = 'User supplied benchmark') {
  const rows = parseCsvRows(text);
  const columns = headerIndexes(rows, ['date', 'value'], 'Benchmark CSV');
  const byDate = new Map();
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (row.length !== 2) throw new Error(`Benchmark CSV row ${index + 1} must contain 2 columns.`);
    const date = row[columns.date];
    const value = Number(row[columns.value]);
    validDate(date, `Benchmark CSV row ${index + 1} date`);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Benchmark CSV row ${index + 1} value must be positive and finite.`);
    if (byDate.has(date)) throw new Error(`Duplicate benchmark observation on ${date}.`);
    byDate.set(date, value);
  }
  if (!byDate.size) throw new Error('Benchmark CSV has a header but no observations.');
  return {
    name: name.trim() || 'User supplied benchmark',
    values: [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })),
  };
}

export function validatePortfolio(portfolio, { minObservations = 3 } = {}) {
  if (!portfolio || typeof portfolio !== 'object') throw new Error('Select or create a portfolio first.');
  if (!portfolio.name?.trim()) throw new Error('Enter a portfolio name.');
  if (!portfolio.currency?.trim()) throw new Error('Select a base currency.');
  if (!Array.isArray(portfolio.holdings) || !portfolio.holdings.length) throw new Error('Add at least one holding.');
  const ids = new Set();
  let referenceDates;
  for (const holding of portfolio.holdings) {
    const assetId = holding.assetId?.trim().toUpperCase();
    if (!assetId) throw new Error('Every holding needs a symbol.');
    if (ids.has(assetId)) throw new Error(`Duplicate holding symbol ${assetId}.`);
    ids.add(assetId);
    if (typeof holding.quantity !== 'number' || !Number.isFinite(holding.quantity) || holding.quantity <= 0) {
      throw new Error(`${assetId} quantity must be a positive finite number.`);
    }
    const prices = portfolio.prices?.[assetId];
    if (!Array.isArray(prices) || !prices.length) throw new Error(`Import historical prices for ${assetId}.`);
    if (prices.length < minObservations) throw new Error(`${assetId} needs at least ${minObservations} price observations; found ${prices.length}.`);
    const dates = prices.map((point) => point.date);
    for (let index = 0; index < prices.length; index++) {
      validDate(dates[index], `${assetId} observation ${index + 1} date`);
      if (!Number.isFinite(prices[index].price) || prices[index].price <= 0) {
        throw new Error(`${assetId} prices must be positive finite numbers.`);
      }
      if (index && dates[index] <= dates[index - 1]) throw new Error(`${assetId} dates must be unique and ascending.`);
    }
    if (!referenceDates) referenceDates = dates;
    else if (dates.length !== referenceDates.length || dates.some((date, index) => date !== referenceDates[index])) {
      throw new Error(`Historical dates for ${assetId} do not match the other holdings. Import complete, aligned histories; no prices are filled in.`);
    }
  }
  return true;
}

export function buildAnalysisRequest(portfolio, { riskFreeRate = portfolio.riskFreeRate ?? 0.065, frequency = portfolio.frequency ?? 'DAILY' } = {}) {
  validatePortfolio(portfolio);
  const request = {
    holdings: portfolio.holdings.map(({ assetId, quantity }) => {
      const symbol = assetId.trim().toUpperCase();
      return { assetId: symbol, quantity, prices: portfolio.prices[symbol].map(({ date, price }) => ({ date, price })) };
    }),
    riskFreeRate,
    frequency,
  };
  if (portfolio.benchmark?.values?.length) {
    request.benchmark = {
      name: portfolio.benchmark.name || 'User supplied benchmark',
      values: portfolio.benchmark.values.map(({ date, value }) => ({ date, value })),
    };
  }
  return request;
}

export function readPortfolios(storage = globalThis.localStorage) {
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

export function writePortfolios(portfolios, storage = globalThis.localStorage) {
  if (!storage) return false;
  try { storage.setItem(STORAGE_KEY, JSON.stringify(portfolios)); return true; }
  catch { return false; }
}

export function createExamplePortfolio(sampleRequest, { id = `sample-${Date.now()}` } = {}) {
  return {
    id,
    name: 'Illustrative sample portfolio',
    currency: 'USD',
    riskFreeRate: 0.065,
    frequency: 'DAILY',
    isExample: true,
    holdings: sampleRequest.holdings.map(({ assetId, quantity }) => ({ assetId, name: assetId, quantity })),
    prices: Object.fromEntries(sampleRequest.holdings.map(({ assetId, prices }) => [assetId, prices.map((point) => ({ ...point }))])),
    benchmark: { name: 'Illustrative sample benchmark', values: sampleRequest.benchmark.values.map((point) => ({ ...point })) },
  };
}


