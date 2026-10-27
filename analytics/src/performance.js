/** Consolidated performance and risk summary calculations. */

import { calculateSimpleReturns, calculateCumulativeReturn } from './returns.js';
import { calculateAnnualizedVolatility, calculateSharpeRatio } from './risk.js';
import { calculateDrawdown } from './drawdown.js';
import { DEFAULT_ANNUALIZATION_FREQUENCY, DEFAULT_RISK_FREE_RATE } from './constants.js';
import { assertArray, CalculationError } from './validators.js';

function assertFiniteResult(value, path = 'summary') {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new CalculationError(`Cannot calculate ${path}: the result is not finite for the supplied inputs.`);
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) assertFiniteResult(nested, `${path}.${key}`);
  }
}

/**
 * Calculates a consolidated performance and risk report from a price or portfolio value series.
 * @param {Array<number>} values Time series of portfolio valuations or prices.
 * @param {object} [options]
 * @param {number} [options.riskFreeRate=0.065] Annualized risk-free rate.
 * @param {string|number} [options.frequency='DAILY'] Sampling frequency.
 */
export function calculatePerformanceSummary(values, {
  riskFreeRate = DEFAULT_RISK_FREE_RATE,
  frequency = DEFAULT_ANNUALIZATION_FREQUENCY,
} = {}) {
  assertArray(values, 'values', 2);

  const returns = calculateSimpleReturns(values);
  const cumulativeReturn = calculateCumulativeReturn(values, { inputType: 'prices' });
  const sharpeDetails = calculateSharpeRatio(returns, { riskFreeRate, frequency });
  const drawdownDetails = calculateDrawdown(values);
  const annualizedVolatility = calculateAnnualizedVolatility(returns, frequency);

  const summary = {
    observations: values.length,
    cumulativeReturn,
    annualizedReturn: sharpeDetails.annualizedReturn,
    annualizedVolatility,
    maxDrawdown: drawdownDetails.maxDrawdown,
    sharpeRatio: sharpeDetails.sharpeRatio,
    drawdownDetails,
    sharpeDetails,
  };
  assertFiniteResult(summary);
  return summary;
}
