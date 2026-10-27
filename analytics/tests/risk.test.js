import { describe, it, expect } from 'vitest';
import {
  calculateSampleVolatility,
  calculateAnnualizedVolatility,
  calculateSharpeRatio,
} from '../src/risk.js';
import { resolveAnnualizationFactor } from '../src/constants.js';
import { CalculationError, ValidationError } from '../src/validators.js';
import { fixtureA } from './fixtures/hand-calculated.js';

describe('risk module', () => {
  describe('calculateSampleVolatility', () => {
    it('matches hand-calculated sample standard deviation for fixtureA', () => {
      const vol = calculateSampleVolatility(fixtureA.expected.returns);
      expect(vol).toBeCloseTo(fixtureA.expected.sampleVolatility, 8);
    });

    it('returns zero variance when all returns are identical', () => {
      const constantReturns = [0.02, 0.02, 0.02, 0.02];
      const vol = calculateSampleVolatility(constantReturns);
      expect(vol).toBe(0.0);
    });

    it('throws ValidationError for fewer than 2 return observations', () => {
      expect(() => calculateSampleVolatility([0.05])).toThrow(ValidationError);
      expect(() => calculateSampleVolatility([])).toThrow(ValidationError);
    });

    it('throws ValidationError when invalid non-numeric values exist', () => {
      expect(() => calculateSampleVolatility([0.05, NaN])).toThrow(ValidationError);
      expect(() => calculateSampleVolatility([0.05, null])).toThrow(ValidationError);
    });
  });

  describe('calculateAnnualizedVolatility', () => {
    it('accurately annualizes daily volatility with factor 252 for fixtureA', () => {
      const volDaily = calculateAnnualizedVolatility(fixtureA.expected.returns, 'DAILY');
      expect(volDaily).toBeCloseTo(fixtureA.expected.annualizedVolatilityDaily, 8);
    });

    it('supports MONTHLY frequency factor 12', () => {
      const sampleVol = calculateSampleVolatility(fixtureA.expected.returns);
      const volMonthly = calculateAnnualizedVolatility(fixtureA.expected.returns, 'MONTHLY');
      expect(volMonthly).toBeCloseTo(sampleVol * Math.sqrt(12), 8);
    });

    it('supports custom numeric annualization factor', () => {
      const sampleVol = calculateSampleVolatility(fixtureA.expected.returns);
      const volCustom = calculateAnnualizedVolatility(fixtureA.expected.returns, 365);
      expect(volCustom).toBeCloseTo(sampleVol * Math.sqrt(365), 8);
    });

    it('throws TypeError for unknown frequency string', () => {
      expect(() =>
        calculateAnnualizedVolatility(fixtureA.expected.returns, 'HOURLY')
      ).toThrow(TypeError);
    });

    it('throws RangeError for non-positive or infinite numeric factor', () => {
      expect(() =>
        calculateAnnualizedVolatility(fixtureA.expected.returns, -10)
      ).toThrow(RangeError);
      expect(() =>
        calculateAnnualizedVolatility(fixtureA.expected.returns, 0)
      ).toThrow(RangeError);
      expect(() =>
        calculateAnnualizedVolatility(fixtureA.expected.returns, Infinity)
      ).toThrow(RangeError);
    });
  });

  describe('calculateSharpeRatio', () => {
    it('matches hand-calculated Sharpe ratio for fixtureA with specified Rf and factor', () => {
      const result = calculateSharpeRatio(fixtureA.expected.returns, {
        riskFreeRate: fixtureA.expected.sharpe.rf,
        frequency: 'DAILY',
      });

      expect(result.sharpeRatio).toBeCloseTo(fixtureA.expected.sharpe.sharpeRatio, 6);
      expect(result.annualizedReturn).toBeCloseTo(fixtureA.expected.sharpe.annualizedReturn, 6);
      expect(result.excessReturn).toBeCloseTo(fixtureA.expected.sharpe.excessReturn, 6);
      expect(result.annualizedVolatility).toBeCloseTo(
        fixtureA.expected.annualizedVolatilityDaily,
        6
      );
      expect(result.riskFreeRate).toBe(fixtureA.expected.sharpe.rf);
      expect(result.periodicRiskFreeRate).toBeCloseTo(fixtureA.expected.sharpe.dailyRf, 12);
      expect(result.annualizationFactor).toBe(252);
    });

    it('correctly produces negative Sharpe ratio when returns underperform Rf', () => {
      // Annual return is 2%, Rf is 6% => Excess is -4%
      // 4 periods with 0.005 / 252 daily
      const lowReturns = [0.0001, 0.0002, 0.0001, 0.0003];
      const result = calculateSharpeRatio(lowReturns, {
        riskFreeRate: 0.065,
        frequency: 'DAILY',
      });

      expect(result.excessReturn).toBeLessThan(0);
      expect(result.sharpeRatio).toBeLessThan(0);
    });

    it('returns 0.0 Sharpe ratio when volatility is 0 and excess return is 0', () => {
      // Periodic return = Rf / 252 => Excess return = 0
      const rf = 0.0504;
      const k = 252;
      const periodicRate = (1 + rf) ** (1 / k) - 1;
      const flatReturns = [periodicRate, periodicRate, periodicRate];

      const result = calculateSharpeRatio(flatReturns, {
        riskFreeRate: rf,
        frequency: 'DAILY',
      });

      expect(result.sharpeRatio).toBe(0.0);
      expect(result.annualizedVolatility).toBe(0.0);
    });

    it('throws CalculationError when volatility is zero and excess return is non-zero', () => {
      // Risk is zero but return exceeds risk-free rate
      const returns = [0.01, 0.01, 0.01];
      expect(() =>
        calculateSharpeRatio(returns, { riskFreeRate: 0.05, frequency: 'DAILY' })
      ).toThrow(CalculationError);
    });

    it('validates non-numeric risk free rate', () => {
      expect(() =>
        calculateSharpeRatio([0.01, 0.02], { riskFreeRate: 'invalid' })
      ).toThrow(ValidationError);
    });

    it('uses effective geometric conversion of the annual rate at a configurable observation factor', () => {
      const returns = [0.02, 0.04];
      const factor = 12;
      const annualRf = 0.03;
      const sampleDeviation = Math.sqrt(0.0002);
      const periodicRf = (1 + annualRf) ** (1 / factor) - 1;
      const result = calculateSharpeRatio(returns, { riskFreeRate: annualRf, frequency: factor });
      expect(result.periodicRiskFreeRate).toBeCloseTo(periodicRf, 12);
      expect(result.sharpeRatio).toBeCloseTo(((0.03 - periodicRf) / sampleDeviation) * Math.sqrt(factor), 12);
      expect(result.annualizationFactor).toBe(factor);
    });

    it('rejects annual risk-free rates that cannot be geometrically converted and non-finite derived results', () => {
      expect(() => calculateSharpeRatio([0.01, 0.02], { riskFreeRate: -1 })).toThrow(/greater than -1/);
      expect(() => calculateSharpeRatio([0.01, 0.02], { riskFreeRate: 1e308, frequency: 1e-6 }))
        .toThrow(CalculationError);
    });
  });

  describe('resolveAnnualizationFactor', () => {
    it('resolves standard keys case-insensitively', () => {
      expect(resolveAnnualizationFactor('daily')).toBe(252);
      expect(resolveAnnualizationFactor('Weekly')).toBe(52);
      expect(resolveAnnualizationFactor('MONTHLY')).toBe(12);
      expect(resolveAnnualizationFactor('quarterly')).toBe(4);
      expect(resolveAnnualizationFactor('annual')).toBe(1);
    });

    it('throws TypeError for non-string, non-numeric inputs', () => {
      expect(() => resolveAnnualizationFactor(true)).toThrow(TypeError);
      expect(() => resolveAnnualizationFactor({})).toThrow(TypeError);
    });
  });
});
