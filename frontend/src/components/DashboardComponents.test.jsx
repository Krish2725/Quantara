import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AllocationCard,
  ContributionTable,
  PerformanceChart,
  PerformanceKpis,
  Sidebar,
  StatePanel,
} from './DashboardComponents.jsx';
import BrandLogo from './BrandLogo.jsx';
import { MemoryRouter } from 'react-router-dom';
import { formatDate, formatNumber, formatPercent, formatSharpe } from '../utils/format.js';

describe('dashboard states and formatting', () => {
  it('uses the homepage brand mark in the sidebar and links it to the dashboard', () => {
    const publicLogo = renderToStaticMarkup(<MemoryRouter><BrandLogo /></MemoryRouter>);
    const sidebar = renderToStaticMarkup(<MemoryRouter><Sidebar /></MemoryRouter>);
    expect(publicLogo).toContain('href="/"');
    expect(publicLogo).toContain('landing-brand-mark');
    expect(publicLogo).toContain('>Q</span>');
    expect(publicLogo).not.toContain('<svg');
    expect(sidebar).toContain('href="/dashboard"');
    expect(sidebar).toContain('aria-label="Quantara dashboard"');
    expect(sidebar).toContain('landing-brand-mark');
    expect(sidebar).toContain('>Q</span>');
    expect(sidebar).not.toContain('<svg');
  });

  it('renders loading, empty, validation and server states with useful copy', () => {
    expect(renderToStaticMarkup(<StatePanel state="loading" />)).toContain('Calculating portfolio analysis');
    expect(renderToStaticMarkup(<StatePanel state="empty" />)).toContain('No portfolio analysis available');
    expect(renderToStaticMarkup(<StatePanel state="validation-error" message="Bad series" />)).toContain('Bad series');
    expect(renderToStaticMarkup(<StatePanel state="server-error" message="Offline" />)).toContain('Unable to reach the analytics service');
  });

  it('renders chart data from the backend alignedDates response field', () => {
    const analysis = {
      portfolio: {
        dates: ['2025-01-01', '2025-01-02', '2025-01-03'],
        values: [100, 110, 105],
      },
      benchmark: {
        name: 'Illustrative benchmark',
        alignedDates: ['2025-01-01', '2025-01-02', '2025-01-03'],
        alignedValues: [100, 104, 102],
      },
      comparison: {
        alignedDates: ['2025-01-01', '2025-01-02', '2025-01-03'],
        cumulativeReturnDifference: 0.03,
        relativeCumulativeReturn: 0.029,
      },
    };
    const markup = renderToStaticMarkup(<PerformanceChart analysis={analysis} />);
    expect(markup).toContain('Portfolio and benchmark indexed performance chart');
    expect(markup).toContain('Illustrative benchmark');
    expect(markup).not.toContain('Performance chart unavailable');
  });

  it('shows empty states instead of throwing when dashboard component arrays are absent', () => {
    expect(renderToStaticMarkup(<PerformanceChart analysis={{ comparison: {}, portfolio: {}, benchmark: {} }} />))
      .toContain('Performance chart unavailable');
    expect(renderToStaticMarkup(<AllocationCard />)).toContain('No allocation data is available');
    expect(renderToStaticMarkup(<ContributionTable />)).toContain('No holding contribution data is available');
    expect(renderToStaticMarkup(<PerformanceKpis />)).toContain('No portfolio metrics are available');
  });

  it('formats values and decimal returns without changing their meaning', () => {
    expect(formatNumber(1234.5)).toBe('1,234.50');
    expect(formatPercent(0.025, { digits: 2 })).toBe('+2.50%');
    expect(formatPercent(-0.1)).toBe('-10.0%');
    expect(formatSharpe(1.234)).toBe('1.23');
    expect(formatDate('2025-01-06')).toBe('Jan 6');
  });
});
