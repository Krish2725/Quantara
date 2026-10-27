/**
 * Portfolio valuation and asset allocation weight calculations for Quantara.
 */

import {
  assertArray,
  assertFiniteNumber,
  CalculationError,
  ValidationError,
} from './validators.js';

/**
 * Calculates portfolio total value, position values, and allocation weights.
 *
 * Explicit Assumptions:
 * 1. Long-only cash positions: quantities and cash balance must be non-negative (>= 0).
 * 2. Every holding with quantity > 0 MUST have an associated positive price (> 0).
 *    Missing prices will throw an explicit error rather than silently defaulting to 0.
 * 3. Total portfolio value must be strictly positive (> 0) to compute allocation weights.
 * 4. Weights sum strictly to 1.0 (holdings weights + cash weight).
 *
 * @param {Array<{assetId: string, quantity: number}>} holdings - Constituent holdings.
 * @param {Record<string, number>} prices - Map of assetId to current unit price.
 * @param {object} [options]
 * @param {number} [options.cash=0] - Available uninvested cash balance (default: 0).
 * @returns {{
 *   totalValue: number,
 *   cash: number,
 *   cashWeight: number,
 *   holdings: Array<{
 *     assetId: string,
 *     quantity: number,
 *     price: number,
 *     value: number,
 *     weight: number
 *   }>
 * }}
 * @throws {ValidationError|CalculationError}
 */
export function calculatePortfolioAllocation(holdings, prices, { cash = 0 } = {}) {
  assertArray(holdings, 'holdings', 0);

  if (typeof prices !== 'object' || prices === null) {
    throw new ValidationError('prices must be an object map of assetId to numeric price.');
  }

  assertFiniteNumber(cash, 'cash', { min: 0 });

  let investedValue = 0;
  const evaluatedHoldings = [];

  for (let i = 0; i < holdings.length; i++) {
    const item = holdings[i];
    if (!item || typeof item !== 'object') {
      throw new ValidationError(`holdings[${i}] must be an object with assetId and quantity.`);
    }

    const { assetId, quantity } = item;
    if (typeof assetId !== 'string' || assetId.trim().length === 0) {
      throw new ValidationError(`holdings[${i}].assetId must be a non-empty string.`);
    }

    assertFiniteNumber(quantity, `holdings[${i}] (${assetId}).quantity`, { min: 0 });

    if (quantity === 0) {
      // 0-quantity holding has 0 value and 0 weight
      evaluatedHoldings.push({
        assetId,
        quantity: 0,
        price: prices[assetId] !== undefined ? prices[assetId] : 0,
        value: 0,
        weight: 0,
      });
      continue;
    }

    const price = prices[assetId];
    if (price === undefined) {
      throw new ValidationError(
        `Missing price for held asset "${assetId}". Price must be provided for every active holding.`
      );
    }

    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
      throw new ValidationError(
        `Price for holding "${assetId}" must be a strictly positive finite number. Received: ${price}`
      );
    }

    const positionValue = quantity * price;
    if (!Number.isFinite(positionValue)) {
      throw new CalculationError(`Position value for holding "${assetId}" is not finite.`);
    }
    investedValue += positionValue;
    if (!Number.isFinite(investedValue)) {
      throw new CalculationError('Invested portfolio value is not finite.');
    }

    evaluatedHoldings.push({
      assetId,
      quantity,
      price,
      value: positionValue,
      weight: 0, // Will be computed once totalValue is known
    });
  }

  const totalValue = investedValue + cash;

  if (!Number.isFinite(totalValue)) {
    throw new CalculationError('Total portfolio value is not finite.');
  }

  if (totalValue <= 0) {
    throw new CalculationError(
      'Total portfolio value is zero. Cannot compute allocation weights for an empty portfolio.'
    );
  }

  // Calculate weights
  const cashWeight = cash / totalValue;
  for (let i = 0; i < evaluatedHoldings.length; i++) {
    evaluatedHoldings[i].weight = evaluatedHoldings[i].value / totalValue;
  }

  return {
    totalValue,
    cash,
    cashWeight,
    holdings: evaluatedHoldings,
  };
}

