/**
 * Return calculation functions for Quantara.
 */

import {
  assertPositivePrices,
  assertReturns,
  ValidationError,
} from './validators.js';

/**
 * Calculates period-by-period simple returns from a series of prices.
 *
 * Formula: R_t = (P_t - P_{t-1}) / P_{t-1}
 *
 * @param {Array<number>} prices - Chronological array of strictly positive prices (length >= 2).
 * @returns {Array<number>} Array of simple periodic returns of length (prices.length - 1).
 * @throws {ValidationError} If inputs are invalid or length < 2.
 */
export function calculateSimpleReturns(prices) {
  assertPositivePrices(prices, 'prices');

  const returns = new Array(prices.length - 1);
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const current = prices[i];
    returns[i - 1] = (current - prev) / prev;
  }

  return returns;
}

/**
 * Calculates cumulative total return over a period.
 *
 * Can accept either an array of periodic returns or an array of price observations.
 *
 * Geometric compounding formula for returns:
 * R_cum = Product_{t=1}^T (1 + R_t) - 1
 *
 * Price formula:
 * R_cum = (P_T - P_0) / P_0
 *
 * @param {Array<number>} data - Array of periodic returns (>= -1.0) or prices (> 0).
 * @param {object} [options]
 * @param {'returns'|'prices'} [options.inputType='returns'] - Indicates whether data represents returns or prices.
 * @returns {number} Cumulative return as a decimal (e.g. 0.15 for 15% gain).
 * @throws {ValidationError} If input is invalid.
 */
export function calculateCumulativeReturn(data, { inputType = 'returns' } = {}) {
  if (inputType === 'prices') {
    assertPositivePrices(data, 'prices');
    const p0 = data[0];
    const pT = data[data.length - 1];
    return (pT - p0) / p0;
  }

  if (inputType === 'returns') {
    assertReturns(data, 'returns', 0);
    if (data.length === 0) {
      return 0.0;
    }

    let compoundGrowth = 1.0;
    for (let i = 0; i < data.length; i++) {
      compoundGrowth *= (1.0 + data[i]);
    }
    return compoundGrowth - 1.0;
  }

  throw new ValidationError(`Unknown inputType "${inputType}". Expected "returns" or "prices".`);
}

/**
 * Calculates the cumulative return time series (growth curve starting at base 0.0).
 *
 * When inputType is 'prices':
 * CR_0 = 0.0
 * CR_t = (P_t - P_0) / P_0
 *
 * When inputType is 'returns':
 * CR_0 = 0.0
 * CR_t = Product_{i=0}^{t-1} (1 + R_i) - 1
 *
 * @param {Array<number>} data - Array of periodic returns or prices.
 * @param {object} [options]
 * @param {'returns'|'prices'} [options.inputType='returns']
 * @returns {Array<number>} Series of cumulative returns starting at 0.0.
 */
export function calculateCumulativeReturnSeries(data, { inputType = 'returns' } = {}) {
  if (inputType === 'prices') {
    assertPositivePrices(data, 'prices');
    const p0 = data[0];
    return data.map((pt) => (pt - p0) / p0);
  }

  if (inputType === 'returns') {
    assertReturns(data, 'returns', 0);
    const series = new Array(data.length + 1);
    series[0] = 0.0;

    let compoundGrowth = 1.0;
    for (let i = 0; i < data.length; i++) {
      compoundGrowth *= (1.0 + data[i]);
      series[i + 1] = compoundGrowth - 1.0;
    }
    return series;
  }

  throw new ValidationError(`Unknown inputType "${inputType}". Expected "returns" or "prices".`);
}
