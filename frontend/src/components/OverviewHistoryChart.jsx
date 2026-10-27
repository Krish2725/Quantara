import { useState } from 'react';
import { formatDate } from '../utils/format.js';
import { formatPrice } from './PriceHistoryChart.jsx';

const WIDTH = 860;
const HEIGHT = 320;
const PLOT = { left: 112, right: 842, top: 20, bottom: 247 };

export function overviewTooltip(observations, index, symbol, currency) {
  const point = observations[index];
  const initialPrice = observations[0].price;
  return { date: point.date, symbol, indexedValue: point.price / initialPrice * 100, actualPrice: point.price, formattedActualPrice: formatPrice(point.price, currency) };
}

export default function OverviewHistoryChart({ observations, symbol, currency, sourceLabel }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const points = Array.isArray(observations) ? observations.filter((point) => typeof point?.date === 'string' && Number.isFinite(point.price) && point.price > 0) : [];
  if (points.length < 2) return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">At least two real dated prices are needed to draw this history.</p>;
  const startPrice = points[0].price;
  const indexed = points.map((point) => point.price / startPrice * 100);
  const rawMin = Math.min(...indexed);
  const rawMax = Math.max(...indexed);
  const padding = rawMin === rawMax ? Math.max(rawMax * 0.04, 1) : (rawMax - rawMin) * 0.08;
  const min = Math.max(0, rawMin - padding);
  const max = rawMax + padding;
  const x = (index) => PLOT.left + (PLOT.right - PLOT.left) * index / (points.length - 1);
  const y = (value) => PLOT.bottom - (value - min) / (max - min) * (PLOT.bottom - PLOT.top);
  const path = indexed.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
  const dateTicks = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const indexedTicks = Array.from({ length: 5 }, (_, index) => min + (max - min) * (4 - index) / 4);
  const selected = activeIndex == null ? null : overviewTooltip(points, activeIndex, symbol, currency);
  const selectFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const pointerX = (event.clientX - rect.left) * WIDTH / rect.width;
    setActiveIndex(Math.max(0, Math.min(points.length - 1, Math.round((pointerX - PLOT.left) / (PLOT.right - PLOT.left) * (points.length - 1)))));
  };
  const tooltipX = selected ? Math.max(PLOT.left, Math.min(PLOT.right - 205, x(activeIndex) + 10)) : 0;
  const tooltipY = selected ? (y(selected.indexedValue) < 76 ? y(selected.indexedValue) + 16 : y(selected.indexedValue) - 68) : 0;

  return <div className="chart-surface overflow-x-auto rounded-lg bg-white">
    {sourceLabel && <p className="mb-2 text-[11px] font-medium text-slate-500">History source: {sourceLabel}</p>}
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="min-w-[620px] w-full" role="group" tabIndex="0"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      aria-label={`${symbol} indexed closing-price comparison starting at 100. The plotted values are indexed performance, not market prices. Use arrow keys to inspect dates, indexed values, and actual closes.`}
      onPointerMove={selectFromPointer} onPointerDown={selectFromPointer} onPointerLeave={() => setActiveIndex(null)}
      onFocus={() => setActiveIndex((index) => index ?? 0)} onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          setActiveIndex((index) => Math.max(0, Math.min(points.length - 1, (index ?? 0) + (event.key === 'ArrowRight' ? 1 : -1))));
        }
      }}>
      {indexedTicks.map((tick, index) => <g key={index}>
        <line x1={PLOT.left} x2={PLOT.right} y1={y(tick)} y2={y(tick)} stroke="var(--q-chart-grid)"/>
        <text x={PLOT.left - 10} y={y(tick) + 4} textAnchor="end" fill="var(--q-chart-axis)" fontSize="11">{tick.toFixed(1)}</text>
      </g>)}
      <line x1={PLOT.left} x2={PLOT.left} y1={PLOT.top} y2={PLOT.bottom} stroke="var(--q-chart-axis)"/>
      <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom} y2={PLOT.bottom} stroke="var(--q-chart-axis)"/>
      <text x="18" y={(PLOT.top + PLOT.bottom) / 2} textAnchor="middle" fill="var(--q-chart-text)" fontSize="11" transform={`rotate(-90 18 ${(PLOT.top + PLOT.bottom) / 2})`}>Indexed value (start = 100)</text>
      <text x={(PLOT.left + PLOT.right) / 2} y="307" textAnchor="middle" fill="var(--q-chart-text)" fontSize="11">Date</text>
      <line x1={PLOT.left} x2={PLOT.right} y1={y(100)} y2={y(100)} stroke="var(--q-chart-axis)" strokeDasharray="4 4"/>
      <path d={path} fill="none" stroke="var(--q-green)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round"/>
      {dateTicks.map((index) => <g key={points[index].date}>
        <line x1={x(index)} x2={x(index)} y1={PLOT.bottom} y2={PLOT.bottom + 5} stroke="var(--q-chart-axis)"/>
        <text x={x(index)} y={PLOT.bottom + 21} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} fill="var(--q-chart-axis)" fontSize="11">{formatDate(points[index].date, { month: 'short', day: 'numeric', year: '2-digit' })}</text>
      </g>)}
      {selected && <g pointerEvents="none">
        <line x1={x(activeIndex)} x2={x(activeIndex)} y1={PLOT.top} y2={PLOT.bottom} stroke="var(--q-chart-axis)" strokeDasharray="3 3"/>
        <circle cx={x(activeIndex)} cy={y(selected.indexedValue)} r="4.5" fill="var(--q-green)" stroke="white" strokeWidth="2"/>
        <rect x={tooltipX} y={tooltipY} width="198" height="58" rx="6" fill="var(--q-chart-tooltip)"/>
        <text x={tooltipX + 9} y={tooltipY + 16} fill="white" fontSize="10">{selected.date} · {selected.symbol}</text>
        <text x={tooltipX + 9} y={tooltipY + 33} fill="white" fontWeight="600" fontSize="11">Indexed value: {selected.indexedValue.toFixed(2)}</text>
        <text x={tooltipX + 9} y={tooltipY + 49} fill="white" fontSize="10">Actual close: {selected.formattedActualPrice}</text>
      </g>}
    </svg>
    <p className="sr-only" aria-live="polite">{selected ? `${selected.date}, ${selected.symbol}: indexed value ${selected.indexedValue.toFixed(2)}, actual closing price ${selected.formattedActualPrice}` : `Focus the ${symbol} chart and use arrow keys to inspect indexed values and actual prices.`}</p>
  </div>;
}
