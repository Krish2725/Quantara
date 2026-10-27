import { describe, it, expect } from 'vitest';
import {
  calculateSimpleReturns,
  calculateCumulativeReturn,
  calculateCumulativeReturnSeries,
} from '../src/returns.js';
import { ValidationError } from '../src/validators.js';
import { fixtureA } from './fixtures/hand-calculated.js';

describe('returns module', () => {
  describe('calculateSimpleReturns', () => {
    it('accurately computes simple period returns from fixtureA prices', () => {
      const returns = calculateSimpleReturns(fixtureA.prices);

      expect(returns).toHaveLength(fixtureA.expected.returns.length);
      for (let i = 0; i < returns.length; i++) {
        expect(returns[i]).toBeCloseTo(fixtureA.expected.returns[i], 8);
      }
    });

    it('returns zero for a flat price series', () => {
      const prices = [100, 100, 100, 100];
      const returns = calculateSimpleReturns(prices);
      expect(returns).toEqual([0, 0, 0]);
    });

    it('accurately captures a 100% gain and 50% drop', () => {
      const prices = [10, 20, 10];
      const returns = calculateSimpleReturns(prices);
      expect(returns).toEqual([1.0, -0.5]);
    });

    it('throws ValidationError when fewer than 2 prices are provided', () => {
      expect(() => calculateSimpleReturns([100])).toThrow(ValidationError);
      expect(() => calculateSimpleReturns([])).toThrow(ValidationError);
    });

    it('throws ValidationError for non-array inputs', () => {
      expect(() => calculateSimpleReturns(null)).toThrow(ValidationError);
      expect(() => calculateSimpleReturns('100,105')).toThrow(ValidationError);
    });

    it('throws ValidationError for zero or negative prices', () => {
      expect(() => calculateSimpleReturns([100, 0])).toThrow(ValidationError);
      expect(() => calculateSimpleReturns([100, -5])).toThrow(ValidationError);
    });

    it('throws ValidationError for NaN or null in prices without silent coercion', () => {
      expect(() => calculateSimpleReturns([100, NaN, 105])).toThrow(ValidationError);
      expect(() => calculateSimpleReturns([100, null, 105])).toThrow(ValidationError);
      expect(() => calculateSimpleReturns([100, undefined, 105])).toThrow(ValidationError);
    });
  });

  describe('calculateCumulativeReturn', () => {
    it('accurately computes cumulative return from returns using compounding', () => {
      const cumReturn = calculateCumulativeReturn(fixtureA.expected.returns, {
        inputType: 'returns',
      });
      expect(cumReturn).toBeCloseTo(fixtureA.expected.cumulativeReturn, 8);
    });

    it('accurately computes cumulative return directly from prices', () => {
      const cumReturn = calculateCumulativeReturn(fixtureA.prices, {
        inputType: 'prices',
      });
      expect(cumReturn).toBeCloseTo(fixtureA.expected.cumulativeReturn, 8);
    });

    it('returns 0.0 for an empty return series', () => {
      expect(calculateCumulativeReturn([], { inputType: 'returns' })).toBe(0.0);
    });

    it('handles total 100% loss (-1.0) correctly', () => {
      const cumReturn = calculateCumulativeReturn([-0.5, -1.0], { inputType: 'returns' });
      expect(cumReturn).toBe(-1.0);
    });

    it('throws ValidationError for return < -1.0 in unleveraged long portfolio', () => {
      expect(() =>
        calculateCumulativeReturn([-1.2], { inputType: 'returns' })
      ).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid inputType', () => {
      expect(() =>
        calculateCumulativeReturn([0.05], { inputType: 'unsupported' })
      ).toThrow(ValidationError);
    });
  });

  describe('calculateCumulativeReturnSeries', () => {
    it('produces cumulative return curve starting at base 0.0 from prices', () => {
      const series = calculateCumulativeReturnSeries(fixtureA.prices, {
        inputType: 'prices',
      });
      expect(series).toHaveLength(fixtureA.prices.length);
      expect(series[0]).toBe(0.0);
      for (let i = 0; i < series.length; i++) {
        expect(series[i]).toBeCloseTo(fixtureA.expected.cumulativeReturnSeries[i], 8);
      }
    });

    it('produces cumulative return curve starting at base 0.0 from returns', () => {
      const series = calculateCumulativeReturnSeries(fixtureA.expected.returns, {
        inputType: 'returns',
      });
      expect(series).toHaveLength(fixtureA.expected.returns.length + 1);
      expect(series[0]).toBe(0.0);
      for (let i = 0; i < series.length; i++) {
        expect(series[i]).toBeCloseTo(fixtureA.expected.cumulativeReturnSeries[i], 8);
      }
    });

    it('throws ValidationError for invalid inputType in calculateCumulativeReturnSeries', () => {
      expect(() =>
        calculateCumulativeReturnSeries([0.05], { inputType: 'invalid' })
      ).toThrow(ValidationError);
    });
  });
});
