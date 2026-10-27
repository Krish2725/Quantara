import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculatePortfolioHealth } from '@quantara/analytics';
import PortfolioHealthPanel from './PortfolioHealthPanel.jsx';

describe('PortfolioHealthPanel', () => {
  it('renders only open holdings with actual quote, position, score, and data-quality details', () => {
    const health = calculatePortfolioHealth({ holdings: [
      { symbol: 'TSLA', name: 'Tesla', currency: 'USD', quantity: 2, costBasis: 200, averageCost: 100,
        marketValue: 220, currentPrice: 110, unrealizedPnl: 20, unrealizedPnlPercent: 0.1,
        quoteTimestamp: '2026-09-18T20:00:00Z', historyValues: [
          { date: '2026-01-01', price: 100 }, { date: '2026-02-01', price: 105 }, { date: '2026-03-01', price: 110 },
        ] },
      { symbol: 'NVDA', quantity: 0, costBasis: 0, marketValue: null, unrealizedPnl: null, historyValues: [{ date: '2026-01-01', price: 1 }] },
    ], realizedPnl: 5, totalBuyCost: 200 });
    const html = renderToStaticMarkup(<PortfolioHealthPanel health={health} currency="USD"/>);
    expect(html).toContain('Portfolio health estimate');
    expect(html).toContain('TSLA');
    expect(html).toContain('Tesla');
    expect(html).toContain('110');
    expect(html).toContain('2');
    expect(html).not.toContain('NVDA');
    expect(html).toContain('provider histories');
    expect(html).toContain('Unrealized return 10.0%');
  });

  it('shows an explicit unavailable state for an empty portfolio', () => {
    const html = renderToStaticMarkup(<PortfolioHealthPanel health={calculatePortfolioHealth({ holdings: [] })}/>);
    expect(html).toContain('Insufficient data');
  });
});
