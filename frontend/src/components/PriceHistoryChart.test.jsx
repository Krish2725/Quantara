import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PriceHistoryChart, { formatPrice, scalePriceValue } from './PriceHistoryChart.jsx';

describe('historical closing price chart', () => {
  it('shows a currency price axis, dated horizontal ticks, and a keyboard-inspectable chart', () => {
    const markup = renderToStaticMarkup(<PriceHistoryChart symbol="TSLA" currency="USD" observations={[
      { date: '2025-01-01', price: 379.28 }, { date: '2025-01-02', price: 410.44 }, { date: '2025-01-03', price: 398.12 },
    ]}/>);
    expect(markup).toContain('Closing price (USD, linear scale)');
    expect(markup).toContain('Date');
    expect(markup).toContain('aria-keyshortcuts="ArrowLeft ArrowRight"');
    expect(markup).toContain('TSLA closing prices in USD');
    expect(markup).toContain('$412.9328');
    expect(markup).toContain('Logarithmic');
    expect(markup).not.toContain('indexed to 100');
  });
  it('formats tooltip values in the instrument currency and safely declines invalid points', () => {
    expect(formatPrice(123.4567, 'USD')).toBe('$123.4567');
    expect(scalePriceValue(100, 'linear')).toBe(100);
    expect(scalePriceValue(100, 'logarithmic')).toBeCloseTo(Math.log(100), 12);
    const markup = renderToStaticMarkup(<PriceHistoryChart currency="USD" observations={[{ date: '2025-01-01', price: 100 }, { date: 'bad', price: 200 }]}/>);
    expect(markup).toContain('At least two valid dated prices');
  });
});
