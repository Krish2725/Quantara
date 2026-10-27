import { describe, expect, it } from 'vitest';
import { calculatePortfolioHealth } from '../src/health.js';

function position(symbol, { quantity = 1, costBasis = 100, marketValue = 110, historyValues = [
  { date: '2025-01-01', price: 100 }, { date: '2025-01-02', price: 105 }, { date: '2025-01-03', price: 110 },
] } = {}) {
  return { symbol, name: symbol, quantity, costBasis, averageCost: costBasis / quantity, marketValue,
    unrealizedPnl: marketValue == null ? null : marketValue - costBasis,
    unrealizedPnlPercent: marketValue == null ? null : (marketValue - costBasis) / costBasis,
    currentPrice: marketValue == null ? null : marketValue / quantity, quoteTimestamp: '2025-01-03T20:00:00Z',
    currency: 'USD', historyValues };
}

describe('transparent portfolio health and holding ratings', () => {
  it('is deterministic and excludes zero-quantity imported-only symbols', () => {
    const input = { holdings: [position('AAA'), position('CSVONLY', { quantity: 0, historyValues: [{ date: '2025-01-01', price: 1 }] })], realizedPnl: 20, totalBuyCost: 200 };
    const first = calculatePortfolioHealth(input);
    expect(calculatePortfolioHealth(input)).toEqual(first);
    expect(first.holdings.map((item) => item.symbol)).toEqual(['AAA']);
    expect(first.score).toBeGreaterThanOrEqual(0);
    expect(first.score).toBeLessThanOrEqual(100);
  });

  it('moves performance scores with percentage returns and keeps realized return separate', () => {
    const loss = calculatePortfolioHealth({ holdings: [position('AAA', { marketValue: 80 })], realizedPnl: 0, totalBuyCost: 100 });
    const gain = calculatePortfolioHealth({ holdings: [position('AAA', { marketValue: 120 })], realizedPnl: 0, totalBuyCost: 100 });
    const realizedGain = calculatePortfolioHealth({ holdings: [position('AAA', { marketValue: 120 })], realizedPnl: 50, totalBuyCost: 100 });
    expect(gain.components.unrealizedPerformance.returnPercent).toBe(20);
    expect(loss.components.unrealizedPerformance.returnPercent).toBe(-20);
    expect(gain.holdings[0].unrealizedPnl).toBe(20);
    expect(realizedGain.components.realizedPerformance.returnPercent).toBe(50);
    expect(realizedGain.components.unrealizedPerformance.returnPercent).toBe(20);
  });

  it('reflects concentration, volatility, and drawdown in their separate components', () => {
    const one = calculatePortfolioHealth({ holdings: [position('AAA')], realizedPnl: 0, totalBuyCost: 100 });
    const diversified = calculatePortfolioHealth({ holdings: [position('AAA'), position('BBB')], realizedPnl: 0, totalBuyCost: 200 });
    const volatile = calculatePortfolioHealth({ holdings: [position('AAA', { historyValues: [
      { date: '2025-01-01', price: 100 }, { date: '2025-01-02', price: 180 }, { date: '2025-01-03', price: 70 },
    ] })], realizedPnl: 0, totalBuyCost: 100 });
    expect(diversified.components.diversification.score).toBeGreaterThan(one.components.diversification.score);
    expect(volatile.components.volatility.score).toBeLessThan(one.components.volatility.score);
    expect(volatile.components.drawdown.score).toBeLessThan(one.components.drawdown.score);
    expect(volatile.holdings[0].maximumDrawdown).toBeCloseTo(-110 / 180);
  });

  it('reports missing quote/history coverage explicitly and handles zero cost basis safely', () => {
    const health = calculatePortfolioHealth({ holdings: [
      position('AAA', { costBasis: 0, marketValue: null, historyValues: [] }),
      position('BBB', { marketValue: null, historyValues: [] }),
    ], realizedPnl: 0, totalBuyCost: 0 });
    expect(health.provisional).toBe(true);
    expect(health.components.unrealizedPerformance.available).toBe(false);
    expect(health.components.diversification.available).toBe(false);
    expect(health.coverage.quoteCoveragePercent).toBe(0);
    expect(health.coverage.historyCoveragePercent).toBe(0);
    expect(Number.isFinite(health.score)).toBe(true);
    expect(health.holdings[0].category).toBe('Insufficient Data');
    expect(calculatePortfolioHealth({ holdings: [] }).score).toBeNull();
  });

  it('does not use future observations in holding history or ratings', () => {
    const result = calculatePortfolioHealth({ asOfDate: '2025-01-03', holdings: [position('AAA', { historyValues: [
      { date: '2025-01-01', price: 100 }, { date: '2025-01-02', price: 110 },
      { date: '2025-01-03', price: 90 }, { date: '2025-01-04', price: 1000 },
    ] })] });
    expect(result.coverage.historyCount).toBe(1);
    expect(result.holdings[0].maximumDrawdown).toBeCloseTo(-20 / 110);
    expect(() => calculatePortfolioHealth({ asOfDate: '2025-02-31' })).toThrow(/ISO calendar date/);
  });

  it('accepts validated category threshold overrides', () => {
    const result = calculatePortfolioHealth({ holdings: [position('AAA')], healthThresholds: { excellent: 90, good: 70, neutral: 50, poor: 20 } });
    expect(['Excellent', 'Good', 'Neutral', 'Poor', 'Very Poor']).toContain(result.category);
    expect(() => calculatePortfolioHealth({ holdings: [], stockThresholds: { excellent: 50, good: 70, neutral: 45, poor: 30 } })).toThrow(/thresholds/);
  });
});