/**
 * Calculates portfolio value time series given static quantities and historical prices per asset.
 *
 * Explicit Assumptions:
 * - Constant quantities over the evaluation window (buy-and-hold assumption).
 * - Fixed cash balance unless provided as a matching series.
 *
 * @param {Array<{assetId: string, quantity: number}>} holdings
 * @param {Record<string, Array<number>>} historicalPrices - Map of assetId to price array (all same length).
 * @param {object} [options]
 * @param {number|Array<number>} [options.cash=0] - Static cash amount or time series of cash.
 * @returns {Array<number>} Series of total portfolio values over time.
 */
export function calculatePortfolioValueSeries(holdings, historicalPrices, { cash = 0 } = {}) {
  assertArray(holdings, 'holdings', 1);

  if (typeof historicalPrices !== 'object' || historicalPrices === null) {
    throw new ValidationError('historicalPrices must be an object map.');
  }

  const activeHoldings = [];
  for (let i = 0; i < holdings.length; i++) {
    const holding = holdings[i];
    if (!holding || typeof holding !== 'object' || Array.isArray(holding)) {
      throw new ValidationError(`holdings[${i}] must be an object with assetId and quantity.`);
    }
    if (typeof holding.assetId !== 'string' || holding.assetId.trim() === '') {
      throw new ValidationError(`holdings[${i}].assetId must be a non-empty string.`);
    }
    assertFiniteNumber(holding.quantity, `holdings[${i}] (${holding.assetId}).quantity`, { min: 0 });
    if (holding.quantity > 0) activeHoldings.push(holding);
  }

  if (!Array.isArray(cash)) assertFiniteNumber(cash, 'cash', { min: 0 });

  // Determine series length from active holdings.
  let seriesLength = -1;
  for (const h of activeHoldings) {
    const pSeries = historicalPrices[h.assetId];
    if (!Array.isArray(pSeries) || pSeries.length === 0) {
      throw new ValidationError(`historicalPrices["${h.assetId}"] must be a non-empty array of prices.`);
    }
    if (seriesLength === -1) seriesLength = pSeries.length;
    else if (pSeries.length !== seriesLength) {
      throw new ValidationError(
        `Price history length mismatch for "${h.assetId}". Expected ${seriesLength}, received ${pSeries.length}.`
      );
    }
  }

  if (seriesLength <= 0) {
    throw new ValidationError('At least one holding must have positive quantity and price history.');
  }

  if (Array.isArray(cash) && cash.length !== seriesLength) {
    throw new ValidationError(`cash must contain exactly ${seriesLength} value(s). Received ${cash.length}.`);
  }

  const values = new Array(seriesLength);

  for (let t = 0; t < seriesLength; t++) {
    let periodInvested = 0;
    for (const h of activeHoldings) {
      const pt = historicalPrices[h.assetId][t];
      if (typeof pt !== 'number' || !Number.isFinite(pt) || pt <= 0) {
        throw new ValidationError(
          `Invalid price for "${h.assetId}" at step ${t}. Received: ${pt}`
        );
      }
      const positionValue = h.quantity * pt;
      if (!Number.isFinite(positionValue)) {
        throw new CalculationError(`Position value for holding "${h.assetId}" at step ${t} is not finite.`);
      }
      periodInvested += positionValue;
      if (!Number.isFinite(periodInvested)) {
        throw new CalculationError(`Invested portfolio value at step ${t} is not finite.`);
      }
    }

    const currentCash = Array.isArray(cash) ? cash[t] : cash;
    assertFiniteNumber(currentCash, `cash[${t}]`, { min: 0 });

    values[t] = periodInvested + currentCash;
    if (!Number.isFinite(values[t])) {
      throw new CalculationError(`Portfolio value at step ${t} is not finite.`);
    }
  }

  return values;
}
