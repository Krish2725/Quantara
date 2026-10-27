import { describe, it, expect } from 'vitest';
import samplePortfolio from './fixtures/sample-nifty-portfolio.json';
import {
  calculatePortfolioAllocation,
  calculatePortfolioValueSeries,
  calculatePerformanceSummary,
  calculateSimpleReturns,
  calculateCumulativeReturn,
} from '../src/index.js';

describe('Sample Nifty Portfolio Integration', () => {
  it('computes initial allocation and weights from sample dataset', () => {
    const initialDay = samplePortfolio.history[0];
    const allocation = calculatePortfolioAllocation(
      samplePortfolio.holdings,
      initialDay.prices,
      { cash: samplePortfolio.initialCash }
    );

    // Initial total invested value:
    // RELIANCE: 100 * 2580 = 258,000
    // TCS: 60 * 3810 = 228,600
    // HDFCBANK: 150 * 1700 = 255,000
    // INFY: 120 * 1545 = 185,400
    // ICICIBANK: 140 * 995 = 139,300
    // Invested: 1,066,300 + 50,000 cash = 1,116,300
    expect(allocation.totalValue).toBe(1116300);
    expect(allocation.cash).toBe(50000);
    expect(allocation.cashWeight).toBeCloseTo(50000 / 1116300, 6);

    const reliance = allocation.holdings.find((h) => h.assetId === 'RELIANCE');
    expect(reliance.value).toBe(258000);
    expect(reliance.weight).toBeCloseTo(258000 / 1116300, 6);
  });

  it('computes portfolio value series and performance summary across full history', () => {
    // Transform historical prices
    const historicalPrices = {};
    for (const holding of samplePortfolio.holdings) {
      historicalPrices[holding.assetId] = samplePortfolio.history.map(
        (h) => h.prices[holding.assetId]
      );
    }

    const valueSeries = calculatePortfolioValueSeries(
      samplePortfolio.holdings,
      historicalPrices,
      { cash: samplePortfolio.initialCash }
    );

    expect(valueSeries).toHaveLength(samplePortfolio.history.length);
    expect(valueSeries[0]).toBe(1116300);

    const summary = calculatePerformanceSummary(valueSeries, {
      riskFreeRate: 0.065,
      frequency: 'DAILY',
    });

    expect(summary.observations).toBe(10);
    expect(summary.cumulativeReturn).toBeGreaterThan(0);
    expect(summary.annualizedVolatility).toBeGreaterThan(0);
    expect(summary.maxDrawdown).toBeLessThanOrEqual(0);
    expect(Number.isFinite(summary.sharpeRatio)).toBe(true);
  });

  it('compares portfolio cumulative return with benchmark return', () => {
    const benchmarkPrices = samplePortfolio.history.map((h) => h.benchmarkClose);
    const benchmarkCumReturn = calculateCumulativeReturn(benchmarkPrices, {
      inputType: 'prices',
    });

    // Final day benchmark return: (21894.55 - 21741.90) / 21741.90 ~ +0.702%
    expect(benchmarkCumReturn).toBeCloseTo((21894.55 - 21741.90) / 21741.90, 6);
  });
});
