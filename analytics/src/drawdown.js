/**
 * Drawdown and peak-to-trough risk metrics for Quantara.
 */

import {
  assertPortfolioValues,
  ValidationError,
} from './validators.js';

/**
 * Calculates the maximum drawdown and complete drawdown profile from a portfolio value series.
 *
 * Mathematical Definitions:
 * - Running Peak: M_t = max_{0 <= s <= t} (V_s)
 * - Drawdown Series: DD_t = (V_t - M_t) / M_t
 * - Maximum Drawdown (MDD): min_{0 <= t <= T} (DD_t)
 *
 * @param {Array<number>} values - Chronological array of portfolio values (V_0 > 0, V_t >= 0).
 * @returns {{
 *   maxDrawdown: number,            // Negative decimal (e.g. -0.245 for -24.5%)
 *   maxDrawdownPercent: number,     // e.g. -24.5
 *   peakValue: number,              // Peak valuation preceding the maximum drawdown
 *   peakIndex: number,              // Index of the peak
 *   troughValue: number,            // Lowest valuation at the bottom of the drawdown
 *   troughIndex: number,            // Index of the trough
 *   recoveryIndex: number|null,     // Index when value recovered to peakValue (null if not recovered)
 *   drawdownDuration: number,       // Number of periods from peak to trough
 *   recoveryDuration: number|null,  // Number of periods from trough to recovery (null if not recovered)
 *   drawdownSeries: Array<number>,  // Underwater series DD_t for each observation t
 *   peakSeries: Array<number>       // High-water mark series M_t for each observation t
 * }}
 * @throws {ValidationError}
 */
export function calculateDrawdown(values) {
  assertPortfolioValues(values, 'values');

  const n = values.length;
  const drawdownSeries = new Array(n);
  const peakSeries = new Array(n);

  let currentPeak = values[0];
  let currentPeakIndex = 0;

  // Running tracking of the overall maximum drawdown
  let maxDD = 0.0;
  let bestPeakVal = values[0];
  let bestPeakIdx = 0;
  let worstTroughVal = values[0];
  let worstTroughIdx = 0;

  for (let t = 0; t < n; t++) {
    const val = values[t];

    if (val > currentPeak) {
      currentPeak = val;
      currentPeakIndex = t;
    }

    peakSeries[t] = currentPeak;
    const dd = (val - currentPeak) / currentPeak;
    drawdownSeries[t] = dd;

    if (dd < maxDD) {
      maxDD = dd;
      bestPeakVal = currentPeak;
      bestPeakIdx = currentPeakIndex;
      worstTroughVal = val;
      worstTroughIdx = t;
    }
  }

  // Find recovery index (first index after worstTroughIdx where val >= bestPeakVal)
  let recoveryIndex = null;
  let recoveryDuration = null;

  if (maxDD < 0) {
    for (let t = worstTroughIdx + 1; t < n; t++) {
      if (values[t] >= bestPeakVal) {
        recoveryIndex = t;
        recoveryDuration = t - worstTroughIdx;
        break;
      }
    }
  }

  const drawdownDuration = worstTroughIdx - bestPeakIdx;

  return {
    maxDrawdown: maxDD,
    maxDrawdownPercent: maxDD * 100,
    peakValue: bestPeakVal,
    peakIndex: bestPeakIdx,
    troughValue: worstTroughVal,
    troughIndex: worstTroughIdx,
    recoveryIndex,
    drawdownDuration,
    recoveryDuration,
    drawdownSeries,
    peakSeries,
  };
}

/**
 * Convenience helper to return just the scalar maximum drawdown.
 *
 * @param {Array<number>} values
 * @returns {number} Negative decimal maximum drawdown.
 */
export function calculateMaxDrawdown(values) {
  return calculateDrawdown(values).maxDrawdown;
}
