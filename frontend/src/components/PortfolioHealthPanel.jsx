import { useMemo, useState } from 'react';

const SORTS = {
  score: 'Rating', unrealizedPnlPercent: 'Unrealized return', unrealizedPnl: 'Unrealized P/L',
  historicalVolatility: 'Volatility', weight: 'Position weight',
};
function number(value, digits = 1) { return Number.isFinite(value) ? value.toFixed(digits) : '—'; }
function money(value, currency) {
  if (!Number.isFinite(value)) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${value.toFixed(2)} ${currency || ''}`; }
}

export default function PortfolioHealthPanel({ health, currency = 'USD', demoMode = false }) {
  const [sortBy, setSortBy] = useState('score');
  const sorted = useMemo(() => [...(health?.holdings || [])].sort((a, b) => {
    const av = a[sortBy], bv = b[sortBy];
    if (!Number.isFinite(av)) return Number.isFinite(bv) ? 1 : a.symbol.localeCompare(b.symbol);
    if (!Number.isFinite(bv)) return -1;
    return bv - av;
  }), [health?.holdings, sortBy]);
  if (!health?.available) return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="section-title">Portfolio health</h2><p className="mt-2 text-sm text-slate-600">Insufficient data: add an open transaction-derived holding to receive a portfolio health estimate.</p></section>;
  const c = health.components;
  const best = [...health.holdings].filter((item) => Number.isFinite(item.score)).sort((a, b) => b.score - a.score)[0];
  const largest = [...health.holdings].filter((item) => Number.isFinite(item.weight)).sort((a, b) => b.weight - a.weight)[0];
  return <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card" aria-labelledby="portfolio-health-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="portfolio-health-title" className="section-title">Portfolio health estimate</h2><p className="mt-1 text-xs text-slate-500">Explainable heuristic from open holdings, provider quotes, and available provider history. Not investment advice.</p></div><div className="rounded-xl bg-slate-50 px-4 py-2 text-right"><strong className="text-2xl text-slate-800">{number(health.score, 0)}<span className="text-sm">/100</span></strong><div className="text-xs text-slate-600">{health.category}{health.provisional ? ' · provisional' : ''}</div></div></div>
    {demoMode && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">This estimate uses synthetic demonstration data.</p>}
    <p className="mt-3 text-xs text-slate-600">Coverage: provider quotes {health.coverage.quoteCount}/{health.coverage.openHoldings} · provider histories {health.coverage.historyCount}/{health.coverage.openHoldings}. Missing components are excluded and the available component weights are renormalized; coverage contributes 15%.</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(c).map(([key, part]) => <div key={key} className="rounded-lg border border-slate-100 p-3"><div className="flex justify-between gap-2 text-xs"><strong>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (x) => x.toUpperCase())}</strong><span>{part.available ? `${number(part.score, 0)}/100` : 'Unavailable'}</span></div><p className="mt-1 text-[11px] leading-4 text-slate-500">{key === 'unrealizedPerformance' ? `Open return ${number(part.returnPercent)}% of cost basis` : key === 'realizedPerformance' ? `Closed return ${number(part.returnPercent)}% of cumulative buy cost` : key === 'diversification' ? `Concentration index ${number(part.concentrationIndex, 3)} (lower is more diversified)` : key === 'volatility' ? `Cost-basis weighted annualized sample volatility ${number(part.annualizedVolatility * 100)}%` : key === 'drawdown' ? `Cost-basis weighted historical maximum drawdown ${number(part.maximumDrawdown * 100)}%` : `Quotes ${number(part.quoteCoveragePercent, 0)}% · histories ${number(part.historyCoveragePercent, 0)}%`}</p></div>)}</div>
    <p className="mt-3 text-xs text-slate-600">{best ? `Highest current rating: ${best.symbol} (${number(best.score, 0)}/100).` : 'No holding has sufficient data for an individual rating.'} {largest ? `Largest position: ${largest.symbol} (${number(largest.weight * 100, 1)}% of quoted current value).` : ''} Ratings are relative, rule-based summaries; they do not predict returns.</p>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Open holding ratings</h3><label className="flex items-center gap-2 text-xs text-slate-600">Sort by<select className="rounded-md border border-slate-200 bg-white px-2 py-1.5" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>{Object.entries(SORTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
    <div className="mt-2 overflow-x-auto"><table className="min-w-[1200px] w-full text-left text-xs"><thead className="table-head"><tr><th>Holding</th><th>Rating</th><th>Quote · as of</th><th>Quantity</th><th>Average cost</th><th>Current value</th><th>Unrealized P/L</th><th>1-year price return</th><th>Annual vol.</th><th>Max drawdown</th><th>Weight</th><th>Data</th></tr></thead><tbody>{sorted.map((item) => <tr className="table-row" key={item.symbol}><td><strong>{item.symbol}</strong><div className="text-[10px] text-slate-500">{item.name}</div></td><td>{number(item.score, 0)} · {item.category}</td><td>{money(item.currentPrice, item.currency || currency)}<div className="text-[10px] text-slate-500">{item.quoteTimestamp ? new Date(item.quoteTimestamp).toLocaleString() : 'Timestamp unavailable'}</div></td><td>{number(item.quantity, 4)}</td><td>{money(item.averageCost, item.currency || currency)}</td><td>{money(item.marketValue, item.currency || currency)}</td><td>{money(item.unrealizedPnl, item.currency || currency)}<div className="text-[10px] text-slate-500">{number(item.unrealizedPnlPercent)}%</div></td><td>{number(item.oneYearReturnPercent)}%</td><td>{number(item.historicalVolatility * 100)}%</td><td>{number(item.maximumDrawdown * 100)}%</td><td>{number(item.weight * 100)}%</td><td>{item.dataQuality.quote ? 'Quote' : 'No quote'} · {item.dataQuality.providerHistory ? 'History' : 'No history'}{item.dataQuality.oneYearHistory ? '' : ' · <1y'}</td></tr>)}</tbody></table></div>
    <div className="mt-3 space-y-1">{sorted.map((item) => <p key={`${item.symbol}-reason`} className="text-[11px] text-slate-500"><strong>{item.symbol}:</strong> {item.reasons.join(' ')}</p>)}</div>
  </section>;
}
