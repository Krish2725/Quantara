import { useMemo, useState } from 'react';
import { formatDate } from '../utils/format.js';

const WIDTH = 860; const HEIGHT = 320;
const PLOT = { left: 112, right: 842, top: 20, bottom: 247 };

export function formatPrice(value, currency) {
  if (!Number.isFinite(value)) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value); }
  catch { return `${value.toFixed(2)} ${currency || ''}`.trim(); }
}
export function scalePriceValue(value, scale) {
  return scale === 'logarithmic' ? Math.log(value) : value;
}
export function priceTooltip(observations, index, currency) {
  const point = observations[index];
  return point ? { date: point.date, price: point.price, formattedPrice: formatPrice(point.price, currency) } : null;
}
function validDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

export default function PriceHistoryChart({ observations, currency, symbol }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const [scale, setScale] = useState('linear');
  const points = useMemo(() => (Array.isArray(observations) ? observations : [])
    .filter((point) => validDate(point?.date) && Number.isFinite(point?.price) && point.price > 0), [observations]);
  if (points.length < 2) return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">At least two valid dated prices are needed to draw this chart.</p>;

  const rawMin = Math.min(...points.map((point) => point.price));
  const rawMax = Math.max(...points.map((point) => point.price));
  const transform = (value) => scalePriceValue(value, scale);
  const scaledMin = transform(rawMin); const scaledMax = transform(rawMax);
  const padding = scaledMax === scaledMin ? 0.04 : (scaledMax - scaledMin) * 0.08;
  const min = scale === 'logarithmic' ? scaledMin - padding : Math.max(0, scaledMin - padding);
  const max = scaledMax + padding;
  const x = (index) => PLOT.left + (PLOT.right - PLOT.left) * index / (points.length - 1);
  const y = (value) => PLOT.bottom - (transform(value) - min) / (max - min) * (PLOT.bottom - PLOT.top);
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(point.price).toFixed(2)}`).join(' ');
  const xTicks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const scaledTick = min + (max - min) * (4 - index) / 4;
    return scale === 'logarithmic' ? Math.exp(scaledTick) : scaledTick;
  });
  const selected = activeIndex == null ? null : points[activeIndex];
  const selectFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const pointerX = (event.clientX - rect.left) * WIDTH / rect.width;
    const index = Math.max(0, Math.min(points.length - 1, Math.round((pointerX - PLOT.left) / (PLOT.right - PLOT.left) * (points.length - 1))));
    setActiveIndex(index);
  };
  const tooltipX = selected ? Math.max(PLOT.left, Math.min(PLOT.right - 205, x(activeIndex) + 10)) : 0;
  const tooltipY = selected ? (y(selected.price) < 72 ? y(selected.price) + 16 : y(selected.price) - 58) : 0;

  return <div className="chart-surface rounded-lg bg-white" aria-label={`${symbol || 'Instrument'} historical price chart`}>
    <label className="mb-2 inline-flex items-center gap-2 text-xs font-medium text-slate-600">Price axis scale<select className="rounded border border-slate-200 bg-white px-2 py-1" value={scale} onChange={(event) => setScale(event.target.value)}><option value="linear">Linear</option><option value="logarithmic">Logarithmic</option></select></label>
    <div className="overflow-x-auto">
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="min-w-[620px] w-full" role="group" aria-label={`${symbol || 'Instrument'} closing prices in ${currency}, ${scale} scale. Focus the chart and use left and right arrow keys to inspect exact dates and prices.`} tabIndex="0" aria-keyshortcuts="ArrowLeft ArrowRight"
      onPointerMove={selectFromPointer} onPointerDown={selectFromPointer} onPointerLeave={() => setActiveIndex(null)}
      onFocus={() => setActiveIndex((index) => index ?? 0)} onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setActiveIndex((index) => Math.max(0, Math.min(points.length - 1, (index ?? 0) + (event.key === 'ArrowRight' ? 1 : -1)))); }
      }}>
      {yTicks.map((tick, index) => <g key={index}><line x1={PLOT.left} x2={PLOT.right} y1={y(tick)} y2={y(tick)} stroke="var(--q-chart-grid)"/><text x={PLOT.left - 10} y={y(tick) + 4} textAnchor="end" fill="var(--q-chart-axis)" fontSize="11">{formatPrice(tick, currency)}</text></g>)}
      <line x1={PLOT.left} x2={PLOT.left} y1={PLOT.top} y2={PLOT.bottom} stroke="var(--q-chart-axis)"/><line x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom} y2={PLOT.bottom} stroke="var(--q-chart-axis)"/>
      <text x="18" y={(PLOT.top + PLOT.bottom) / 2} textAnchor="middle" fill="var(--q-chart-text)" fontSize="11" transform={`rotate(-90 18 ${(PLOT.top + PLOT.bottom) / 2})`}>Closing price ({currency}, {scale} scale)</text>
      <text x={(PLOT.left + PLOT.right) / 2} y="307" textAnchor="middle" fill="var(--q-chart-text)" fontSize="11">Date</text>
      <path d={path} fill="none" stroke="var(--q-green)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round"/>
      {xTicks.map((index) => <g key={points[index].date}><line x1={x(index)} x2={x(index)} y1={PLOT.bottom} y2={PLOT.bottom + 5} stroke="var(--q-chart-axis)"/><text x={x(index)} y={PLOT.bottom + 21} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fill="var(--q-chart-axis)" fontSize="11">{formatDate(points[index].date, { month: 'short', day: 'numeric', year: '2-digit' })}</text></g>)}
      {selected && <g pointerEvents="none"><line x1={x(activeIndex)} x2={x(activeIndex)} y1={PLOT.top} y2={PLOT.bottom} stroke="var(--q-chart-axis)" strokeDasharray="3 3"/><circle cx={x(activeIndex)} cy={y(selected.price)} r="4.5" fill="var(--q-green)" stroke="white" strokeWidth="2"/><rect x={tooltipX} y={tooltipY} width="198" height="46" rx="6" fill="var(--q-chart-tooltip)"/><text x={tooltipX + 9} y={tooltipY + 17} fill="white" fontSize="11">{selected.date}</text><text x={tooltipX + 9} y={tooltipY + 34} fill="white" fontWeight="600" fontSize="12">{formatPrice(selected.price, currency)}</text></g>}
    </svg>
    </div>
  </div>;
}
