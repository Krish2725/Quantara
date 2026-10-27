import { describe, it, expect } from 'vitest';
import { calculatePerformanceSummary } from '../src/index.js';
import { fixtureA } from './fixtures/hand-calculated.js';

describe('calculatePerformanceSummary', () => {
  it('aggregates returns, cumulative return, volatility, max drawdown, and Sharpe ratio', () => {
    const summary = calculatePerformanceSummary(fixtureA.prices, {
      riskFreeRate: fixtureA.expected.sharpe.rf,
      frequency: 'DAILY',
    });

    expect(summary.observations).toBe(fixtureA.prices.length);
    expect(summary.cumulativeReturn).toBeCloseTo(fixtureA.expected.cumulativeReturn, 8);
    expect(summary.annualizedReturn).toBeCloseTo(fixtureA.expected.sharpe.annualizedReturn, 6);
    expect(summary.annualizedVolatility).toBeCloseTo(
      fixtureA.expected.annualizedVolatilityDaily,
      6
    );
    expect(summary.maxDrawdown).toBeCloseTo(fixtureA.expected.drawdown.maxDrawdown, 6);
    expect(summary.sharpeRatio).toBeCloseTo(fixtureA.expected.sharpe.sharpeRatio, 6);
    expect(summary.drawdownDetails.peakIndex).toBe(fixtureA.expected.drawdown.peakIndex);
    expect(summary.drawdownDetails.troughIndex).toBe(fixtureA.expected.drawdown.troughIndex);
  });

  it('rejects invalid, non-positive, or non-finite value series', () => {
    for (const values of [[], [1], [1, 0], [1, -1], [1, NaN], [1, Infinity], ['1', 2]]) {
      expect(() => calculatePerformanceSummary(values, { riskFreeRate: 0 })).toThrow();
    }
  });

  it('reports zero return, volatility, drawdown, and Sharpe for a constant positive series at zero risk-free rate', () => {
    const summary = calculatePerformanceSummary([100, 100, 100], { riskFreeRate: 0 });
    expect(summary.cumulativeReturn).toBe(0);
    expect(summary.annualizedVolatility).toBe(0);
    expect(summary.maxDrawdown).toBe(0);
    expect(summary.sharpeRatio).toBe(0);
  });

  it('matches independently calculable metrics for a two-return price series', () => {
    const summary = calculatePerformanceSummary([100, 110, 99], { riskFreeRate: 0.065, frequency: 'DAILY' });
    const expectedDailySampleVolatility = Math.sqrt(0.02);
    const expectedAnnualizedVolatility = expectedDailySampleVolatility * Math.sqrt(252);
    const dailyRiskFreeRate = (1 + 0.065) ** (1 / 252) - 1;

    expect(summary.observations).toBe(3);
    expect(summary.cumulativeReturn).toBeCloseTo((99 / 100) - 1, 12);
    expect(summary.annualizedReturn).toBe(0); // mean of +10% and -10%, multiplied by 252
    expect(summary.annualizedVolatility).toBeCloseTo(expectedAnnualizedVolatility, 12);
    expect(summary.sharpeRatio).toBeCloseTo(((0 - dailyRiskFreeRate) / expectedDailySampleVolatility) * Math.sqrt(252), 12);
    expect(summary.sharpeDetails.periodicRiskFreeRate).toBeCloseTo(dailyRiskFreeRate, 12);
    expect(summary.drawdownDetails.drawdownSeries).toEqual([0, 0, expect.closeTo(-0.1, 12)]);
    expect(summary.maxDrawdown).toBe(-0.1);
  });

  it('rejects finite inputs that overflow derived risk metrics', () => {
    expect(() => calculatePerformanceSummary([1, 1e200, 1e300], { frequency: 1e308 }))
      .toThrow(/not finite/);
  });
});
