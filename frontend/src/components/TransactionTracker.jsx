
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sidebar } from './DashboardComponents.jsx';
import { createEmptyLedger, currencyMismatchMessage, derivePortfolio, validateLedger, valuePortfolio, writeLedger, readLedger, deserializePersistedLedger, isProviderEligibleInstrument, markProviderQuoteVerified, LEDGER_STORAGE_KEY } from '../data/ledger.js';
import { samplePortfolioRequest } from '../data/samplePortfolio.js';
import { analyzeValueSeries, getInstrumentHistory, getInstrumentQuote, getMarketDataStatus, searchInstruments, testLiveDataConnection } from '../services/portfolioApi.js';
import { formatDate, formatNumber, formatPercent, formatSharpe } from '../utils/format.js';
import MarketTicker from './MarketTicker.jsx';
import { getPersistedPortfolio, importPersistedTransactions, savePersistedPortfolio } from '../services/portfolioApi.js';
import { refreshPortfolioMarketData } from '../services/portfolioMarketRefresh.js';
import { describeMaximumDrawdown, prepareRiskObservations } from '../data/riskSeries.js';
import PriceHistoryChart from './PriceHistoryChart.jsx';
import ThemeToggle from './ThemeToggle.jsx';
import DrawdownChart from './DrawdownChart.jsx';
import OverviewHistoryChart from './OverviewHistoryChart.jsx';
import { calculatePortfolioHealth } from '@quantara/analytics';
import PortfolioHealthPanel from './PortfolioHealthPanel.jsx';
import TransactionImportPanel from './TransactionImportPanel.jsx';

