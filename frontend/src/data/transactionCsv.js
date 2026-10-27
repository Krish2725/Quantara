import { normalizeTransactionDate, parseCsvRows } from './portfolioData.js';

const ALIASES = {
  date: ['date', 'transaction_date', 'trade_date', 'purchase_date'],
  symbol: ['symbol', 'ticker', 'stock', 'instrument'],
  type: ['type', 'side', 'transaction_type', 'action'],
  quantity: ['quantity', 'qty', 'shares', 'units'],
  price: ['price', 'unit_price', 'purchase_price', 'execution_price'],
  fees: ['fees', 'fee', 'commission'],
};
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,39}$/;

function parseNumber(value, label, { positive = false } = {}) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) throw new Error(`${label} must be a plain finite number.`);
  const number = Number(value);
  if (!Number.isFinite(number) || (positive ? number <= 0 : number < 0)) throw new Error(`${label} must be a ${positive ? 'positive' : 'non-negative'} finite number.`);
  return number;
}

export function parseInvestmentCsv(text) {
  const sourceRows = parseCsvRows(text);
  if (!sourceRows.length) throw new Error('Investment CSV has no header row.');
  const headers = sourceRows[0].map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  const columns = {};
  const unknown = [];
  headers.forEach((header, index) => {
    const field = Object.keys(ALIASES).find((key) => ALIASES[key].includes(header));
    if (!field) { unknown.push(header || `column ${index + 1}`); return; }
    if (columns[field] != null) throw new Error(`Investment CSV has more than one column for ${field}. Keep only one recognized ${field} header.`);
    columns[field] = index;
  });
  const required = ['date', 'symbol', 'type', 'quantity', 'price'];
  const missing = required.filter((field) => columns[field] == null);
  if (missing.length) throw new Error(`Investment CSV is missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Recognized common header variants are accepted.`);
  if (unknown.length) throw new Error(`Investment CSV contains unsupported column${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. Remove them or use the documented transaction columns.`);
  const rows = sourceRows.slice(1).map((source, index) => {
    const rowNumber = index + 2;
    const errors = [];
    if (source.length !== headers.length) errors.push(`Expected ${headers.length} columns, found ${source.length}.`);
    let date = '';
    let symbol = '';
    let type = '';
    let quantity = null;
    let unitPrice = null;
    let fees = 0;
    try { date = normalizeTransactionDate(source[columns.date] || '', `Row ${rowNumber} date`); } catch (error) { errors.push(error.message); }
    symbol = String(source[columns.symbol] || '').trim().toUpperCase();
    if (!symbol) errors.push(`Row ${rowNumber} symbol is required.`);
    else if (!SYMBOL_PATTERN.test(symbol)) errors.push(`Row ${rowNumber} symbol contains unsupported characters.`);
    type = String(source[columns.type] || '').trim().toUpperCase();
    if (!['BUY', 'SELL'].includes(type)) errors.push(`Row ${rowNumber} type must be BUY or SELL.`);
    try { quantity = parseNumber(source[columns.quantity] || '', `Row ${rowNumber} quantity`, { positive: true }); } catch (error) { errors.push(error.message); }
    try { unitPrice = parseNumber(source[columns.price] || '', `Row ${rowNumber} price`, { positive: true }); } catch (error) { errors.push(error.message); }
    if (columns.fees != null) {
      try { fees = parseNumber(source[columns.fees] ?? '', `Row ${rowNumber} fees`); } catch (error) { errors.push(error.message); }
    }
    const grossAmount = Number.isFinite(quantity) && Number.isFinite(unitPrice) ? quantity * unitPrice : null;
    if (grossAmount != null && !Number.isFinite(grossAmount)) errors.push(`Row ${rowNumber} gross amount is outside the supported numeric range.`);
    const netCashAmount = grossAmount == null || !Number.isFinite(fees) ? null : type === 'SELL' ? grossAmount - fees : -(grossAmount + fees);
    return { rowNumber, date, sourceDate: source[columns.date] || '', symbol, type, quantity, unitPrice, fees, grossAmount, netCashAmount, errors };
  }).filter((row) => row.rowNumber <= sourceRows.length);
  if (!rows.length) throw new Error('Investment CSV has a valid header but no transaction rows.');
  const validRows = rows.filter((row) => !row.errors.length);
  const stats = {
    totalRows: rows.length, validRows: validRows.length, invalidRows: rows.length - validRows.length,
    symbols: [...new Set(validRows.map((row) => row.symbol))].sort(),
    grossAmount: validRows.reduce((sum, row) => sum + (row.grossAmount || 0), 0),
    estimatedCashEffect: validRows.reduce((sum, row) => sum + (row.netCashAmount || 0), 0),
  };
  return { rows, stats, columns: Object.keys(columns) };
}
