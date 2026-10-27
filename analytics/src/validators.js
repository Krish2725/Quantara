/**
 * Custom error types and input validation helpers for Quantara financial calculations.
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class CalculationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalculationError';
  }
}

/**
 * Asserts that the input is a non-empty array with at least minLength items.
 *
 * @param {unknown} val
 * @param {string} name
 * @param {number} minLength
 */
export function assertArray(val, name, minLength = 1) {
  if (!Array.isArray(val)) {
    throw new ValidationError(`${name} must be an array. Received: ${typeof val}`);
  }
  if (val.length < minLength) {
    throw new ValidationError(
      `${name} must contain at least ${minLength} element(s). Received length: ${val.length}`
    );
  }
}

/**
 * Asserts that an array of prices consists of strictly positive finite numbers.
 *
 * @param {Array<number>} prices
 * @param {string} [name='prices']
 */
export function assertPositivePrices(prices, name = 'prices') {
  assertArray(prices, name, 2);
  for (let i = 0; i < prices.length; i++) {
    const p = prices[i];
    if (typeof p !== 'number' || !Number.isFinite(p)) {
      throw new ValidationError(
        `${name}[${i}] must be a finite number. Received: ${p} (${typeof p})`
      );
    }
    if (p <= 0) {
      throw new ValidationError(
        `${name}[${i}] must be strictly positive (> 0). Received: ${p}`
      );
    }
  }
}

/**
 * Asserts that an array of returns consists of finite numbers >= -1.0.
 * A return of -1.0 represents a total 100% loss.
 *
 * @param {Array<number>} returns
 * @param {string} [name='returns']
 * @param {number} [minLength=1]
 */
export function assertReturns(returns, name = 'returns', minLength = 1) {
  assertArray(returns, name, minLength);
  for (let i = 0; i < returns.length; i++) {
    const r = returns[i];
    if (typeof r !== 'number' || !Number.isFinite(r)) {
      throw new ValidationError(
        `${name}[${i}] must be a finite number. Received: ${r} (${typeof r})`
      );
    }
    if (r < -1.0) {
      throw new ValidationError(
        `${name}[${i}] cannot be less than -1.0 (-100% total loss) in an unleveraged portfolio. Received: ${r}`
      );
    }
  }
}

/**
 * Asserts that an array of portfolio values consists of non-negative finite numbers with an initial peak > 0.
 *
 * @param {Array<number>} values
 * @param {string} [name='values']
 */
export function assertPortfolioValues(values, name = 'values') {
  assertArray(values, name, 1);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new ValidationError(
        `${name}[${i}] must be a finite number. Received: ${v} (${typeof v})`
      );
    }
    if (v < 0) {
      throw new ValidationError(
        `${name}[${i}] must be non-negative. Received: ${v}`
      );
    }
  }
  if (values[0] <= 0) {
    throw new ValidationError(
      `Initial ${name}[0] must be strictly positive (> 0) to evaluate performance and drawdowns. Received: ${values[0]}`
    );
  }
}

/**
 * Validates a finite number.
 *
 * @param {unknown} val
 * @param {string} name
 * @param {object} [options]
 * @param {number} [options.min]
 * @param {number} [options.max]
 */
export function assertFiniteNumber(val, name, { min, max } = {}) {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    throw new ValidationError(`${name} must be a finite number. Received: ${val} (${typeof val})`);
  }
  if (min !== undefined && val < min) {
    throw new ValidationError(`${name} must be >= ${min}. Received: ${val}`);
  }
  if (max !== undefined && val > max) {
    throw new ValidationError(`${name} must be <= ${max}. Received: ${val}`);
  }
}
