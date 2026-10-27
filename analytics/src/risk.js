/**
 * Risk and performance ratio calculations for Quantara.
 */

import {
  DEFAULT_ANNUALIZATION_FREQUENCY,
  DEFAULT_RISK_FREE_RATE,
  resolveAnnualizationFactor,
} from './constants.js';
import {
  assertFiniteNumber,
  assertReturns,
  CalculationError,
  ValidationError,
} from './validators.js';

/**
 * Calculates the sample standard deviation (periodic volatility) of returns.
 * Uses Bessel's correction (N - 1 denominator) for an unbiased estimator.
 *
 * Formula: sigma_sample = sqrt( (1 / (N - 1)) * sum((R_t - mean)^2) )
 *
 * @param {Array<number>} returns - Array of periodic returns (length >= 2).
 * @returns {number} Sample standard deviation.
 * @throws {ValidationError} If returns has fewer than 2 elements or contains invalid data.
 */
export function calculateSampleVolatility(returns) {
  assertReturns(returns, 'returns', 2);

  const n = returns.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += returns[i];
  }
  const mean = sum / n;
  if (!Number.isFinite(mean)) throw new CalculationError('Cannot calculate sample volatility: the mean return is not finite.');

  let sumSquaredDiff = 0;
  for (let i = 0; i < n; i++) {
    const diff = returns[i] - mean;
    sumSquaredDiff += diff * diff;
  }

  const sampleVariance = sumSquaredDiff / (n - 1);
  if (!Number.isFinite(sampleVariance)) throw new CalculationError('Cannot calculate sample volatility: variance is not finite.');
  return Math.sqrt(sampleVariance);
}

/**
 * Calculates annualized volatility from periodic returns.
 *
 * Formula: sigma_annual = sigma_sample * sqrt(k)
 * where k is the annualization factor (e.g. 252 for daily, 12 for monthly).
 *
 * @param {Array<number>} returns - Array of periodic returns (length >= 2).
 * @param {string|number} [frequencyOrFactor='DAILY'] - Sampling frequency name or custom positive factor.
 * @returns {number} Annualized volatility as a decimal.
 * @throws {ValidationError}
 */
export function calculateAnnualizedVolatility(
  returns,
  frequencyOrFactor = DEFAULT_ANNUALIZATION_FREQUENCY
) {
  const k = resolveAnnualizationFactor(frequencyOrFactor);
  const sampleVol = calculateSampleVolatility(returns);
  const annualizedVolatility = sampleVol * Math.sqrt(k);
  if (!Number.isFinite(annualizedVolatility)) throw new CalculationError('Cannot calculate annualized volatility: the result is not finite.');
  return annualizedVolatility;
}

/**
 * Calculates the annualized Sharpe Ratio using per-observation excess returns.
 *
 * Formula:
 * dailyRf = (1 + annualRf)^(1/k) - 1 (effective geometric conversion)
 * Sharpe = mean(R_t - dailyRf) / sampleStdDev(R_t) * sqrt(k)
 *
 * Where:
 * The annual risk-free rate is converted to the equivalent effective rate per
 * observation, then subtracted from each periodic return. Volatility uses the
 * sample standard deviation of the original periodic returns.
 *
 * @param {Array<number>} returns - Array of periodic returns (length >= 2).
 * @param {object} [options]
 * @param {number} [options.riskFreeRate=0.065] - Annual risk-free rate as decimal (e.g. 0.065 for 6.5%).
 * @param {string|number} [options.frequency='DAILY'] - Return frequency ('DAILY', 'WEEKLY', 'MONTHLY') or factor.
 * @returns {{
 *   sharpeRatio: number,
 *   annualizedReturn: number,
 *   annualizedVolatility: number,
 *   excessReturn: number,
 *   riskFreeRate: number,
 *   periodicRiskFreeRate: number,
 *   meanPeriodicExcessReturn: number,
 *   annualizationFactor: number
 * }}
 * @throws {ValidationError|CalculationError}
 */
export function calculateSharpeRatio(returns, {
  riskFreeRate = DEFAULT_RISK_FREE_RATE,
  frequency = DEFAULT_ANNUALIZATION_FREQUENCY,
} = {}) {
  assertReturns(returns, 'returns', 2);
  assertFiniteNumber(riskFreeRate, 'riskFreeRate');

  const k = resolveAnnualizationFactor(frequency);
  if (riskFreeRate <= -1) throw new ValidationError('riskFreeRate must be greater than -1 for effective-rate conversion.');

  const n = returns.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += returns[i];
  }
  const meanPeriodicReturn = sum / n;
  const annualizedReturn = meanPeriodicReturn * k;
  const periodicRiskFreeRate = (1 + riskFreeRate) ** (1 / k) - 1;
  const meanPeriodicExcessReturn = meanPeriodicReturn - periodicRiskFreeRate;

  const sampleVol = calculateSampleVolatility(returns);
  const annualizedVolatility = sampleVol * Math.sqrt(k);
  const excessReturn = meanPeriodicExcessReturn * k;
  if (![meanPeriodicReturn, annualizedReturn, periodicRiskFreeRate, meanPeriodicExcessReturn, annualizedVolatility, excessReturn].every(Number.isFinite)) {
    throw new CalculationError('Cannot calculate Sharpe ratio: a derived return or volatility is not finite.');
  }

  // Zero volatility edge case
  if (annualizedVolatility === 0) {
    if (Math.abs(excessReturn) < 1e-12) {
      return {
        sharpeRatio: 0.0,
        annualizedReturn,
        annualizedVolatility: 0.0,
        excessReturn: 0.0,
        riskFreeRate,
        periodicRiskFreeRate,
        meanPeriodicExcessReturn: 0,
        annualizationFactor: k,
      };
    }
    throw new CalculationError(
      'Cannot calculate Sharpe ratio: return volatility is zero and excess return is non-zero (division by zero).'
    );
  }

  const sharpeRatio = (meanPeriodicExcessReturn / sampleVol) * Math.sqrt(k);

  return {
    sharpeRatio,
    annualizedReturn,
    annualizedVolatility,
    excessReturn,
    riskFreeRate,
    periodicRiskFreeRate,
    meanPeriodicExcessReturn,
    annualizationFactor: k,
  };
}
