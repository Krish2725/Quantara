import { useMemo, useState } from 'react';
import { parseInvestmentCsv } from '../data/transactionCsv.js';
import { validateLedger } from '../data/ledger.js';

const primary = 'inline-flex items-center justify-center rounded-lg bg-[#256b59] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d5849] disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50';
function money(value, currency) {
  if (!Number.isFinite(value)) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${value.toFixed(2)} ${currency}`; }
}
function identityKey(instrument) { return `${instrument.micCode}:${instrument.symbol}`; }

export default function TransactionImportPanel({ existingTransactions, baseCurrency, onResolveSymbols, onSubmitBatch, disabled = false }) {
  const [preview, setPreview] = useState(null);
  const [instrumentOptions, setInstrumentOptions] = useState({});
  const [selectedInstruments, setSelectedInstruments] = useState({});
  const [loadingFile, setLoadingFile] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [requestId, setRequestId] = useState('');

  async function selectFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setPreview(null); setFeedback(null); setRequestId(''); setInstrumentOptions({}); setSelectedInstruments({});
    setLoadingFile(true);
    try {
      if (file.size > 512 * 1024) throw new Error('CSV must be no larger than 512 KB.');
      const parsed = parseInvestmentCsv(await file.text());
      if (parsed.rows.length > 500) throw new Error('A transaction import can contain at most 500 rows. Split larger files into separate imports.');
      setPreview({ ...parsed, fileName: file.name });
      if (parsed.stats.invalidRows) { setFeedback({ tone: 'error', text: `${parsed.stats.invalidRows} row${parsed.stats.invalidRows === 1 ? '' : 's'} need correction. No rows can be imported until the entire file is valid.` }); return; }
      const instrumentMap = new Map();
      for (const transaction of existingTransactions) {
        const item = transaction.instrument;
        if (!parsed.stats.symbols.includes(item.symbol.toUpperCase())) continue;
        const key = identityKey(item); instrumentMap.set(key, item);
      }
      const resolved = {};
      const needsSearch = [];
      for (const symbol of parsed.stats.symbols) {
        const matches = [...instrumentMap.values()].filter((item) => item.symbol.toUpperCase() === symbol);
        if (matches.length === 1) resolved[symbol] = matches[0];
        else needsSearch.push(symbol);
      }
      setSelectedInstruments(resolved);
      if (needsSearch.length) {
        setResolving(true);
        try {
          const candidates = await onResolveSymbols(needsSearch);
          setInstrumentOptions(candidates);
          setSelectedInstruments((current) => ({ ...current, ...Object.fromEntries(needsSearch.filter((symbol) => candidates[symbol]?.length === 1).map((symbol) => [symbol, candidates[symbol][0]])) }));
          const unavailable = needsSearch.filter((symbol) => !candidates[symbol]?.length);
          setFeedback(unavailable.length ? { tone: 'error', text: `Could not resolve a provider-verified stock listing for ${unavailable.join(', ')}. Correct the symbol or configure market-data search. No rows have been imported.` } : { tone: 'info', text: 'Review the exact exchange and currency listing for each new or ambiguous symbol before importing.' });
        } catch (error) { setFeedback({ tone: 'error', text: error.message }); }
        finally { setResolving(false); }
      } else setFeedback({ tone: 'info', text: 'Review the validated transactions below. Nothing is saved until you confirm.' });
    } catch (error) { setFeedback({ tone: 'error', text: error.message }); }
    finally { setLoadingFile(false); }
  }

  const rows = preview?.rows || [];
  const unresolvedSymbols = preview?.stats.symbols.filter((symbol) => !selectedInstruments[symbol]) || [];
  const sequenceError = useMemo(() => {
    if (!preview || preview.stats.invalidRows || unresolvedSymbols.length) return '';
    const now = Date.now();
    const proposed = rows.map((row, index) => ({ id: `preview-import-${index + 1}`, type: row.type, date: row.date,
      createdAt: new Date(now + index).toISOString(), instrument: selectedInstruments[row.symbol], quantity: row.quantity,
      unitPrice: row.unitPrice, fees: row.fees }));
    try { validateLedger({ version: 1, config: { baseCurrency }, transactions: [...existingTransactions, ...proposed] }); return ''; }
    catch (error) { return error.message; }
  }, [preview, rows, unresolvedSymbols.join(','), selectedInstruments, existingTransactions, baseCurrency]);
  const canConfirm = Boolean(preview && preview.stats.invalidRows === 0 && unresolvedSymbols.length === 0 && !sequenceError && !loadingFile && !resolving && !submitting && !disabled);

  async function confirmImport() {
    if (!canConfirm) return;
    const id = requestId || globalThis.crypto?.randomUUID?.();
    if (!id) { setFeedback({ tone: 'error', text: 'This browser could not create a secure import identifier. Reload and try again.' }); return; }
    setRequestId(id);
    const now = Date.now();
    const proposed = rows.map((row, index) => ({
      id: `import-${id}-${index + 1}`, type: row.type, date: row.date, createdAt: new Date(now + index).toISOString(),
      instrument: selectedInstruments[row.symbol], quantity: row.quantity, unitPrice: row.unitPrice, fees: row.fees,
      source: 'import', importBatchId: id, importRowNumber: row.rowNumber,
    }));
    try { validateLedger({ version: 1, config: { baseCurrency }, transactions: [...existingTransactions, ...proposed] }); }
    catch (error) { setFeedback({ tone: 'error', text: `Batch rejected before saving: ${error.message}. The ledger is unchanged.` }); return; }
    setSubmitting(true);
    try {
      const result = await onSubmitBatch({ importId: id, baseCurrency, transactions: rows.map((row) => ({
        rowNumber: row.rowNumber, date: row.date, symbol: row.symbol, type: row.type, quantity: row.quantity,
        unitPrice: row.unitPrice, fees: row.fees, instrument: selectedInstruments[row.symbol],
      })) });
      setFeedback({ tone: 'success', text: result.duplicate ? `This confirmed import was already processed. ${result.rowCount} transactions are present; no duplicates were created.` : `Imported ${result.rowCount} transaction${result.rowCount === 1 ? '' : 's'} for ${result.symbols.join(', ')} (${result.dateRange}). Holdings and portfolio analytics have been refreshed from the saved ledger.` });
      if (!result.duplicate) setPreview(null);
      setRequestId('');
    } catch (error) { setFeedback({ tone: 'error', text: `${error.message} The request identifier was retained; use Retry save to safely retry the same batch.` }); }
    finally { setSubmitting(false); }
  }

  function toneClass(tone) { return tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-[#d9e9e2] bg-[#f0f7f3] text-[#46675d]'; }
  return <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card" aria-labelledby="transaction-import-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="transaction-import-title" className="section-title">Import Investment Transactions</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">This is Quantara’s only CSV import. Upload actual past BUY/SELL transactions; the price column is each trade’s execution price. Confirmed rows become append-only ledger records and affect holdings and P/L.</p></div><label className={`${secondary} cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}>{loadingFile ? 'Reading CSV…' : 'Choose transaction CSV'}<input className="sr-only" type="file" accept=".csv,text/csv" onChange={selectFile} disabled={disabled || loadingFile || submitting}/></label></div>
    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">Required columns: <code>date,symbol,type,quantity,price</code>; optional <code>fees</code>. Also accepts common Excel headers such as transaction_date, ticker, side, qty, unit_price, and commission. Dates: YYYY-MM-DD or DD-MM-YYYY. Symbols must resolve to one exact stock listing, and the full batch is validated before saving.</p>
    {feedback && <div role={feedback.tone === 'error' ? 'alert' : 'status'} className={`mt-3 rounded-lg border p-3 text-xs leading-5 ${toneClass(feedback.tone)}`}>{feedback.text}</div>}
    {preview && <>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5 text-xs"><div className="rounded-lg bg-slate-50 p-3">File<strong className="mt-1 block break-all">{preview.fileName}</strong></div><div className="rounded-lg bg-slate-50 p-3">Rows<strong className="mt-1 block">{preview.stats.totalRows} total · {preview.stats.validRows} valid · {preview.stats.invalidRows} invalid</strong></div><div className="rounded-lg bg-slate-50 p-3">Symbols<strong className="mt-1 block">{preview.stats.symbols.join(', ') || '—'}</strong></div><div className="rounded-lg bg-slate-50 p-3">Gross transaction amount<strong className="mt-1 block">{money(preview.stats.grossAmount, baseCurrency)}</strong></div><div className="rounded-lg bg-slate-50 p-3">Estimated net cash effect<strong className="mt-1 block">{money(preview.stats.estimatedCashEffect, baseCurrency)}</strong></div></div>
      {Object.keys(instrumentOptions).length > 0 && <div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(instrumentOptions).map(([symbol, options]) => <label key={symbol} className="text-xs font-semibold text-slate-700">Select exact listing for {symbol}<select className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs" value={selectedInstruments[symbol] ? identityKey(selectedInstruments[symbol]) : ''} onChange={(event) => setSelectedInstruments((current) => ({ ...current, [symbol]: options.find((item) => identityKey(item) === event.target.value) }))}><option value="">Choose exchange and currency</option>{options.map((item) => <option key={identityKey(item)} value={identityKey(item)}>{item.name} · {item.exchange} ({item.micCode}) · {item.currency}</option>)}</select></label>)}</div>}
      {unresolvedSymbols.length > 0 && !Object.keys(instrumentOptions).length && <p className="mt-3 text-xs text-amber-800">Listing identity is required for: {unresolvedSymbols.join(', ')}. Configure provider search or add the symbol through the normal instrument-selection workflow first.</p>}
      <div className="mt-3 overflow-x-auto"><table className="min-w-[1050px] w-full text-left text-xs"><thead className="table-head"><tr><th>Row</th><th>Date</th><th>Symbol / listing</th><th>Type</th><th>Quantity</th><th>Unit price</th><th>Fees</th><th>Gross</th><th>Estimated cash effect</th><th>Validation</th></tr></thead><tbody>{rows.map((row) => { const instrument = selectedInstruments[row.symbol]; const status = row.errors.length ? row.errors.join(' ') : !instrument ? 'Select an exact listing.' : 'Valid'; const invalid = row.errors.length > 0; return <tr key={row.rowNumber} className="table-row"><td>{row.rowNumber}</td><td>{row.date || row.sourceDate || '—'}</td><td><strong>{row.symbol || '—'}</strong>{instrument && <div className="text-[10px] text-slate-500">{instrument.exchange} ({instrument.micCode}) · {instrument.currency}</div>}</td><td>{row.type || '—'}</td><td>{Number.isFinite(row.quantity) ? row.quantity : '—'}</td><td>{money(row.unitPrice, baseCurrency)}</td><td>{money(row.fees, baseCurrency)}</td><td>{money(row.grossAmount, baseCurrency)}</td><td>{money(row.netCashAmount, baseCurrency)}</td><td className={invalid || !instrument ? 'text-rose-700' : 'text-emerald-800'}>{status}</td></tr>; })}</tbody></table></div>
      {sequenceError && <p role="alert" className="mt-2 text-xs text-rose-700">Chronological ledger validation failed: {sequenceError}. A SELL cannot use shares from a later BUY; no transactions have been imported.</p>}
      {preview.stats.invalidRows > 0 && <p className="mt-2 text-xs text-rose-700">Correct the source file and select it again. Invalid imports are atomic; there is no option to silently omit rows.</p>}
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={primary} disabled={!canConfirm} onClick={confirmImport}>{submitting ? 'Saving batch…' : requestId ? 'Retry save' : 'Confirm and import transactions'}</button><button type="button" className={secondary} disabled={submitting} onClick={() => { setPreview(null); setRequestId(''); setFeedback({ tone: 'info', text: 'Import cancelled. No transactions were changed.' }); }}>Cancel preview</button></div>
    </>}
  </section>;
}