const pages = [['overview','Overview'],['holdings','Investments'],['transactions','Transactions'],['risk','Risk analysis']];
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#78a996] focus:ring-2 focus:ring-[#78a996]/15';
const primary = 'inline-flex items-center justify-center rounded-lg bg-[#256b59] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d5849] disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-[#9ab8ab] disabled:opacity-50';
function keyOf(instrument) { return `${instrument.micCode}:${instrument.symbol}`; }
function accountStorage(userId) {
  const key = `quantara.transaction-ledger.user.${encodeURIComponent(String(userId))}.v1`;
  return { getItem: () => globalThis.localStorage?.getItem(key) ?? null, setItem: (_name, value) => globalThis.localStorage?.setItem(key, value) };
}
function money(value, currency) { if (!Number.isFinite(value)) return '—'; try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); } catch { return `${formatNumber(value)} ${currency}`; } }
function timestamp(value) { if (!value) return 'Provider timestamp unavailable'; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
function Notice({ tone = 'info', children }) { const color = tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-[#d9e9e2] bg-[#f0f7f3] text-[#46675d]'; return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm leading-6 ${color}`}>{children}</div>; }
function Metric({ title, value, detail, tone }) { return <article className="metric-card rounded-2xl border border-line bg-white p-5 shadow-card"><div className="text-xs font-medium text-slate-500">{title}</div><div className={`mt-3 break-words text-xl font-semibold ${tone === 'positive' ? 'text-[#256b59]' : tone === 'negative' ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div><p className="mt-2 text-[11px] leading-4 text-slate-500">{detail}</p></article>; }
function demoData() {
  const specs = [
    ['ORBT','Orbit Systems',8,152,169], ['NOVA','Nova Materials',12,84,95], ['PINE','Pinecrest Group',5,210,222],
  ];
  const dates = samplePortfolioRequest.holdings[0].prices.map((x) => x.date);
  const transactions = specs.map(([symbol,name,quantity,unitPrice]) => ({ id: `demo-${symbol}`, type: 'BUY', date: dates[0], createdAt: `${dates[0]}T10:00:00Z`, instrument: { symbol, name, exchange: 'Illustrative market', micCode: 'SAMP', currency: 'USD', country: 'Synthetic example', type: 'Common Stock' }, quantity, unitPrice, fees: 0, example: true }));
  const quotes = Object.fromEntries(specs.map(([symbol,name,, ,price]) => [`SAMP:${symbol}`, { symbol, name, exchange: 'Illustrative market', micCode: 'SAMP', currency: 'USD', price, previousClose: null, quoteTimestamp: null, isMarketOpen: null, source: 'Illustrative demo data (not a provider quote)' }]));
  const histories = Object.fromEntries(samplePortfolioRequest.holdings.map((h) => [`SAMP:${h.assetId}`, { values: h.prices }]));
  return { ledger: { ...createEmptyLedger(), config: { ...createEmptyLedger().config, baseCurrency: 'USD', demoMode: true }, transactions }, quotes, histories };
}

export default function TransactionTracker({ user, onLogout }) {
  const [ledger, setLedger] = useState(() => createEmptyLedger());
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [persistenceState, setPersistenceState] = useState('loading');
  const [migrationNotice, setMigrationNotice] = useState('');
  const [importAvailable, setImportAvailable] = useState(false);
  const [importSource, setImportSource] = useState('');
  const [page, setPage] = useState('overview');
  const [transactionFormOpen, setTransactionFormOpen] = useState(false);
  const [allowSell, setAllowSell] = useState(false);
  const [provider, setProvider] = useState(null);
  const [quotes, setQuotes] = useState(() => ({}));
  const [providerHistories, setProviderHistories] = useState(() => ({}));
  const [marketErrors, setMarketErrors] = useState({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [connectionTest, setConnectionTest] = useState(null);
  const [connectionTestError, setConnectionTestError] = useState('');
  const [connectionTestLoading, setConnectionTestLoading] = useState(false);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [searchText, setSearchText] = useState(''); const [searchResults, setSearchResults] = useState([]); const [searching, setSearching] = useState(false);
  const [instrument, setInstrument] = useState(null); const [transactionType, setTransactionType] = useState('BUY');
  const [date, setDate] = useState(localDate); const [quantity, setQuantity] = useState(''); const [unitPrice, setUnitPrice] = useState(''); const [fees, setFees] = useState('0');
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [riskSymbol, setRiskSymbol] = useState(''); const [riskSummary, setRiskSummary] = useState(null); const [riskBusy, setRiskBusy] = useState(false);
  const [riskFreeRatePct, setRiskFreeRatePct] = useState('6.5'); const [annualizationFactor, setAnnualizationFactor] = useState('252');
  const fetchedKey = useRef('');
  const saveSequence = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const derived = useMemo(() => { try { return valuePortfolio(ledger, quotes); } catch { return { holdings: [], transactions: [], marketValue: null, openCostBasis: 0, unrealizedPnl: null, realizedPnl: 0, totalBuyCost: 0 }; } }, [ledger, quotes]);
  const histories = providerHistories;
  const historyInstruments = useMemo(() => derived.holdings.filter((holding) => holding.quantity > 0).map((holding) => holding.instrument), [derived.holdings]);
  const instrumentKeys = historyInstruments.map(keyOf).sort();
  const providerInstrumentKeys = historyInstruments.filter(isProviderEligibleInstrument).map(keyOf).sort();
  const currentHolding = instrument ? derived.holdings.find((x) => keyOf(x.instrument) === keyOf(instrument)) : null;
  const availableQuantity = currentHolding?.quantity || 0;
  const dailyChange = derived.holdings.every((x) => x.quantity === 0 || x.quote?.previousClose != null)
    ? derived.holdings.reduce((sum, x) => sum + (x.quantity > 0 ? x.quantity * (x.quote.price - x.quote.previousClose) : 0), 0) : null;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await getPersistedPortfolio();
        if (!active) return;
        const local = deserializePersistedLedger(readLedger(accountStorage(user?.id)));
        const legacy = deserializePersistedLedger(readLedger());
        const legacyClaimed = globalThis.localStorage?.getItem('quantara.legacy-ledger-claimed.v1') === 'true';
        if (result.portfolio) {
          setLedger(deserializePersistedLedger(result.portfolio));
          const legacyCopyExists = !legacyClaimed && legacy.transactions.length > 0;
          if (legacyCopyExists) globalThis.localStorage?.setItem('quantara.legacy-ledger-claimed.v1', 'true');
          setMigrationNotice(local.transactions.length ? 'A recoverable backup for this account exists. The server portfolio was loaded; no merge was made.' : legacyCopyExists ? 'Your older browser portfolio remains stored locally. This account already has a portfolio, so no import or merge was made.' : 'Portfolio loaded from your account.');
        } else {
          const source = local.transactions.length ? 'account' : !legacyClaimed && legacy.transactions.length ? 'legacy' : '';
          const candidate = source === 'account' ? local : source === 'legacy' ? legacy : null;
          if (source === 'legacy') globalThis.localStorage?.setItem('quantara.legacy-ledger-claimed.v1', 'true');
          setLedger(createEmptyLedger());
          setImportSource(source); setImportAvailable(Boolean(candidate));
          setMigrationNotice(candidate ? 'A local portfolio is available. Review and import it into this account when ready.' : 'This account has no saved portfolio yet.');
        }
        setPersistenceState('saved');
      } catch (e) {
        if (active) setPersistenceState('error');
      } finally { if (active) setPersistenceReady(true); }
    })();
    return () => { active = false; };
  }, []);
  async function importLocalPortfolio() {
    try {
      const local = deserializePersistedLedger(readLedger(importSource === 'account' ? accountStorage(user?.id) : undefined));
      validateLedger(local);
      if (!local.transactions.length) { setImportAvailable(false); setMigrationNotice('No local transactions were found to import.'); return; }
      writeLedger(local, accountStorage(user?.id));
      const sequence = ++saveSequence.current;
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => savePersistedPortfolio(local));
      await saveQueue.current;
      if (sequence !== saveSequence.current) return;
      if (importSource === 'legacy') globalThis.localStorage?.removeItem(LEDGER_STORAGE_KEY);
      setLedger(local); setImportAvailable(false); setMigrationNotice('Local portfolio imported into this account. A recoverable browser backup remains available.'); setPersistenceState('saved');
    } catch (failure) { setMigrationNotice(`Import failed: ${failure.message}`); }
  }
  useEffect(() => {
    if (!persistenceReady || ledger.config.demoMode) return;
    writeLedger(ledger, accountStorage(user?.id)); // user-scoped recoverable browser backup; server is authoritative
    const sequence = ++saveSequence.current;
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => savePersistedPortfolio(ledger));
    saveQueue.current.then(() => {
      if (sequence !== saveSequence.current) return;
      setPersistenceState('saved');
    }).catch(() => {
      if (sequence !== saveSequence.current) return;
      setPersistenceState('error');
    });
    setPersistenceState('saving');
  }, [ledger, persistenceReady, user?.id]);
  useEffect(() => {
    let active = true;
    getMarketDataStatus().then((status) => { if (active) setProvider(status); }).catch((e) => { if (active) setProvider({ configured: false, setupMessage: e.message }); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (ledger.config.demoMode) { const demo = demoData(); setQuotes(demo.quotes); setProviderHistories(demo.histories); return; }
    if (!provider?.configured || providerInstrumentKeys.length === 0 || fetchedKey.current === providerInstrumentKeys.join(',')) return;
    const signature = providerInstrumentKeys.join(','); fetchedKey.current = signature;
    let active = true;
    (async () => {
      setLoadingQuotes(true);
      await refreshPortfolioMarketData(derived.holdings, {
        getQuote: getInstrumentQuote,
        getHistory: getInstrumentHistory,
        isActive: () => active,
        onQuote: (key, item, quote) => {
          setQuotes((current) => ({ ...current, [key]: quote }));
          if (item.verification === 'legacy-unverified') setLedger((current) => markProviderQuoteVerified(current, item));
        },
        onHistory: (key, history) => setProviderHistories((current) => ({ ...current, [key]: history })),
        onError: (key, type, error) => setMarketErrors((current) => ({ ...current, [type === 'history' ? `${key}:history` : key]: error.message })),
      });
      if (active) setLoadingQuotes(false);
    })();
    return () => { active = false; if (fetchedKey.current === signature) fetchedKey.current = ''; };
  }, [provider?.configured, providerInstrumentKeys.join(','), ledger.config.demoMode]);

  async function search(event) {
    event?.preventDefault(); setError(''); setMessage(''); setSearchResults([]);
    if (!provider?.configured) { setError('Market-data API key is not configured. Add TWELVE_DATA_API_KEY to backend/.env. Use the labeled illustrative demo to explore without market data.'); return; }
    if (searchText.trim().length < 2) { setError('Enter at least two characters to search.'); return; }
    setSearching(true);
    try { const results = await searchInstruments(searchText.trim()); setSearchResults(results); if (!results.length) setMessage('No matches. Try a company name or ticker.'); else setMessage('Choose the exact exchange and currency from results before recording a trade.'); }
    catch (e) { setError(e.message); }
    finally { setSearching(false); }
  }
  async function runConnectionTest() {
    setConnectionTestLoading(true); setConnectionTestError(''); setConnectionTest(null);
    try { setConnectionTest(await testLiveDataConnection()); }
    catch (e) { setConnectionTestError(e.message); }
    finally { setConnectionTestLoading(false); }
  }
  async function resolveTransactionImportSymbols(symbols) {
    if (!provider?.configured) throw new Error('Configure Twelve Data search before importing transactions for symbols not already in this account.');
    const candidates = {};
    for (const symbol of symbols) {
      const results = await searchInstruments(symbol);
      candidates[symbol] = results.filter((item) => item.symbol?.trim().toUpperCase() === symbol
        && item.verification === 'provider-search' && /^[A-Z0-9]{4}$/.test(item.micCode || '')
        && /^[A-Z]{3}$/i.test(item.currency || '') && item.exchange && item.name && /stock/i.test(item.type || ''));
    }
    return candidates;
  }
  async function submitTransactionImport(batch) {
    await saveQueue.current.catch(() => {});
    const result = await importPersistedTransactions(batch);
    const restored = deserializePersistedLedger(result.portfolio);
    setLedger(restored);
    setRiskSummary(null);
    setMessage(result.import.duplicate
      ? `This confirmed transaction import was already processed; ${result.import.rowCount} saved rows were reused.`
      : `Imported ${result.import.rowCount} transaction${result.import.rowCount === 1 ? '' : 's'} for ${result.import.symbols.join(', ')}. The saved ledger, holdings, quotes and analytics are refreshing.`);
    setPage('transactions');
    return result.import;
  }
  function selectInstrument(item) {
    setInstrument(item); setSearchResults([]); setError(''); setMessage(''); setUnitPrice('');
    if (!item || !provider?.configured || !isProviderEligibleInstrument(item)) return;
    fetchQuote(item);
  }
  async function fetchQuote(item) {
    const key = keyOf(item);
    if (!isProviderEligibleInstrument(item)) { setMarketErrors((current) => ({ ...current, [key]: 'Live quote skipped: this instrument was entered manually or lacks a valid provider listing identity.' })); return; }
    setMarketErrors((current) => { const next = { ...current }; delete next[key]; return next; });
    setQuoteLoading(true);
    try {
      const quote = await getInstrumentQuote(item);
      setQuotes((current) => ({ ...current, [key]: quote }));
      if (item.verification === 'legacy-unverified') setLedger((current) => markProviderQuoteVerified(current, item));
    }
    catch (e) { setMarketErrors((current) => ({ ...current, [key]: e.message })); }
    finally { setQuoteLoading(false); }
  }
  async function refreshInstrument(item) {
    const key = keyOf(item);
    if (!isProviderEligibleInstrument(item)) { setMarketErrors((current) => ({ ...current, [key]: 'Live quote skipped: this instrument was entered manually or lacks a valid provider listing identity.' })); return; }
    setMarketErrors((current) => { const next = { ...current }; delete next[key]; delete next[`${key}:history`]; return next; });
    const results = await Promise.allSettled([getInstrumentQuote(item), getInstrumentHistory(item)]);
    if (results[0].status === 'fulfilled') {
      setQuotes((current) => ({ ...current, [key]: results[0].value }));
      if (item.verification === 'legacy-unverified') setLedger((current) => markProviderQuoteVerified(current, item));
    }
    else setMarketErrors((current) => ({ ...current, [key]: results[0].reason.message }));
    if (results[1].status === 'fulfilled') setProviderHistories((current) => ({ ...current, [key]: results[1].value }));
    else setMarketErrors((current) => ({ ...current, [`${key}:history`]: results[1].reason.message }));
  }
  function saveTransaction(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (!instrument) { setError('Search and select an instrument and exchange first.'); return; }
    const transaction = { id: globalThis.crypto?.randomUUID?.() || `txn-${Date.now()}`, type: transactionType, date, createdAt: new Date().toISOString(), instrument, quantity: Number(quantity), unitPrice: Number(unitPrice), fees: Number(fees || 0) };
    const next = { ...ledger, transactions: [...ledger.transactions, transaction] };
    try { validateLedger(next); }
    catch (e) { setError(e.message); return; }
    setLedger(next); setMessage(`${transactionType} transaction saved. ${isProviderEligibleInstrument(instrument) ? 'Fetching current quote and daily history…' : 'Cost basis is saved; current valuation is unavailable because the instrument listing is not provider-verified.'}`); setPage('transactions'); setTransactionFormOpen(false);
    if (provider?.configured && isProviderEligibleInstrument(instrument)) refreshInstrument(instrument).then(() => setMessage('Transaction saved. Quote and history requests finished; see timestamps and any provider errors in Holdings.'));
    setQuantity(''); setFees('0');
  }
  function openInvestment(item = null) {
    setPage('transactions'); setTransactionFormOpen(true); setAllowSell(false); setTransactionType('BUY');
    setInstrument(null); setSearchText(''); setSearchResults([]); setQuantity(''); setUnitPrice(''); setFees('0');
    if (item) selectInstrument(item);
  }
  function openTransactionForm() {
    setPage('transactions'); setTransactionFormOpen(true); setAllowSell(true); setTransactionType('BUY');
    setInstrument(null); setSearchText(''); setSearchResults([]); setQuantity(''); setUnitPrice(''); setFees('0');
  }
  function closeTransactionForm() { setTransactionFormOpen(false); setError(''); }
  function loadDemo() { const demo = demoData(); setLedger(demo.ledger); setQuotes(demo.quotes); setProviderHistories(demo.histories); setPage('overview'); setMessage('Illustrative demo loaded. Every shown quote and price is synthetic, not live or provider-supplied.'); setError(''); }
  function clearDemo() { if (!globalThis.confirm?.('Clear the illustrative demo ledger from this browser?')) return; const empty = createEmptyLedger(); setLedger(empty); setQuotes({}); setProviderHistories({}); setRiskSummary(null); setMessage('Demo ledger cleared.'); }
  function setBaseCurrency(currency) { if (ledger.transactions.length && currency !== ledger.config.baseCurrency) { setError('Base currency is locked after the first transaction because FX conversion is not implemented.'); return; } setLedger((x) => ({ ...x, config: { ...x.config, baseCurrency: currency } })); }
  async function runRisk() {
    const riskFreeRate = Number(riskFreeRatePct) / 100;
    const frequency = Number(annualizationFactor);
    if (!riskFreeRatePct.trim() || !annualizationFactor.trim() || !Number.isFinite(riskFreeRate) || riskFreeRate <= -1 || !Number.isFinite(frequency) || frequency <= 0) {
      setError('Enter a finite annual risk-free rate greater than -100% and a positive number of observations per year.');
      return;
    }
    const availableKeys = instrumentKeys.filter((x) => histories[x]?.values?.length >= 3);
    const requestedKey = instrumentKeys.includes(riskSymbol) ? riskSymbol : null;
    if (requestedKey && (histories[requestedKey]?.values?.length || 0) < 3) {
      const requestedHistory = histories[requestedKey];
      setError(`${requestedKey.split(':').slice(1).join(':')} ${'provider history'} has ${requestedHistory?.values?.length || 0} observations; risk analysis requires at least three. The selected dataset was not replaced.`);
      return;
    }
    const key = requestedKey || availableKeys[0];
    if (!key || !histories[key]?.values?.length) {
      const historyError = key ? marketErrors[`${key}:history`] : '';
      setError(!provider?.configured
        ? 'No provider history is available. Configure TWELVE_DATA_API_KEY on the backend.'
        : historyError || 'Select an instrument with at least three dated daily prices before calculating risk.');
      return;
    }
    let observations;
    try { observations = prepareRiskObservations(histories[key].values); }
    catch (failure) { setRiskSummary(null); setError(failure.message); return; }
    setRiskBusy(true); setError(''); setRiskSummary(null);
    try {
      const summary = await analyzeValueSeries(observations.map((x) => x.price), { riskFreeRate, frequency });
      if (summary.observations !== observations.length) throw new Error('The analytics response did not match the validated price history. Recalculate after refreshing the holding.');
      setRiskSummary({ key, summary, observations, source: histories[key].source || 'Twelve Data split-adjusted history' }); setRiskSymbol(key);
    }
    catch (e) { setError(e.message); }
    finally { setRiskBusy(false); }
  }
  const pageTitle = pages.find(([id]) => id === page)?.[1] || 'Overview';
  return <div className="app-shell min-h-screen bg-canvas text-ink">
    <Sidebar activePage={page} pageItems={pages} onNavigate={(next) => { setPage(next); setTransactionFormOpen(false); setAllowSell(false); setError(''); }}/>
    <main className="main-shell min-w-0 flex-1">
      <header className="topbar flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-5 py-3.5 sm:px-8"><div className="text-[11px] text-slate-400">Quantara <span className="mx-2">/</span><strong className="text-slate-700">{pageTitle}</strong></div><div className="flex flex-wrap items-center gap-2"><label className="text-[10px] font-semibold text-slate-500">Base currency <select className="ml-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs" value={ledger.config.baseCurrency} disabled={ledger.transactions.length > 0} onChange={(e) => setBaseCurrency(e.target.value)}>{['USD','INR','EUR','GBP','CAD','AUD'].map((x) => <option key={x}>{x}</option>)}</select></label><ThemeToggle compact/><span className="sample-badge"><span className="sample-badge-dot"/>{ledger.config.demoMode ? 'Synthetic demo' : provider?.configured ? 'Twelve Data configured' : 'Market data setup needed'}</span><span className="hidden text-xs text-slate-600 sm:inline">{user?.name || user?.email}</span><button className="refresh-button" disabled={!provider?.configured || loadingQuotes} onClick={() => { fetchedKey.current = ''; setError(''); setLoadingQuotes(true); const list = derived.holdings.filter((x) => x.quantity > 0); Promise.all(list.map((x) => refreshInstrument(x.instrument))).finally(() => setLoadingQuotes(false)); }}>↻ <span className="hidden sm:inline">Refresh quotes</span></button><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600" onClick={() => onLogout?.().catch((failure) => setError(failure.message))}>Log out</button></div></header>
      <div className="dashboard-content relative mx-auto w-full max-w-[1540px] px-5 pb-10 pt-7 sm:px-8 sm:pt-9">
        {!persistenceReady && <div className="absolute inset-0 z-20 flex items-start justify-center bg-white/75 pt-32 backdrop-blur-[1px]" role="status"><div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-600 shadow-lg">Loading saved portfolio…</div></div>}
        <MarketTicker />
        {!ledger.config.demoMode && <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500" role={persistenceState === 'error' ? 'alert' : 'status'}>
          <span>{persistenceState === 'loading' ? 'Loading saved portfolio…' : persistenceState === 'saving' ? 'Saving portfolio…' : persistenceState === 'error' ? 'Portfolio save failed. Changes remain in this browser backup; the server did not confirm the save.' : 'Portfolio saved to server'}</span>
          {migrationNotice && <span>{migrationNotice}</span>}
          {importAvailable && <button type="button" className="font-semibold text-[#256b59] underline" onClick={importLocalPortfolio}>Import local portfolio</button>}
        </div>}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">TRANSACTION-BASED INVESTMENT TRACKER</div><h1 className="mt-2 text-[30px] font-semibold tracking-[-0.05em] text-ink sm:text-[34px]">{pageTitle}</h1><p className="mt-2 text-[13px] leading-6 text-muted">{ledger.config.demoMode ? 'Illustrative sample only · prices are synthetic' : `${ledger.transactions.length} immutable transaction${ledger.transactions.length === 1 ? '' : 's'} · saved to your MongoDB account with a recoverable local backup`}</p></div>{page !== 'transactions' && <button type="button" className={primary} onClick={() => openInvestment()}>＋ Add investment</button>}</div>
        {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}{message && <div className="mb-4"><Notice>{message}</Notice></div>}
        {ledger.config.demoMode && <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Notice tone="warning"><strong>Illustrative demo mode:</strong> all holdings and prices are synthetic sample data, never a provider response.</Notice><button className={secondary} onClick={clearDemo}>Exit demo</button></div>}
        {!ledger.config.demoMode && provider && !provider.configured && <div className="mb-5"><Notice tone="warning"><strong>Market data is not configured.</strong> {provider.setupMessage} Transactions remain available only after an instrument is selected; load the labeled demo to explore without a key. Provider data is never fabricated as a fallback.</Notice></div>}
        {page === 'overview' && <Overview ledger={ledger} portfolio={derived} quotes={quotes} histories={histories} historyInstruments={historyInstruments} marketErrors={marketErrors} loading={loadingQuotes} provider={provider} onDemo={loadDemo} onAdd={() => openInvestment()}/>}
        {page === 'holdings' && <Holdings portfolio={derived} histories={histories} marketErrors={marketErrors} loading={loadingQuotes} onRefresh={refreshInstrument} onAdd={(item) => openInvestment(item)}/>}
        {page === 'transactions' && (transactionFormOpen
          ? <AddInvestment allowSell={allowSell} onCancel={closeTransactionForm} provider={provider} ledger={ledger} portfolio={derived} baseCurrency={ledger.config.baseCurrency} baseCurrencyLocked={ledger.transactions.length > 0} onBaseCurrencyChange={setBaseCurrency} connectionTest={connectionTest} connectionTestError={connectionTestError} connectionTestLoading={connectionTestLoading} onTestConnection={runConnectionTest} searchText={searchText} setSearchText={setSearchText} search={search} searchResults={searchResults} searching={searching} instrument={instrument} selectInstrument={selectInstrument} transactionType={transactionType} setTransactionType={setTransactionType} date={date} setDate={setDate} quantity={quantity} setQuantity={setQuantity} unitPrice={unitPrice} setUnitPrice={setUnitPrice} fees={fees} setFees={setFees} quote={instrument ? quotes[keyOf(instrument)] : null} quoteLoading={quoteLoading} quoteError={instrument ? marketErrors[keyOf(instrument)] : null} onRefreshQuote={instrument ? () => fetchQuote(instrument) : null} availableQuantity={availableQuantity} onSave={saveTransaction} demoMode={ledger.config.demoMode} onExitDemo={clearDemo}/>
          : <Transactions transactions={derived.transactions} baseCurrency={ledger.config.baseCurrency} onAddTransaction={openTransactionForm} importBusy={!persistenceReady} demoMode={ledger.config.demoMode} onResolveTransactionSymbols={resolveTransactionImportSymbols} onSubmitTransactionImport={submitTransactionImport} existingTransactions={ledger.transactions}/>) }
      {page === 'risk' && <Risk portfolio={derived} historyInstruments={historyInstruments} histories={histories} marketErrors={marketErrors} providerConfigured={Boolean(provider?.configured)} riskSymbol={riskSymbol} setRiskSymbol={setRiskSymbol} riskSummary={riskSummary} runRisk={runRisk} busy={riskBusy} demoMode={ledger.config.demoMode} riskFreeRatePct={riskFreeRatePct} setRiskFreeRatePct={setRiskFreeRatePct} annualizationFactor={annualizationFactor} setAnnualizationFactor={setAnnualizationFactor}/>}
        <footer className="mt-8 border-t border-slate-200 pt-4 text-[10px] leading-5 text-slate-500">Transactions are the source of truth. Your portfolio is stored on MongoDB and scoped to your signed-in account. Prices may be delayed according to your provider plan and exchange entitlement. Historical metrics describe individual instruments and do not predict returns.</footer>
      </div>
    </main>
  </div>;
}

function Overview({ ledger, portfolio, quotes, histories, historyInstruments, marketErrors, loading, provider, onDemo, onAdd }) {
  const completeMarketValue = portfolio.marketValue != null;
  const allocated = portfolio.holdings.filter((x) => x.quantity > 0);
  const latestPoints = allocated.map((x) => ({ x, quote: x.quote }));
  return <div className="space-y-5">
    {ledger.config.demoMode && <Notice tone="warning">Synthetic educational sample. Do not present these values as actual performance or live prices.</Notice>}
    {!ledger.transactions.length ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="text-lg font-semibold text-slate-800">Your ledger is empty</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Search for a stock, choose its exchange, and record a buy transaction. Once the provider is configured, Quantara requests its latest quote and daily history automatically.</p><div className="mt-5 flex flex-wrap justify-center gap-2"><button className="bg-[#256b59] rounded-lg px-4 py-2 text-sm font-semibold text-white" onClick={onAdd}>Add first investment</button><button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700" onClick={onDemo}>Load illustrative demo</button></div></section> : <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric title="Current market value" value={completeMarketValue ? money(portfolio.marketValue, ledger.config.baseCurrency) : 'Unavailable'} detail={completeMarketValue ? `${allocated.length} open position${allocated.length === 1 ? '' : 's'}` : 'Waiting for quotes for every open position'}/><Metric title="Open cost basis" value={money(portfolio.openCostBasis, ledger.config.baseCurrency)} detail="Buy costs and purchase fees less basis of shares sold"/><Metric title="Unrealized P/L" value={portfolio.unrealizedPnl == null ? 'Unavailable' : money(portfolio.unrealizedPnl, ledger.config.baseCurrency)} detail={portfolio.unrealizedPnlPercent == null ? 'Requires current quotes' : `${formatPercent(portfolio.unrealizedPnlPercent)} of remaining cost basis`} tone={portfolio.unrealizedPnl == null ? undefined : portfolio.unrealizedPnl >= 0 ? 'positive' : 'negative'}/><Metric title="Realized P/L" value={money(portfolio.realizedPnl, ledger.config.baseCurrency)} detail="Net sale proceeds minus weighted-average cost basis" tone={portfolio.realizedPnl >= 0 ? 'positive' : 'negative'}/><Metric title="Total P/L" value={portfolio.totalPnl == null ? 'Unavailable' : money(portfolio.totalPnl, ledger.config.baseCurrency)} detail="Realized plus current unrealized P/L" tone={portfolio.totalPnl == null ? undefined : portfolio.totalPnl >= 0 ? 'positive' : 'negative'}/></section>
      {portfolio.marketValue != null && <div className="grid gap-3 sm:grid-cols-2"><Metric title="Daily change" value={portfolio.holdings.every((x) => x.quantity === 0 || x.quote?.previousClose != null) ? money(portfolio.holdings.reduce((sum,x) => sum + (x.quantity > 0 ? x.quantity * (x.quote.price - x.quote.previousClose) : 0),0), ledger.config.baseCurrency) : 'Unavailable'} detail="Available only when provider previous-close values exist for every open position"/><Metric title="Total return" value={portfolio.totalPnlPercent == null ? 'Unavailable' : formatPercent(portfolio.totalPnlPercent)} detail="Realized and unrealized P/L divided by cumulative buy cost" tone={portfolio.totalPnlPercent == null ? undefined : portfolio.totalPnlPercent >= 0 ? 'positive' : 'negative'}/></div>}
      <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="section-title">Allocation by holding</h2><p className="mt-1 text-xs text-slate-500">Market value weights · {ledger.config.baseCurrency}</p></div>{loading && <span role="status" className="text-xs text-slate-500">Refreshing provider data…</span>}</div>
        {!allocated.length ? <p className="mt-4 text-sm text-slate-500">No open positions. Record a buy to see allocation.</p> : <div className="mt-4 space-y-4">{allocated.map((holding) => { const pct = portfolio.marketValue && holding.marketValue != null ? holding.marketValue / portfolio.marketValue : null; return <div key={keyOf(holding.instrument)}><div className="flex flex-wrap justify-between gap-2 text-xs"><strong>{holding.instrument.symbol} · {holding.instrument.name}</strong><span>{holding.marketValue == null ? 'Quote unavailable' : `${money(holding.marketValue, holding.instrument.currency)} · ${formatPercent(pct, { signed: false })}`}</span></div><div className="mt-1.5 h-2 rounded bg-slate-100"><div className="h-full rounded bg-[#4c9177]" style={{ width: `${Math.max(0, Math.min(100, (pct || 0) * 100))}%` }}/></div>{marketErrors[keyOf(holding.instrument)] && <p className="mt-1 text-[11px] text-rose-700">{marketErrors[keyOf(holding.instrument)]}</p>}</div>; })}</div>}
      </section>
      <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card"><h2 className="section-title">Latest available price data</h2><div className="mt-3 divide-y divide-slate-100">{latestPoints.map(({ x }) => { const key = keyOf(x.instrument); const quote = quotes[key]; return <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs"><span><strong>{x.instrument.symbol}</strong> · {x.instrument.exchange} · {x.instrument.currency}</span><span>{quote ? `${money(quote.price, quote.currency)} · ${quote.isMarketOpen === false ? 'Market closed · ' : quote.isMarketOpen ? 'Market open · ' : 'Market status unknown · '}${timestamp(quote.quoteTimestamp)} · ${quote.source}` : marketErrors[key] || (provider?.configured ? 'No quote returned yet; refresh to retry.' : 'TWELVE_DATA_API_KEY is not configured.')}</span></div>; })}</div><p className="mt-3 text-[11px] text-slate-500">Quote timestamps and provider source are shown when available; no transaction execution price is used as a quote.</p></section>
      <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card"><h2 className="section-title">Provider historical prices</h2><p className="mt-1 text-xs text-slate-500">Each provider series is indexed to 100 at its first available close for relative performance comparison. Tooltips distinguish indexed values from actual closes. These charts show holdings only.</p><div className="mt-4 space-y-3">{allocated.map((holding) => { const key = keyOf(holding.instrument); const history = histories[key]; return history?.values?.length > 1 ? <details key={key} className="rounded-lg border border-slate-100 p-3"><summary className="cursor-pointer text-xs font-semibold">{holding.instrument.symbol} · {history.values.length} observations · {formatDate(history.values[0].date)} – {formatDate(history.values.at(-1).date)} · {history.source || 'Provider historical prices'}</summary><OverviewHistoryChart observations={history.values} symbol={holding.instrument.symbol} currency={holding.instrument.currency} sourceLabel="Provider historical prices"/></details> : <p key={key} className="text-sm text-rose-700"><strong>{holding.instrument.symbol}:</strong> {marketErrors[`${key}:history`] || (provider?.configured ? 'No provider history available.' : 'No history is available; configure the provider.')}</p>; })}</div></section>
      
    </>}
    {!provider?.configured && !ledger.config.demoMode && <div className="text-xs text-slate-500">To see live/latest provider valuations, configure a Twelve Data key on the backend. Ordinary transaction costs remain available, but current P/L is intentionally unavailable without a quote.</div>}
  </div>;
}
export function AddInvestment(p) {
  const [manual, setManual] = useState({ symbol: '', name: '', exchange: '', micCode: '', currency: p.ledger.config.baseCurrency });
  const buyTotal = Number(p.quantity || 0) * Number(p.unitPrice || 0) + Number(p.fees || 0);
  const existing = p.instrument && p.portfolio.holdings.find((x) => keyOf(x.instrument) === keyOf(p.instrument));
  const availableHoldings = p.portfolio.holdings.filter((holding) => holding.quantity > 0);
  return <div className="mx-auto max-w-4xl space-y-5">
    <div className="flex items-center justify-between"><h2 className="section-title">Record transaction</h2><button type="button" className={secondary} onClick={p.onCancel}>Cancel</button></div>
    {p.demoMode && <Notice tone="warning">Exit illustrative demo mode before entering user transactions. Demo transactions are synthetic examples.</Notice>}
    <section aria-label="Portfolio Settings" className="panel-card flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5 shadow-card"><div><h2 className="section-title">Portfolio Settings</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Choose the currency used for all transaction values. Settings are saved to your MongoDB account with a recoverable local backup. FX conversion is not supported; set this before your first transaction.</p></div><label className="text-xs font-semibold text-slate-600">Portfolio base currency<select aria-label="Portfolio base currency" className={`${input} mt-1 min-w-36`} value={p.baseCurrency} disabled={p.baseCurrencyLocked} onChange={(e) => p.onBaseCurrencyChange(e.target.value)}>{['INR','USD','EUR','GBP','CAD','AUD'].map((code) => <option key={code} value={code}>{code}</option>)}</select>{p.baseCurrencyLocked && <small className="mt-1 block font-normal text-slate-500">Locked because transactions already use {p.baseCurrency}; changing it would require currency conversion.</small>}</label></section>
    <section aria-label="Live data connection test" className="rounded-2xl border border-[#cfe3d8] bg-[#f3f9f5] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="section-title">Test live data connection</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">Uses Twelve Data's verified Basic trial symbol AAPL · NASDAQ · XNGS. This check requests a quote and daily history separately and never changes your selected instrument, transactions or holdings.</p></div><button type="button" className={secondary} onClick={p.onTestConnection} disabled={p.connectionTestLoading}>{p.connectionTestLoading ? 'Testing provider…' : 'Test live data connection'}</button></div>{p.connectionTestError && <p role="alert" className="mt-3 text-xs text-rose-800">Connection test failed: {p.connectionTestError}</p>}{p.connectionTest && <div role="status" className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-xs"><strong>{p.connectionTest.success ? 'Live connection successful' : 'Live connection incomplete'}</strong><p>Trial listing: {p.connectionTest.instrument.symbol} · {p.connectionTest.instrument.exchange} ({p.connectionTest.instrument.micCode}) · {p.connectionTest.instrument.currency} · {p.connectionTest.instrument.access}</p><p>{p.connectionTest.quote ? <>Quote: {money(p.connectionTest.quote.price, p.connectionTest.quote.currency)} · {p.connectionTest.quote.currency} · {timestamp(p.connectionTest.quote.quoteTimestamp)} · {p.connectionTest.quote.source}</> : <>Quote unavailable: {p.connectionTest.errors?.quote?.message || 'No provider quote returned.'}</>}</p><p>{p.connectionTest.history ? <>Daily history: {p.connectionTest.history.values.length} observations · {p.connectionTest.history.values[0]?.date} to {p.connectionTest.history.values.at(-1)?.date}</> : <>Daily history unavailable: {p.connectionTest.errors?.history?.message || 'No provider history returned.'}</>}</p></div>}</section>
    <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card"><h2 className="section-title">1. {p.transactionType === 'SELL' ? 'Choose a held investment' : 'Find an instrument'}</h2><p className="mt-1 text-xs text-slate-500">{p.transactionType === 'SELL' ? 'Sales can only be recorded for an open position in this portfolio.' : 'Search company name or ticker, then select the exact listing, exchange and quote currency.'}</p>
      {p.transactionType === 'SELL' ? <label className="mt-4 block text-xs font-semibold text-slate-600">Held investment<select className={`${input} mt-1.5`} value={p.instrument ? keyOf(p.instrument) : ''} onChange={(event) => p.selectInstrument(availableHoldings.find((holding) => keyOf(holding.instrument) === event.target.value)?.instrument || null)} required><option value="">Choose an open holding</option>{availableHoldings.map((holding) => <option key={keyOf(holding.instrument)} value={keyOf(holding.instrument)}>{holding.instrument.symbol} · {holding.instrument.name} · {formatNumber(holding.quantity)} shares available</option>)}</select>{!availableHoldings.length && <span className="mt-1 block font-normal text-amber-800">Record a BUY transaction before entering a sale.</span>}</label> : p.provider?.configured ? <form className="mt-4 flex flex-wrap gap-2" onSubmit={p.search}><input className={`${input} min-w-[220px] flex-1`} value={p.searchText} onChange={(e) => p.setSearchText(e.target.value)} placeholder="Company or ticker (e.g. Microsoft or MSFT)" aria-label="Search stocks"/><button className={primary} disabled={p.searching}>{p.searching ? 'Searching…' : 'Search instruments'}</button></form> : <><Notice tone="warning">Instrument search and provider data need a backend key. Enter the instrument and its exchange MIC manually; current prices remain unavailable until a provider quote is returned.</Notice><form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); p.selectInstrument({ symbol: manual.symbol.trim().toUpperCase(), name: manual.name.trim() || manual.symbol.trim().toUpperCase(), exchange: manual.exchange.trim(), micCode: manual.micCode.trim().toUpperCase(), currency: manual.currency.trim().toUpperCase(), country: '', type: 'Common Stock', access: null, verification: 'manual' }); }}><label className="text-xs font-semibold">Ticker<input className={`${input} mt-1`} required value={manual.symbol} onChange={(e) => setManual({ ...manual, symbol: e.target.value })}/></label><label className="text-xs font-semibold">Company / instrument name<input className={`${input} mt-1`} value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })}/></label><label className="text-xs font-semibold">Exchange name<input className={`${input} mt-1`} required value={manual.exchange} onChange={(e) => setManual({ ...manual, exchange: e.target.value })}/></label><label className="text-xs font-semibold">Exchange MIC (4 characters)<input className={`${input} mt-1`} required minLength={4} maxLength={4} pattern="[A-Za-z0-9]{4}" value={manual.micCode} onChange={(e) => setManual({ ...manual, micCode: e.target.value })}/></label><label className="text-xs font-semibold">Quote currency<input className={`${input} mt-1`} required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" value={manual.currency} onChange={(e) => setManual({ ...manual, currency: e.target.value })}/></label><div className="flex items-end"><button className={secondary}>Use manual instrument</button></div></form></>}
      {p.transactionType === 'BUY' && p.searchResults.length > 0 && <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">{p.searchResults.map((item) => <li key={`${item.micCode}:${item.symbol}`}><button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left hover:bg-slate-50" onClick={() => p.selectInstrument(item)}><span><strong className="text-sm">{item.symbol}</strong><span className="ml-2 text-sm text-slate-700">{item.name}</span><small className="mt-1 block text-xs text-slate-500">{item.exchange} · {item.micCode} · {item.currency} · {item.country} · {item.type}</small></span><span className="text-[10px] text-slate-500">Catalog match · provider price access: {item.access?.global || item.access?.plan || 'not reported'}</span></button></li>)}</ul>}
      {p.instrument && <div className="mt-4 rounded-xl border border-[#d9e9e2] bg-[#f7fbf9] p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong>{p.instrument.symbol} · {p.instrument.name}</strong><p className="mt-1 text-xs text-slate-600">{p.instrument.verification === 'provider-search' || p.instrument.verification === 'provider-quote' ? 'Provider identity confirmed · ' : p.instrument.verification === 'legacy-unverified' ? 'Legacy listing; provider will verify exact identity · ' : 'Manual / unverified listing · '}{p.instrument.exchange} ({p.instrument.micCode}) · instrument quote currency {p.instrument.currency} · portfolio base currency {p.ledger.config.baseCurrency}</p></div><button type="button" className="text-xs font-semibold text-slate-600" onClick={() => p.selectInstrument(null)}>Clear selection</button></div>{p.instrument.currency.trim().toUpperCase() !== p.ledger.config.baseCurrency.trim().toUpperCase() && <p className="mt-3 text-xs text-rose-800">{currencyMismatchMessage(p.instrument.currency, p.ledger.config.baseCurrency)}</p>}{p.quote && p.quote.currency?.trim().toUpperCase() !== p.ledger.config.baseCurrency.trim().toUpperCase() && <p className="mt-3 text-xs text-rose-800">{currencyMismatchMessage(p.quote.currency, p.ledger.config.baseCurrency)} This quote will not be used to calculate market value.</p>}{p.quote ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700"><div><p>Latest provider quote: <strong>{money(p.quote.price, p.quote.currency)}</strong> · {p.quote.currency || 'quote currency unavailable'} · {p.quote.isMarketOpen === false ? 'market closed' : p.quote.isMarketOpen ? 'market open' : 'market status unknown'} · {timestamp(p.quote.quoteTimestamp)} · {p.quote.source || 'source unavailable'}</p>{p.quoteError && <p className="mt-1 text-rose-800">Refresh failed: {p.quoteError}. The quote above is the last successful provider response.</p>}</div>{p.onRefreshQuote && <button type="button" className={secondary} onClick={p.onRefreshQuote} disabled={p.quoteLoading}>{p.quoteLoading ? 'Refreshing…' : 'Refresh quote'}</button>}</div> : p.quoteLoading ? <p role="status" className="mt-3 text-xs text-slate-600">Requesting the latest available provider quote for {p.instrument.symbol}…</p> : <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className={`text-xs ${p.quoteError ? 'text-rose-800' : 'text-amber-800'}`}>{p.quoteError ? `Provider quote unavailable: ${p.quoteError}` : 'No provider quote is available. You may still record the actual execution price; current valuation will remain unavailable.'}</p>{p.onRefreshQuote && <button type="button" className={secondary} onClick={p.onRefreshQuote}>Retry quote</button>}</div>}</div>}
    </section>
    <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card"><h2 className="section-title">2. Record transaction</h2><form className="mt-4 space-y-4" onSubmit={p.onSave}>
      {p.allowSell ? <fieldset><legend className="text-xs font-semibold text-slate-600">Transaction type</legend><div className="mt-2 flex gap-2">{['BUY','SELL'].map((type) => <button key={type} type="button" aria-pressed={p.transactionType === type} disabled={type === 'SELL' && !availableHoldings.length} onClick={() => { p.setTransactionType(type); p.selectInstrument(null); }} className={`${p.transactionType === type ? 'border-[#78a996] bg-[#f0f7f3] text-[#256b59]' : 'border-slate-200 bg-white text-slate-600'} rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40`}>{type}</button>)}</div>{!availableHoldings.length && <p className="mt-2 text-xs text-slate-500">SELL becomes available after you record a BUY and have shares remaining.</p>}</fieldset> : <p className="text-xs font-semibold text-slate-600">Transaction type: BUY · investments are added by recording a purchase.</p>}
      {p.transactionType === 'SELL' && <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><strong>Available quantity:</strong> {existing?.quantity ? `${formatNumber(existing.quantity)} ${p.instrument.symbol}` : 'Choose an open holding above.'}</div>}
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Trade date<input className={`${input} mt-1.5`} type="date" max={localDate()} required value={p.date} onChange={(e) => p.setDate(e.target.value)}/></label><label className="text-xs font-semibold text-slate-600">Quantity<input className={`${input} mt-1.5`} type="number" min="0.00000001" step="any" required value={p.quantity} onChange={(e) => p.setQuantity(e.target.value)}/></label><label className="text-xs font-semibold text-slate-600">Execution price per share ({p.instrument?.currency || 'currency'})<div className="mt-1.5 flex gap-2"><input className={input} type="number" min="0.00000001" step="any" required value={p.unitPrice} onChange={(e) => p.setUnitPrice(e.target.value)}/>{p.quote && <button className={secondary} type="button" onClick={() => p.setUnitPrice(String(p.quote.price))} title="Use provider quote as the execution price">Use quote</button>}</div><small className="mt-1 block font-normal text-slate-500">Enter actual execution price; the latest quote is only a convenience.</small></label><label className="text-xs font-semibold text-slate-600">Fees ({p.instrument?.currency || 'currency'})<input className={`${input} mt-1.5`} type="number" min="0" step="any" value={p.fees} onChange={(e) => p.setFees(e.target.value)}/></label></div>
      {p.instrument && <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700"><strong>Transaction preview:</strong> {p.transactionType} {formatNumber(Number(p.quantity))} {p.instrument.symbol} at {money(Number(p.unitPrice), p.instrument.currency)} per share · fees {money(Number(p.fees || 0), p.instrument.currency)} · {p.transactionType === 'BUY' ? 'purchase outlay' : 'net proceeds'} {money(p.transactionType === 'BUY' ? buyTotal : Number(p.quantity || 0) * Number(p.unitPrice || 0) - Number(p.fees || 0), p.instrument.currency)}.</div>}
      <button className={primary} disabled={p.demoMode || !p.instrument || p.instrument.currency.trim().toUpperCase() !== p.ledger.config.baseCurrency.trim().toUpperCase()}>{p.transactionType === 'BUY' ? 'Save buy transaction' : 'Save sell transaction'}</button>
    </form></section>
    <p className="text-xs leading-5 text-slate-500">Transactions are append-only. Correct mistakes by recording an offsetting transaction; older entries cannot be edited silently. A sell must not exceed available shares.</p>
  </div>;
}

function Holdings(p) {
  const open = p.portfolio.holdings.filter((x) => x.quantity > 0);
  if (!open.length) return <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="text-lg font-semibold">No open holdings</h2><p className="mt-2 text-sm text-slate-500">Record a BUY transaction. Sold positions remain visible under Transactions.</p></section>;
  return <div className="space-y-4"><section className="panel-card overflow-hidden rounded-2xl border border-line bg-white shadow-card"><div className="flex flex-wrap items-start justify-between gap-3 p-5"><div><h2 className="section-title">Open investments</h2><p className="mt-1 text-xs text-slate-500">Values display in each instrument’s currency; portfolio totals require all currencies to match base currency.</p></div><span className="period-chip">{open.length} positions</span></div><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left"><thead><tr className="table-head"><th>Instrument / exchange</th><th>Quantity</th><th>Average cost</th><th>Price / data source</th><th>Market value</th><th>Unrealized P/L</th><th>Weight</th><th>Actions</th></tr></thead><tbody>{open.map((h) => { const q = h.quote; const weight = p.portfolio.marketValue && h.marketValue != null ? h.marketValue / p.portfolio.marketValue : null; const key = keyOf(h.instrument); return <tr key={key} className="table-row"><td><strong>{h.instrument.symbol} · {h.instrument.name}</strong><small className="mt-1 block text-[10px] text-slate-500">{h.instrument.exchange} ({h.instrument.micCode}) · {h.instrument.currency} · {h.instrument.verification === 'provider-search' || h.instrument.verification === 'provider-quote' ? 'Provider-verified' : h.instrument.verification === 'legacy-unverified' ? 'Legacy listing; verifying' : 'Manual / unverified'}</small></td><td>{formatNumber(h.quantity)}</td><td>{money(h.averageCost, h.instrument.currency)}<small className="mt-1 block text-[10px] text-slate-500">Cost basis {money(h.costBasis, h.instrument.currency)}</small></td><td>{q ? money(q.price, q.currency) : 'Unavailable'}<small className="mt-1 block text-[10px] text-slate-500">{q ? `${q.isMarketOpen === false ? 'Market closed · ' : ''}${timestamp(q.quoteTimestamp)} · ${q.source}` : p.marketErrors[key] || 'No provider quote'}</small>{q && p.marketErrors[key] && <small className="mt-1 block text-[10px] text-rose-700">Quote refresh failed: {p.marketErrors[key]}. Showing the last successful price value.</small>}</td><td>{h.marketValue == null ? 'Unavailable' : money(h.marketValue, h.instrument.currency)}</td><td className={h.unrealizedPnl == null ? '' : h.unrealizedPnl >= 0 ? 'text-[#256b59]' : 'text-rose-700'}>{h.unrealizedPnl == null ? 'Unavailable' : `${money(h.unrealizedPnl, h.instrument.currency)} (${formatPercent(h.unrealizedPnlPercent)})`}</td><td>{weight == null ? '—' : formatPercent(weight, { signed: false })}</td><td><div className="flex gap-1"><button className="rounded border border-slate-200 px-2 py-1 text-[10px]" onClick={() => p.onAdd(h.instrument)}>Buy more</button><button className="rounded border border-slate-200 px-2 py-1 text-[10px]" disabled={p.loading || !p.marketErrors[key]} onClick={() => p.onRefresh(h.instrument)}>Refresh</button></div></td></tr>; })}</tbody></table></div>
    <div className="space-y-2 p-5">{open.map((h) => { const rows = p.portfolio.transactions.filter((t) => keyOf(t.instrument) === keyOf(h.instrument)); return <details key={keyOf(h.instrument)} className="rounded-lg border border-slate-100 p-3"><summary className="cursor-pointer text-xs font-semibold">{h.instrument.symbol} transaction history · {rows.length}</summary><div className="mt-2 divide-y divide-slate-100">{rows.map((t) => <div key={t.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs"><span>{t.date} · {t.type} {formatNumber(t.quantity)} at {money(t.unitPrice,t.instrument.currency)} · fees {money(t.fees,t.instrument.currency)}</span>{t.realizedPnl != null && <strong>Realized {money(t.realizedPnl,t.instrument.currency)}</strong>}</div>)}</div></details>; })}</div>
     <p className="px-5 pb-5 text-[11px] leading-5 text-slate-500">Quotes show provider source, exchange currency and timestamp. “Latest” depends on market hours and account entitlements; unavailable prices remain blank.</p></section></div>;
}
function TransactionLedger({ transactions, baseCurrency, onAddTransaction = () => {} }) {
  if (!transactions.length) return <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="font-semibold text-slate-800">No transactions recorded</h2><p className="mt-2 text-sm text-slate-500">Record a BUY or SELL transaction here. New sales are limited to shares you currently hold.</p><button type="button" className={`${primary} mt-5`} onClick={onAddTransaction}>＋ Add transaction</button></section>;
  return <section className="panel-card overflow-hidden rounded-2xl border border-line bg-white shadow-card"><div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="section-title">Transaction ledger</h2><p className="mt-1 text-xs text-slate-500">Chronological execution record · append-only</p></div><button type="button" className={primary} onClick={onAddTransaction}>＋ Add transaction</button></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead><tr className="table-head"><th>Date</th><th>Type</th><th>Instrument / exchange</th><th>Quantity</th><th>Unit price</th><th>Fees</th><th>Net cash amount</th><th>Realized P/L</th></tr></thead><tbody>{transactions.map((t) => { const buy = t.type === 'BUY'; const amount = t.quantity * t.unitPrice + (buy ? t.fees : -t.fees); return <tr key={t.id} className="table-row"><td>{t.date}</td><td><span className={`rounded px-2 py-1 text-[10px] font-bold ${buy ? 'bg-[#eaf5ef] text-[#256b59]' : 'bg-rose-50 text-rose-700'}`}>{t.type}</span>{t.source === 'import' && <small className="mt-1 block text-[10px] text-slate-500">CSV import</small>}</td><td><strong>{t.instrument.symbol}</strong><small className="mt-1 block text-[10px] text-slate-500">{t.instrument.name} · {t.instrument.exchange} ({t.instrument.micCode})</small></td><td>{formatNumber(t.quantity)}</td><td>{money(t.unitPrice,t.instrument.currency)}</td><td>{money(t.fees,t.instrument.currency)}</td><td>{buy ? '−' : '+'}{money(amount,t.instrument.currency)}</td><td>{t.realizedPnl == null ? '—' : <span className={t.realizedPnl >= 0 ? 'text-[#256b59]' : 'text-rose-700'}>{money(t.realizedPnl,t.instrument.currency)}</span>}</td></tr>; })}</tbody></table></div><p className="p-5 text-[11px] text-slate-500">Portfolio base currency is {baseCurrency}. FX conversion is not implemented; every transaction must use the selected base currency.</p></section>;
}

export function Transactions({ transactions, baseCurrency, onAddTransaction = () => {}, importBusy, demoMode, onResolveTransactionSymbols, onSubmitTransactionImport, existingTransactions }) {
  return <div className="space-y-4">
    <TransactionImportPanel existingTransactions={existingTransactions} baseCurrency={baseCurrency} onResolveSymbols={onResolveTransactionSymbols} onSubmitBatch={onSubmitTransactionImport} disabled={importBusy || demoMode}/>
    <TransactionLedger transactions={transactions} baseCurrency={baseCurrency} onAddTransaction={onAddTransaction}/>
  </div>;
}

function Risk({ portfolio, historyInstruments, histories, marketErrors, providerConfigured, riskSymbol, setRiskSymbol, setRiskSummary, riskSummary, runRisk, busy, demoMode, riskFreeRatePct, setRiskFreeRatePct, annualizationFactor, setAnnualizationFactor }) {
  const health = calculatePortfolioHealth({
    holdings: portfolio.holdings.filter((holding) => holding.quantity > 0).map((holding) => {
      const key = keyOf(holding.instrument);
      const providerHistory = histories[key];
      return { ...holding, symbol: holding.instrument.symbol, name: holding.instrument.name, currency: holding.instrument.currency,
        currentPrice: holding.quote?.price, quoteTimestamp: holding.quote?.quoteTimestamp,
        historyValues: providerHistory?.values || [] };
    }),
    realizedPnl: portfolio.realizedPnl, totalBuyCost: portfolio.totalBuyCost,
  });
  const available = historyInstruments.filter((instrument) => histories[keyOf(instrument)]?.values?.length >= 3).map((instrument) => ({ instrument }));
  const chosen = riskSummary?.key ? histories[riskSummary.key] : null;
  if (!available.length) return <div className="space-y-4"><PortfolioHealthPanel health={health} currency={portfolio.holdings.find((holding) => holding.quantity > 0)?.instrument.currency || 'USD'} demoMode={demoMode}/>{demoMode && <Notice tone="warning">Demo history is synthetic and for demonstration only.</Notice>}<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="font-semibold text-slate-800">Historical risk data unavailable</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">A provider history needs at least three valid observations. These single-instrument metrics use the current open holdings only.</p>{!providerConfigured && <p className="mt-2 text-xs text-amber-800">Configure TWELVE_DATA_API_KEY on the backend to request provider history.</p>}{historyInstruments.map((instrument) => { const key = keyOf(instrument); const error = marketErrors[`${key}:history`]; const history = histories[key]; return history?.values?.length > 0 && history.values.length < 3 ? <p key={key} className="mt-2 text-xs text-amber-800"><strong>{instrument.symbol}:</strong> selected provider history has {history.values.length} observations; risk analysis requires at least three. No alternate series was substituted.</p> : error ? <p key={key} className="mt-2 text-xs text-rose-700"><strong>{instrument.symbol} history:</strong> {error}</p> : null; })}</section></div>;
  const selected = available.find((holding) => keyOf(holding.instrument) === riskSymbol) || available[0];
  const selectedKey = keyOf(selected.instrument);
  const summary = riskSummary?.key === selectedKey ? riskSummary.summary : null;
  const observations = summary ? riskSummary.observations : [];
  const maxDrawdownPeriod = summary ? describeMaximumDrawdown(observations, summary.drawdownDetails) : null;
  const selectedInstrument = historyInstruments.find((item) => keyOf(item) === selectedKey);
  return <div className="space-y-5"><PortfolioHealthPanel health={health} currency={portfolio.holdings.find((holding) => holding.quantity > 0)?.instrument.currency || 'USD'} demoMode={demoMode}/>{demoMode && <Notice tone="warning">Synthetic demo history only. These statistics are illustrative, not an actual investment result.</Notice>}
    <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-semibold text-slate-600">Analyze instrument<select className={`${input} mt-1.5`} value={selectedKey} onChange={(e) => { setRiskSymbol(e.target.value); setRiskSummary(null); }}><option value="">Choose instrument</option>{available.map((x) => { const history = histories[keyOf(x.instrument)]; return <option key={keyOf(x.instrument)} value={keyOf(x.instrument)}>{x.instrument.symbol} · provider history · {history.values.length} observations</option>; })}</select></label><label className="text-xs font-semibold text-slate-600">Annual risk-free rate (%)<input className={`${input} mt-1.5`} type="number" step="0.1" value={riskFreeRatePct} onChange={(event) => { setRiskFreeRatePct(event.target.value); setRiskSummary(null); }}/></label><label className="text-xs font-semibold text-slate-600">Observations per year<input className={`${input} mt-1.5`} type="number" min="0.000001" step="1" value={annualizationFactor} onChange={(event) => { setAnnualizationFactor(event.target.value); setRiskSummary(null); }}/></label><button className={`${primary} self-end`} onClick={runRisk} disabled={busy}>{busy ? 'Calculating…' : 'Calculate risk metrics'}</button></div>
      {summary && observations.length > 0 && chosen && <>{summary.observations < 30 && <div className="mt-4"><Notice tone="warning">Short history: {summary.observations} observations. The 30-observation warning is a UI heuristic, not a universal reliability cutoff; annualized figures can be misleading on short histories.</Notice></div>}<div className="mt-4 text-xs text-slate-500">{summary.observations} valid daily observations · {formatDate(observations[0].date)} – {formatDate(observations.at(-1).date)} · {riskSummary.source}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric title="Cumulative return" value={formatPercent(summary.cumulativeReturn)} detail="Price-only change in split-adjusted closes; excludes dividends" tone={summary.cumulativeReturn >= 0 ? 'positive' : 'negative'}/><Metric title="Arithmetic annualized return" value={formatPercent(summary.annualizedReturn)} detail={`Arithmetic mean × ${summary.sharpeDetails.annualizationFactor}; not CAGR`}/><Metric title="Annualized volatility" value={formatPercent(summary.annualizedVolatility, { signed: false })} detail={`Sample standard deviation × √${summary.sharpeDetails.annualizationFactor}`}/><Metric title="Sharpe ratio" value={formatSharpe(summary.sharpeRatio)} detail={`Annual risk-free ${formatPercent(summary.sharpeDetails.riskFreeRate, { signed: false })}; geometric per-observation conversion`}/><Metric title="Maximum drawdown" value={formatPercent(summary.maxDrawdown, { signed: false })} detail={`Peak ${maxDrawdownPeriod.peakDate} · trough ${maxDrawdownPeriod.troughDate}`}/></div><div className="mt-5 grid gap-5 xl:grid-cols-2"><div><h3 className="text-sm font-semibold">{selectedInstrument.symbol} historical closing prices ({selectedInstrument.currency})</h3><p className="mt-1 text-xs text-slate-500">Actual split-adjusted closes from Twelve Data provider history; not live quotes. The scale is labeled; select linear or logarithmic. Focus and use arrow keys, or hover, to inspect the exact date and price.</p><PriceHistoryChart observations={observations} currency={selectedInstrument.currency} symbol={selectedInstrument.symbol}/></div><div><h3 className="text-sm font-semibold">Historical drawdown</h3><p className="mt-1 text-xs text-slate-600">Maximum drawdown {formatPercent(maxDrawdownPeriod.maxDrawdownPercent / 100)} · peak {maxDrawdownPeriod.peakDate} · trough {maxDrawdownPeriod.troughDate}</p><DrawdownChart dates={observations.map((point) => point.date)} values={summary.drawdownDetails.drawdownSeries.map((x) => x * 100)}/></div></div></>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="section-title">Assumptions and limits</h2><ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600"><li>Daily returns compare consecutive valid observations in date order; missing observations are rejected and never interpolated. Calendar gaps are treated as one observation period; metrics do not adjust for elapsed calendar time.</li><li>The observations-per-year factor defaults to 252 and is configurable above. Arithmetic annualized return is mean daily return × factor; it is not CAGR. Volatility uses sample standard deviation × √factor.</li><li>Sharpe subtracts each return’s effective geometric risk-free rate: (1 + annual risk-free rate)^(1/factor) − 1. The entered annual rate is converted to an observation-period rate before excess returns are averaged.</li><li>Maximum drawdown uses the running historical peak. Provider prices are split-adjusted, exclude dividends, and represent price-only returns rather than total investment returns. These single-instrument metrics are not a transaction-weighted portfolio return and do not predict future returns.</li></ul></section>
  </div>;
}
