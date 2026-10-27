/**
 * Annualization factors and default constants for Quantara financial analytics.
 */

export const FREQUENCY_FACTORS = Object.freeze({
  DAILY: 252,          // Standard trading days per year
  WEEKLY: 52,         // Trading weeks per year
  MONTHLY: 12,        // Months per year
  QUARTERLY: 4,       // Quarters per year
  SEMI_ANNUALLY: 2,   // Half-years
  ANNUAL: 1,          // 1 year
});

export const DEFAULT_RISK_FREE_RATE = 0.065; // e.g. 6.5% benchmark (typical Indian 91D T-bill/10Y G-Sec)
export const DEFAULT_ANNUALIZATION_FREQUENCY = 'DAILY';

/**
 * Resolves an annualization factor from a string or numeric value.
 *
 * @param {string|number} frequencyOrFactor - Key from FREQUENCY_FACTORS (case-insensitive) or a positive number.
 * @returns {number} The resolved positive numeric annualization factor.
 * @throws {TypeError|RangeError} If the factor cannot be resolved or is invalid.
 */
export function resolveAnnualizationFactor(frequencyOrFactor = 'DAILY') {
  if (typeof frequencyOrFactor === 'number') {
    if (!Number.isFinite(frequencyOrFactor) || frequencyOrFactor <= 0) {
      throw new RangeError(
        `Annualization factor must be a strictly positive finite number. Received: ${frequencyOrFactor}`
      );
    }
    return frequencyOrFactor;
  }

  if (typeof frequencyOrFactor === 'string') {
    const key = frequencyOrFactor.trim().toUpperCase().replace(/[-\s]/g, '_');
    const factor = FREQUENCY_FACTORS[key];
    if (factor !== undefined) {
      return factor;
    }
    throw new TypeError(
      `Unknown return frequency "${frequencyOrFactor}". Valid frequencies are: ${Object.keys(
        FREQUENCY_FACTORS
      ).join(', ')} or provide a custom positive number.`
    );
  }

  throw new TypeError(
    `Frequency must be a valid frequency string or positive number. Received type "${typeof frequencyOrFactor}".`
  );
}
