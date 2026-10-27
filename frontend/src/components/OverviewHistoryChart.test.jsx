import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import OverviewHistoryChart, { overviewTooltip } from './OverviewHistoryChart.jsx';

describe('overview indexed historical price chart', () => {
  const observations = [
    { date: '2025-01-01', price: 50 },
    { date: '2025-01-02', price: 75 },
    { date: '2025-01-03', price: 60 },
  ];

  it('exposes exact indexed and actual values from the same source close', () => {
    expect(overviewTooltip(observations, 1, 'AAA', 'USD')).toEqual({ date: '2025-01-02', symbol: 'AAA', indexedValue: 150, actualPrice: 75, formattedActualPrice: '$75.00' });
  });

  it('labels indexed performance separately from actual prices and supports responsive keyboard inspection', () => {
    const markup = renderToStaticMarkup(<OverviewHistoryChart observations={observations} symbol="AAA" currency="USD"/>);
    expect(markup).toContain('Indexed value (start = 100)');
    expect(markup).toContain('Date');
    expect(markup).toContain('not market prices');
    expect(markup).toContain('min-w-[620px]');
    expect(markup).toContain('aria-keyshortcuts="ArrowLeft ArrowRight"');
    expect(markup).toContain('min-w-[620px]');
  });

  it('does not invent a chart when provider observations are unavailable', () => {
    expect(renderToStaticMarkup(<OverviewHistoryChart observations={[]} symbol="AAA" currency="USD"/>))
      .toContain('At least two real dated prices');
  });


});
