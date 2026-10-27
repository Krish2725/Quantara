import { formatDate, formatNumber, formatPercent, formatSharpe } from '../utils/format.js';
import BrandLogo from './BrandLogo.jsx';

const assetColors = ['#256b59', '#70a99b', '#c2a267', '#7792b5', '#a8799b'];

export function Sidebar({ activePage = 'overview', onNavigate = () => {}, pageItems = [['overview', 'Overview'], ['portfolios', 'Portfolios'], ['risk', 'Risk analysis']] }) {
  const items = pageItems;
  return (
    <aside className="sidebar-shell flex min-h-screen w-[248px] shrink-0 flex-col bg-[#101b27] px-5 py-7 text-white">
      <BrandLogo to="/dashboard" inverse label="Quantara dashboard" className="sidebar-brand" />
      <div className="mt-12 px-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500">Workspace</div>
      <nav aria-label="Main navigation" className="mt-3 space-y-1">
        {items.map(([id, label]) => (
          <button key={id} type="button" onClick={() => onNavigate(id)}
            className={`nav-item w-full text-left ${activePage === id ? 'nav-item-active' : 'nav-item-muted'}`}
            aria-current={activePage === id ? 'page' : undefined}>
            <span aria-hidden="true">{id === 'overview' ? '▦' : id === 'portfolios' ? '▤' : '⌁'}</span><span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-note mt-auto rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <span className="status-dot" /> Analytics engine
        </div>
        <p className="mt-2 text-[11px] leading-[1.55] text-slate-400">Deterministic portfolio metrics, built from transparent assumptions.</p>
      </div>
      <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-5">
        <div className="avatar-mark">Q</div>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-200">Quantara</div>
          <div className="mt-0.5 text-[10px] text-slate-500">Local portfolio workspace</div>
        </div>
      </div>
    </aside>
  );
}

export function MetricCard({ title, value, detail, tone = 'default', icon }) {
  return (
    <article className="metric-card rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12px] font-medium text-muted">{title}</div>
        <div className={`metric-icon metric-icon-${tone}`} aria-hidden="true">{icon}</div>
      </div>
      <div className={`mt-4 text-[25px] font-semibold tracking-[-0.045em] leading-none ${tone === 'positive' ? 'text-brand' : tone === 'negative' ? 'text-rose-700' : 'text-ink'}`}>{value}</div>
      <div className="mt-3 text-[11px] text-slate-500">{detail}</div>
    </article>
  );
}

function linePath(points) {
  return points.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
}

export function PerformanceChart({ analysis }) {
  const dates = analysis?.comparison?.alignedDates;
  const portfolio = analysis?.portfolio;
  const benchmark = analysis?.benchmark;
  if (!Array.isArray(dates) || dates.length < 2
    || !Array.isArray(portfolio?.dates) || !Array.isArray(portfolio?.values)
    || !Array.isArray(benchmark?.alignedValues) || benchmark.alignedValues.length !== dates.length) {
    return <PerformanceChartEmpty />;
  }

  const portfolioByDate = new Map(portfolio.dates.map((date, index) => [date, portfolio.values[index]]));
  const portfolioValues = dates.map((date) => portfolioByDate.get(date));
  const benchmarkValues = benchmark.alignedValues;
  if (portfolioValues.some((value) => !Number.isFinite(value) || value <= 0)
    || benchmarkValues.some((value) => !Number.isFinite(value) || value <= 0)) {
    return <PerformanceChartEmpty />;
  }
  const portfolioIndex = portfolioValues.map((value) => (value / portfolioValues[0]) * 100);
  const benchmarkIndex = benchmarkValues.map((value) => (value / benchmarkValues[0]) * 100);
  const allValues = [...portfolioIndex, ...benchmarkIndex];
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const spread = Math.max(rawMax - rawMin, 1);
  const min = rawMin - spread * 0.2;
  const max = rawMax + spread * 0.2;
  const left = 66;
  const right = 748;
  const top = 20;
  const bottom = 218;
  const x = (index) => left + (index / (dates.length - 1)) * (right - left);
  const y = (value) => bottom - ((value - min) / (max - min)) * (bottom - top);
  const portfolioPoints = portfolioIndex.map((value, index) => ({ x: x(index), y: y(value) }));
  const benchmarkPoints = benchmarkIndex.map((value, index) => ({ x: x(index), y: y(value) }));
  const tickValues = [max, (max + min) / 2, min];
  const labelIndexes = [...new Set([0, Math.round((dates.length - 1) / 3), Math.round(((dates.length - 1) * 2) / 3), dates.length - 1])];

  return (
    <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6" aria-labelledby="performance-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="performance-title" className="section-title">Performance</h2>
            <span className="period-chip">Indexed to 100</span>
          </div>
          <p className="mt-1.5 text-xs text-muted">Portfolio value compared with the illustrative benchmark</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-medium text-slate-600">
          <div className="flex items-center gap-2"><span className="legend-line legend-portfolio" />Portfolio</div>
          <div className="flex items-center gap-2"><span className="legend-line legend-benchmark" />{benchmark.name || 'Benchmark'}</div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden">
        <svg className="performance-svg w-full" viewBox="0 0 780 270" role="img" aria-label="Portfolio and benchmark indexed performance chart">
          <defs>
            <linearGradient id="portfolio-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#256b59" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#256b59" stopOpacity="0" />
            </linearGradient>
          </defs>
          {tickValues.map((tick, index) => (
            <g key={index}>
              <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
              <text x="0" y={y(tick) + 4} className="chart-axis-label">{tick.toFixed(1)}</text>
            </g>
          ))}
          <path d={`${linePath(portfolioPoints)} L ${right} ${bottom} L ${left} ${bottom} Z`} fill="url(#portfolio-fill)" />
          <path d={linePath(benchmarkPoints)} className="chart-benchmark" />
          <path d={linePath(portfolioPoints)} className="chart-portfolio" />
          {benchmarkPoints.map((point, index) => <circle key={`b-${dates[index]}`} cx={point.x} cy={point.y} r="2.6" className="benchmark-point"><title>{`${formatDate(dates[index])}: benchmark ${benchmarkIndex[index].toFixed(2)}`}</title></circle>)}
          {portfolioPoints.map((point, index) => <circle key={`p-${dates[index]}`} cx={point.x} cy={point.y} r="3.1" className="portfolio-point"><title>{`${formatDate(dates[index])}: portfolio ${portfolioIndex[index].toFixed(2)}`}</title></circle>)}
          {labelIndexes.map((index) => <text key={dates[index]} x={x(index)} y="249" textAnchor={index === 0 ? 'start' : index === dates.length - 1 ? 'end' : 'middle'} className="chart-date-label">{formatDate(dates[index])}</text>)}
        </svg>
      </div>

      <div className="mt-1 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <div className="comparison-pill"><span className="text-slate-500">Return difference</span><strong className={analysis.comparison.cumulativeReturnDifference >= 0 ? 'text-brand' : 'text-rose-700'}>{formatPercent(analysis.comparison.cumulativeReturnDifference, { digits: 2 })}</strong><span className="text-[10px] text-slate-400">percentage points</span></div>
        <div className="comparison-pill"><span className="text-slate-500">Relative return</span><strong className={analysis.comparison.relativeCumulativeReturn >= 0 ? 'text-brand' : 'text-rose-700'}>{formatPercent(analysis.comparison.relativeCumulativeReturn, { digits: 2 })}</strong><span className="text-[10px] text-slate-400">compounded</span></div>
      </div>
    </section>
  );
}

function PerformanceChartEmpty() {
  return (
    <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6" aria-labelledby="performance-title">
      <h2 id="performance-title" className="section-title">Performance</h2>
      <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center" role="status">
        <strong className="text-xs font-semibold text-slate-700">Performance chart unavailable</strong>
        <p className="mt-1.5 text-[11px] text-slate-500">Portfolio and benchmark values need at least two matching, valid observations.</p>
      </div>
    </section>
  );
}

export function AllocationCard({ allocation }) {
  const holdings = Array.isArray(allocation?.holdings) ? allocation.holdings : [];
  if (holdings.length === 0) {
    return (
      <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6" aria-labelledby="allocation-title">
        <h2 id="allocation-title" className="section-title">Allocation</h2>
        <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center text-[11px] text-slate-500" role="status">No allocation data is available.</p>
      </section>
    );
  }
  let cursor = 0;
  const segments = holdings.map((holding, index) => {
    const start = cursor;
    cursor += holding.weight * 100;
    return `${assetColors[index % assetColors.length]} ${start.toFixed(3)}% ${cursor.toFixed(3)}%`;
  });
  const style = { background: `conic-gradient(${segments.join(', ')})` };

  return (
    <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6" aria-labelledby="allocation-title">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="allocation-title" className="section-title">Allocation</h2><p className="mt-1.5 text-xs text-muted">Latest portfolio weights</p></div>
        <span className="as-of-chip">As of {formatDate(allocation.date)}</span>
      </div>
      <div className="mt-5 flex items-center justify-center">
        <div className="donut-wrap" style={style} role="img" aria-label={`Allocation across ${holdings.length} holdings`}>
          <div className="donut-center"><span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Total value</span><strong>{formatNumber(allocation.totalValue)}</strong><small>units</small></div>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {holdings.map((holding, index) => (
          <div key={holding.assetId} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex min-w-0 items-center gap-2.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: assetColors[index % assetColors.length] }} /><span className="truncate font-semibold text-slate-700">{holding.assetId}</span></div>
            <div className="flex items-center gap-3"><span className="text-slate-500">{formatNumber(holding.value)}</span><strong className="w-12 text-right font-semibold text-ink">{formatPercent(holding.weight, { signed: false })}</strong></div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ContributionTable({ contributions, latestAllocation, quantities = {}, assets = {} }) {
  if (!Array.isArray(contributions) || contributions.length === 0
    || !Array.isArray(latestAllocation?.holdings) || latestAllocation.holdings.length === 0) {
    return (
      <section className="panel-card rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6" aria-labelledby="contribution-title">
        <h2 id="contribution-title" className="section-title">Holding contributions</h2>
        <p className="mt-4 text-[11px] text-slate-500" role="status">No holding contribution data is available.</p>
      </section>
    );
  }
  const currentById = new Map(latestAllocation.holdings.map((holding) => [holding.assetId, holding]));
  return (
    <section className="panel-card overflow-hidden rounded-2xl border border-line bg-white shadow-card" aria-labelledby="contribution-title">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5 sm:px-6">
        <div><h2 id="contribution-title" className="section-title">Holding contributions</h2><p className="mt-1.5 text-xs text-muted">Change in holding value as a share of initial portfolio value</p></div>
        <span className="method-chip">Buy-and-hold attribution</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] border-collapse text-left">
          <thead><tr className="table-head"><th>Holding</th><th>Quantity</th><th className="text-right">Current value</th><th className="text-right">Weight</th><th className="text-right">Contribution</th></tr></thead>
          <tbody>
            {contributions.map((item, index) => {
              const current = currentById.get(item.assetId);
              const meta = assets[item.assetId];
              return (
                <tr key={item.assetId} className="table-row">
                  <td><div className="flex items-center gap-3"><span className="holding-marker" style={{ backgroundColor: assetColors[index % assetColors.length] }}>{item.assetId.slice(0, 1)}</span><span><strong className="block text-xs font-semibold text-ink">{item.assetId}</strong><small className="mt-0.5 block text-[10px] text-slate-500">{meta?.name || 'Portfolio holding'}</small></span></div></td>
                  <td className="text-xs text-slate-600">{formatNumber(quantities[item.assetId])}</td>
                  <td className="text-right text-xs font-medium text-slate-700">{formatNumber(current?.value)}</td>
                  <td className="text-right text-xs text-slate-600">{formatPercent(current?.weight, { signed: false })}</td>
                  <td className={`text-right text-xs font-semibold ${item.cumulativeContribution >= 0 ? 'text-brand' : 'text-rose-700'}`}>{formatPercent(item.cumulativeContribution, { digits: 2 })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3.5 text-[10px] text-slate-500 sm:px-6">
        <span>Contributions sum to portfolio cumulative return under the sample's constant-quantity assumptions.</span>
        <span>Values in demo units</span>
      </div>
    </section>
  );
}

export function StatePanel({ state, message, onRetry }) {
  if (state === 'loading') {
    return <div className="state-panel" role="status"><span className="loading-spinner" /><div><strong>Calculating portfolio analysis</strong><p>Building the historical series and aligning benchmark observations.</p></div></div>;
  }
  if (state === 'empty') {
    return <div className="state-panel" role="status"><div className="state-symbol">∅</div><div><strong>No portfolio analysis available</strong><p>Add at least one holding with three or more dated prices to continue.</p></div></div>;
  }
  if (state === 'validation-error' || state === 'server-error') {
    const validation = state === 'validation-error';
    return (
      <div className={`state-panel state-panel-error ${validation ? 'state-validation' : ''}`} role="alert">
        <div className="state-symbol">{validation ? '!' : '×'}</div>
        <div className="min-w-0 flex-1"><strong>{validation ? 'Analysis input needs attention' : 'Unable to reach the analytics service'}</strong><p>{message || (validation ? 'Check the supplied series and try again.' : 'The API may be unavailable. Please retry in a moment.')}</p></div>
        <button type="button" onClick={onRetry} className="retry-button">Try again</button>
      </div>
    );
  }
  return null;
}

export function PerformanceKpis({ analysis }) {
  const values = analysis?.portfolio?.values;
  const performance = analysis?.portfolio?.performance;
  if (!Array.isArray(values) || values.length === 0 || !performance) {
    return <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-center text-[11px] text-slate-500" role="status">No portfolio metrics are available.</div>;
  }
  const latest = values.at(-1);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <MetricCard title="Portfolio value" value={formatNumber(latest)} detail="Latest market value · demo units" tone="default" icon="◈" />
      <MetricCard title="Cumulative return" value={formatPercent(performance.cumulativeReturn)} detail={`${performance.observations} dated observations`} tone={performance.cumulativeReturn >= 0 ? 'positive' : 'negative'} icon="↗" />
      <MetricCard title="Annualized return" value={formatPercent(performance.annualizedReturn)} detail="Arithmetic annualization" tone="default" icon="◷" />
      <MetricCard title="Annualized volatility" value={formatPercent(performance.annualizedVolatility, { signed: false })} detail="Sample standard deviation" tone="default" icon="⌁" />
      <MetricCard title="Sharpe ratio" value={formatSharpe(performance.sharpeRatio)} detail="Risk-adjusted return" tone="default" icon="◇" />
      <MetricCard title="Maximum drawdown" value={formatPercent(performance.maxDrawdown, { signed: false })} detail="Peak-to-trough decline" tone={performance.maxDrawdown < 0 ? 'negative' : 'default'} icon="↘" />
    </div>
  );
}
