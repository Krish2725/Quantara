import { useState } from 'react';
import { formatDate } from '../utils/format.js';

const WIDTH = 760;
const HEIGHT = 280;
const PLOT = { left: 76, right: 744, top: 22, bottom: 222 };

function niceStep(span) {
  const raw = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

export function drawdownScale(values) {
  const minimum = Math.min(0, ...values);
  const step = niceStep(minimum < 0 ? Math.abs(minimum) : 1);
  const low = Math.floor(minimum / step) * step || -step;
  const ticks = [];
  for (let value = low; value < 0; value += step) ticks.push(Number(value.toFixed(10)));
  ticks.push(0);
  return { low, high: 0, ticks };
}

export function formatDrawdown(value) {
  return `${value.toFixed(4)}%`;
}

function formatTick(value) {
  return `${Number(value.toFixed(2))}%`;
}

export default function DrawdownChart({ dates, values }) {
  const [activeIndex, setActiveIndex] = useState(null);
  if (!Array.isArray(values) || values.length < 2 || !Array.isArray(dates) || dates.length !== values.length
    || values.some((value) => !Number.isFinite(value) || value > 0)) {
    return <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">At least two valid non-positive drawdown observations are needed to chart this history.</p>;
  }

  const { low, high, ticks } = drawdownScale(values);
  const x = (index) => PLOT.left + (PLOT.right - PLOT.left) * index / (values.length - 1);
  const y = (value) => PLOT.top + (high - value) / (high - low) * (PLOT.bottom - PLOT.top);
  const path = values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(' ');
  const dateTicks = [...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1])];
  const selected = activeIndex == null ? null : { date: dates[activeIndex], value: values[activeIndex] };
  const selectFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const pointerX = (event.clientX - rect.left) * WIDTH / rect.width;
    const index = Math.max(0, Math.min(values.length - 1, Math.round((pointerX - PLOT.left) / (PLOT.right - PLOT.left) * (values.length - 1))));
    setActiveIndex(index);
  };
  const tooltipX = selected ? Math.max(PLOT.left, Math.min(PLOT.right - 160, x(activeIndex) + 10)) : 0;
  const tooltipY = selected ? (y(selected.value) < 75 ? y(selected.value) + 14 : y(selected.value) - 52) : 0;

  return <div className="chart-surface overflow-x-auto rounded-lg bg-white">
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="min-w-[530px] w-full" role="group"
      aria-label="Historical drawdown chart with a zero reference line. Vertical axis is drawdown percentage; horizontal axis is date. Focus the chart and use left and right arrow keys to inspect exact dates and drawdowns."
      tabIndex="0" aria-keyshortcuts="ArrowLeft ArrowRight"
      onPointerMove={selectFromPointer} onPointerDown={selectFromPointer} onPointerLeave={() => setActiveIndex(null)}
      onFocus={() => setActiveIndex((index) => index ?? 0)} onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          setActiveIndex((index) => Math.max(0, Math.min(values.length - 1, (index ?? 0) + (event.key === 'ArrowRight' ? 1 : -1))));
        }
      }}>
      {ticks.map((tick) => <g key={tick}>
        <line x1={PLOT.left} x2={PLOT.right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? 'var(--q-chart-zero)' : 'var(--q-chart-grid)'} strokeWidth={tick === 0 ? 1.5 : 1}/>
        <text x={PLOT.left - 10} y={y(tick) + 4} textAnchor="end" fill="var(--q-chart-axis)" fontSize="11">{formatTick(tick)}</text>
        {tick === 0 && <title>Zero drawdown reference (0%)</title>}
      </g>)}
      <line x1={PLOT.left} x2={PLOT.left} y1={PLOT.top} y2={PLOT.bottom} stroke="var(--q-chart-axis)"/>
      <line x1={PLOT.left} x2={PLOT.right} y1={PLOT.bottom} y2={PLOT.bottom} stroke="var(--q-chart-axis)"/>
      <text x="17" y={(PLOT.top + PLOT.bottom) / 2} textAnchor="middle" fill="var(--q-chart-text)" fontSize="11" transform={`rotate(-90 17 ${(PLOT.top + PLOT.bottom) / 2})`}>Drawdown (%)</text>
      <text x={(PLOT.left + PLOT.right) / 2} y="274" textAnchor="middle" fill="var(--q-chart-text)" fontSize="11">Date</text>
      <path d={path} fill="none" stroke="var(--q-green)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round"/>
      {dateTicks.map((index) => <g key={dates[index]}>
        <line x1={x(index)} x2={x(index)} y1={PLOT.bottom} y2={PLOT.bottom + 5} stroke="var(--q-chart-axis)"/>
        <text x={x(index)} y={PLOT.bottom + 21} textAnchor={index === 0 ? 'start' : index === values.length - 1 ? 'end' : 'middle'} fill="var(--q-chart-axis)" fontSize="10">{formatDate(dates[index], { month: 'short', day: 'numeric', year: '2-digit' })}</text>
      </g>)}
      {selected && <g pointerEvents="none">
        <line x1={x(activeIndex)} x2={x(activeIndex)} y1={PLOT.top} y2={PLOT.bottom} stroke="var(--q-chart-axis)" strokeDasharray="3 3"/>
        <circle cx={x(activeIndex)} cy={y(selected.value)} r="4.5" fill="var(--q-green)" stroke="white" strokeWidth="2"/>
        <rect x={tooltipX} y={tooltipY} width="150" height="42" rx="6" fill="var(--q-chart-tooltip)"/>
        <text x={tooltipX + 9} y={tooltipY + 16} fill="white" fontSize="10">{selected.date}</text>
        <text x={tooltipX + 9} y={tooltipY + 32} fill="white" fontWeight="600" fontSize="11">{formatDrawdown(selected.value)}</text>
      </g>}
    </svg>
    <p className="sr-only" aria-live="polite">{selected ? `${selected.date}: ${formatDrawdown(selected.value)}` : 'Focus the chart and use the arrow keys to inspect drawdown values.'}</p>
  </div>;
}
