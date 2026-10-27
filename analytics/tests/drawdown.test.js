import { describe, it, expect } from 'vitest';
import {
  calculateDrawdown,
  calculateMaxDrawdown,
} from '../src/drawdown.js';
import { ValidationError } from '../src/validators.js';
import { fixtureA, fixtureC } from './fixtures/hand-calculated.js';

describe('drawdown module', () => {
  describe('calculateDrawdown', () => {
    it('matches hand-calculated drawdown profile for fixtureA', () => {
      const result = calculateDrawdown(fixtureA.prices);

      expect(result.maxDrawdown).toBeCloseTo(fixtureA.expected.drawdown.maxDrawdown, 8);
      expect(result.peakValue).toBe(fixtureA.expected.drawdown.peakValue);
      expect(result.peakIndex).toBe(fixtureA.expected.drawdown.peakIndex);
      expect(result.troughValue).toBe(fixtureA.expected.drawdown.troughValue);
      expect(result.troughIndex).toBe(fixtureA.expected.drawdown.troughIndex);
      expect(result.recoveryIndex).toBe(fixtureA.expected.drawdown.recoveryIndex);
      expect(result.drawdownDuration).toBe(fixtureA.expected.drawdown.drawdownDuration);
      expect(result.recoveryDuration).toBe(fixtureA.expected.drawdown.recoveryDuration);

      expect(result.drawdownSeries).toHaveLength(fixtureA.prices.length);
      for (let i = 0; i < result.drawdownSeries.length; i++) {
        expect(result.drawdownSeries[i]).toBeCloseTo(
          fixtureA.expected.drawdown.drawdownSeries[i],
          8
        );
      }
    });

    it('matches severe 40% crash with recovery in fixtureC', () => {
      const result = calculateDrawdown(fixtureC.values);

      expect(result.maxDrawdown).toBeCloseTo(fixtureC.expected.maxDrawdown, 6);
      expect(result.maxDrawdownPercent).toBeCloseTo(-40.0, 6);
      expect(result.peakValue).toBe(fixtureC.expected.peakValue);
      expect(result.peakIndex).toBe(fixtureC.expected.peakIndex);
      expect(result.troughValue).toBe(fixtureC.expected.troughValue);
      expect(result.troughIndex).toBe(fixtureC.expected.troughIndex);
      expect(result.recoveryIndex).toBe(fixtureC.expected.recoveryIndex);
      expect(result.drawdownDuration).toBe(fixtureC.expected.drawdownDuration);
      expect(result.recoveryDuration).toBe(fixtureC.expected.recoveryDuration);
    });

    it('reports 0.0 maxDrawdown and null recovery for monotonically increasing values', () => {
      const values = [100, 110, 120, 130];
      const result = calculateDrawdown(values);

      expect(result.maxDrawdown).toBe(0.0);
      expect(result.maxDrawdownPercent).toBe(0.0);
      expect(result.recoveryIndex).toBeNull();
      expect(result.recoveryDuration).toBeNull();
    });

    it('identifies unrecovered drawdown when series ends before regaining peak', () => {
      const values = [100, 150, 120, 90, 110];
      const result = calculateDrawdown(values);

      expect(result.peakValue).toBe(150);
      expect(result.peakIndex).toBe(1);
      expect(result.troughValue).toBe(90);
      expect(result.troughIndex).toBe(3);
      expect(result.maxDrawdown).toBeCloseTo((90 - 150) / 150, 6); // -40%
      expect(result.recoveryIndex).toBeNull(); // 110 is still < 150
      expect(result.recoveryDuration).toBeNull();
    });

    it('handles single value series with 0.0 drawdown', () => {
      const result = calculateDrawdown([100]);
      expect(result.maxDrawdown).toBe(0.0);
      expect(result.peakValue).toBe(100);
      expect(result.drawdownSeries).toEqual([0.0]);
    });

    it('throws ValidationError for empty array or non-array', () => {
      expect(() => calculateDrawdown([])).toThrow(ValidationError);
      expect(() => calculateDrawdown(null)).toThrow(ValidationError);
    });

    it('throws ValidationError when initial value is 0 or negative', () => {
      expect(() => calculateDrawdown([0, 10, 20])).toThrow(ValidationError);
      expect(() => calculateDrawdown([-5, 10, 20])).toThrow(ValidationError);
    });

    it('throws ValidationError when series contains negative or NaN values', () => {
      expect(() => calculateDrawdown([100, -10, 80])).toThrow(ValidationError);
      expect(() => calculateDrawdown([100, NaN, 80])).toThrow(ValidationError);
    });
  });

  describe('calculateMaxDrawdown scalar helper', () => {
    it('returns scalar maxDrawdown directly', () => {
      const mdd = calculateMaxDrawdown(fixtureC.values);
      expect(mdd).toBeCloseTo(-0.40, 6);
    });
  });
});
