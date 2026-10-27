import { describe, expect, it } from 'vitest';
import { calculateHistoricalPortfolioAnalysis } from '../src/index.js';

const holdings = [
  {
    assetId: 'AAA', quantity: 2,
    prices: [
      { date: '2025-01-01', price: 10 },
      { date: '2025-01-02', price: 12 },
      { date: '2025-01-03', price: 11 },
      { date: '2025-01-04', price: 12 },
    ],
  },
  {
    assetId: 'BBB', quantity: 1,
    prices: [
      { date: '2025-01-01', price: 20 },
      { date: '2025-01-02', price: 18 },
      { date: '2025-01-03', price: 19 },
      { date: '2025-01-04', price: 19 },
    ],
  },
];

describe('historical portfolio analysis', () => {
  it('supports portfolio-only analysis when benchmark is omitted', () => {
    const result = calculateHistoricalPortfolioAnalysis({ holdings, riskFreeRate: 0 });
    expect(result.benchmark).toBeNull();
    expect(result.comparison).toBeNull();
    expect(result.portfolio.values).toEqual([40, 42, 41, 43]);
  });

  it('constructs buy-and-hold values, date weights, holding attribution and aligned comparison', () => {
    const result = calculateHistoricalPortfolioAnalysis({
      holdings,
      benchmark: {
        name: 'Example Index',
        values: [
          { date: '2025-01-01', value: 100 },
          { date: '2025-01-03', value: 99 },
          { date: '2025-01-04', value: 102 },
          { date: '2025-01-05', value: 103 },
        ],
      },
      riskFreeRate: 0,
      frequency: 'DAILY',
    });

    expect(result.portfolio.values).toEqual([40, 42, 41, 43]);
    expect(result.portfolio.allocations.map(({ date, holdings: allocation }) => ({
      date,
      weights: allocation.map(({ assetId, weight }) => [assetId, weight]),
    }))).toEqual([
      { date: '2025-01-01', weights: [['AAA', 0.5], ['BBB', 0.5]] },
      { date: '2025-01-02', weights: [['AAA', 24 / 42], ['BBB', 18 / 42]] },
      { date: '2025-01-03', weights: [['AAA', 22 / 41], ['BBB', 19 / 41]] },
      { date: '2025-01-04', weights: [['AAA', 24 / 43], ['BBB', 19 / 43]] },
    ]);
    expect(result.portfolio.holdingContributions).toEqual([
      { assetId: 'AAA', initialValue: 20, finalValue: 24, cumulativeContribution: 0.1 },
      { assetId: 'BBB', initialValue: 20, finalValue: 19, cumulativeContribution: -0.025 },
    ]);
    expect(result.portfolio.holdingContributions.reduce((sum, item) => sum + item.cumulativeContribution, 0))
      .toBeCloseTo(result.portfolio.performance.cumulativeReturn, 12);
    expect(result.benchmark.alignedDates).toEqual(['2025-01-01', '2025-01-03', '2025-01-04']);
    expect(result.comparison.portfolioCumulativeReturn).toBeCloseTo(0.075, 12);
    expect(result.comparison.benchmarkCumulativeReturn).toBeCloseTo(0.02, 12);
    expect(result.comparison.cumulativeReturnDifference).toBeCloseTo(0.055, 12);
    expect(result.comparison.relativeCumulativeReturn).toBeCloseTo(1.075 / 1.02 - 1, 12);
  });

  it('rejects a missing date in a holding rather than filling it', () => {
    const incomplete = structuredClone(holdings);
    incomplete[1].prices.splice(1, 1);
    expect(() => calculateHistoricalPortfolioAnalysis({ holdings: incomplete }))
      .toThrow(/dates must exactly match/);
  });

  it('rejects malformed dates and non-positive prices', () => {
    const invalidDate = structuredClone(holdings);
    invalidDate[0].prices[1].date = '2025-02-30';
    expect(() => calculateHistoricalPortfolioAnalysis({ holdings: invalidDate }))
      .toThrow(/valid calendar date/);

    const invalidPrice = structuredClone(holdings);
    invalidPrice[0].prices[1].price = 0;
    expect(() => calculateHistoricalPortfolioAnalysis({ holdings: invalidPrice }))
      .toThrow(/positive finite number/);
  });

  it('rejects duplicate assets and insufficient benchmark overlap', () => {
    expect(() => calculateHistoricalPortfolioAnalysis({ holdings: [holdings[0], holdings[0]] }))
      .toThrow(/Duplicate assetId/);
    expect(() => calculateHistoricalPortfolioAnalysis({
      holdings,
      benchmark: { values: [{ date: '2025-01-01', value: 100 }, { date: '2025-01-04', value: 102 }] },
    })).toThrow(/at least 3 dates/);
  });
});
