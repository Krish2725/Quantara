import { useEffect, useState } from 'react';
import { getMarketTicker } from '../services/portfolioApi.js';

export const MARKET_TICKER_POLL_MS = 110_000;

function price(value, currency) {
  if (!Number.isFinite(value)) return 'Price unavailable';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${value.toFixed(2)} ${currency || ''}`; }
}

export function TickerStrip({ items }) {
  const renderItem = (item, index, repeated = false) => {
    const change = item.dailyChangePercent;
    const tone = change == null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down';
    return <div className="ticker-item" key={`${repeated ? 'repeat-' : ''}${item.micCode}-${item.symbol}-${index}`} aria-hidden={repeated || undefined}>
      <strong>{item.symbol}</strong><span className="ticker-company">{item.name || item.exchange}</span>
      {item.error && !Number.isFinite(item.price) ? <><b>Quote unavailable</b><span className="ticker-market-state">{item.error.message}</span></> : <>
        <b>{price(item.price, item.currency)}</b>
        <span className={`ticker-change ticker-${tone}`}>{change == null ? 'Change n/a' : item.dailyChange == null ? `${change > 0 ? '▲ ' : change < 0 ? '▼ ' : '• '}${change.toFixed(2)}%` : `${item.dailyChange > 0 ? '▲ +' : item.dailyChange < 0 ? '▼ ' : '• '}${price(Math.abs(item.dailyChange), item.currency)} (${change.toFixed(2)}%)`}</span>
        <span className="ticker-market-state">Quote {item.quoteTimestamp ? new Date(item.quoteTimestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'time n/a'}</span>
        {item.isMarketOpen === false && <span className="ticker-market-state">Market closed</span>}
        {item.stale && <span className="ticker-market-state">Stale quote · {item.error?.message || 'refresh failed'}</span>}
      </>}
    </div>;
  };
  return <div className="ticker-track" style={{ '--ticker-duration': `${Math.max(15, items.length * 5)}s` }}>{items.map((item, index) => renderItem(item, index))}{items.map((item, index) => renderItem(item, index, true))}</div>;
}

export default function MarketTicker() {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let active = true, timer;
    const refresh = async () => {
      try { const result = await getMarketTicker(); if (active) { setData(result); setError(''); } }
      catch (e) { if (active) setError(e.message); }
      if (active) timer = setTimeout(refresh, MARKET_TICKER_POLL_MS);
    };
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, []);
  const items = data?.items || [];
  const updated = data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  const failures = items.filter((item) => item.error).length;
  const available = items.filter((item) => item.quoteState === 'available' || item.quoteState === 'stale').length;
  const pending = items.filter((item) => item.quoteState === 'pending').length;
  const summary = data?.configurationError
    ? data.configurationError
    : data?.marketDataConfigured === false
    ? 'Market data is not configured'
    : `${available} quote${available === 1 ? '' : 's'} available${failures ? ` · ${failures} unavailable` : ''}${pending ? ` · ${pending} awaiting rotation` : ''}`;
  return <section className="market-ticker" aria-label="Market ticker">
    <div className="market-ticker-label"><span className="ticker-live-dot"/> MARKET WATCH</div>
    {items.length ? <div className="ticker-viewport" tabIndex="0" aria-label="Market quotes. Focus or hover to pause scrolling."><TickerStrip items={items}/></div> : <div className="ticker-empty" tabIndex="0" role={error || data?.configurationError ? 'alert' : 'status'}>{error ? `Market ticker unavailable: ${error}` : data?.configurationError || 'Loading market quotes…'}</div>}
    <div className="ticker-updated">{data ? summary : error ? 'Provider unavailable' : 'Connecting'}{updated ? ` · checked ${updated}` : ''}{data?.stale ? ' · stale quotes shown' : ''}</div>
  </section>;
}
