/** Historical buy-and-hold portfolio construction and date-aligned comparison. */

import { calculatePortfolioAllocation } from './portfolio.js';
import { calculatePerformanceSummary } from './performance.js';
import { resolveAnnualizationFactor } from './constants.js';
import { ValidationError } from './validators.js';

function assertExactKeys(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${name} must be an object.`);
  }
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new ValidationError(`${name} has unknown field "${unknown}".`);
}

function validateDate(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`${name} must be a date in YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`${name} is not a valid calendar date.`);
  }
}

function validateSeries(series, { name, dateField, valueField, minLength = 1 }) {
  if (!Array.isArray(series) || series.length < minLength) {
    throw new ValidationError(`${name} must contain at least ${minLength} observation(s).`);
  }
  let previousDate;
  for (let i = 0; i < series.length; i++) {
    const row = series[i];
    assertExactKeys(row, [dateField, valueField], `${name}[${i}]`);
    validateDate(row[dateField], `${name}[${i}].${dateField}`);
    if (previousDate !== undefined && row[dateField] <= previousDate) {
      throw new ValidationError(`${name} dates must be unique and in strictly ascending order.`);
    }
    if (typeof row[valueField] !== 'number' || !Number.isFinite(row[valueField]) || row[valueField] <= 0) {
      throw new ValidationError(`${name}[${i}].${valueField} must be a positive finite number.`);
    }
    previousDate = row[dateField];
  }
}

/**
 * Constructs a constant-quantity, long-only portfolio from dated price series.
 * Benchmark observations are compared only on exact dates also present in the portfolio.
 */
export function calculateHistoricalPortfolioAnalysis(input = {}) {
  assertExactKeys(input, ['holdings', 'benchmark', 'riskFreeRate', 'frequency'], 'request');
  const { holdings, benchmark, riskFreeRate, frequency } = input;
  if (riskFreeRate !== undefined && (typeof riskFreeRate !== 'number' || !Number.isFinite(riskFreeRate))) {
    throw new ValidationError('riskFreeRate must be a finite number.');
  }
  if (frequency !== undefined) {
    try {
      resolveAnnualizationFactor(frequency);
    } catch (error) {
      throw new ValidationError(error.message);
    }
  }
  if (!Array.isArray(holdings) || holdings.length === 0) {
    throw new ValidationError('holdings must be a non-empty array.');
  }

  const assetIds = new Set();
  let dates;
  for (let i = 0; i < holdings.length; i++) {
    const holding = holdings[i];
    assertExactKeys(holding, ['assetId', 'quantity', 'prices'], `holdings[${i}]`);
    if (typeof holding.assetId !== 'string' || holding.assetId.trim() === '') {
      throw new ValidationError(`holdings[${i}].assetId must be a non-empty string.`);
    }
    if (assetIds.has(holding.assetId)) {
      throw new ValidationError(`Duplicate assetId "${holding.assetId}" is not allowed.`);
    }
    assetIds.add(holding.assetId);
    if (typeof holding.quantity !== 'number' || !Number.isFinite(holding.quantity) || holding.quantity <= 0) {
      throw new ValidationError(`holdings[${i}].quantity must be a positive finite number.`);
    }
    validateSeries(holding.prices, {
      name: `holdings[${i}].prices`, dateField: 'date', valueField: 'price', minLength: 3,
    });
    const holdingDates = holding.prices.map(({ date }) => date);
    if (!dates) dates = holdingDates;
    else if (holdingDates.length !== dates.length || holdingDates.some((date, index) => date !== dates[index])) {
      throw new ValidationError(`holdings[${i}].prices dates must exactly match the other holdings.`);
    }
  }

  const values = dates.map((date, index) => holdings.reduce(
    (total, holding) => total + holding.quantity * holding.prices[index].price,
    0,
  ));
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new ValidationError('Calculated portfolio values must be positive finite numbers.');
  }

  const allocations = dates.map((date, index) => {
    const prices = Object.fromEntries(holdings.map((holding) => [holding.assetId, holding.prices[index].price]));
    const allocation = calculatePortfolioAllocation(
      holdings.map(({ assetId, quantity }) => ({ assetId, quantity })), prices,
    );
    return { date, ...allocation };
  });

  // This attribution is in units of portfolio return: each holding's change in
  // market value divided by initial portfolio value. It sums exactly to total return.
  const holdingContributions = holdings.map((holding, index) => {
    const initialValue = holding.quantity * holding.prices[0].price;
    const finalValue = holding.quantity * holding.prices.at(-1).price;
    return {
      assetId: holding.assetId,
      initialValue,
      finalValue,
      cumulativeContribution: (finalValue - initialValue) / values[0],
    };
  });

  const portfolioPerformance = calculatePerformanceSummary(values, { riskFreeRate, frequency });
  let benchmarkResult = null;
  let comparison = null;

  if (benchmark !== undefined) {
    assertExactKeys(benchmark, ['name', 'values'], 'benchmark');
    if (benchmark.name !== undefined && (typeof benchmark.name !== 'string' || benchmark.name.trim() === '')) {
      throw new ValidationError('benchmark.name must be a non-empty string when provided.');
    }
    validateSeries(benchmark.values, {
      name: 'benchmark.values', dateField: 'date', valueField: 'value', minLength: 1,
    });

    const portfolioByDate = new Map(dates.map((date, index) => [date, values[index]]));
    const benchmarkByDate = new Map(benchmark.values.map(({ date, value }) => [date, value]));
    const alignedDates = dates.filter((date) => benchmarkByDate.has(date));
    if (alignedDates.length < 3) {
      throw new ValidationError('Benchmark must share at least 3 dates with the portfolio.');
    }
    const alignedPortfolioValues = alignedDates.map((date) => portfolioByDate.get(date));
    const alignedBenchmarkValues = alignedDates.map((date) => benchmarkByDate.get(date));
    const alignedPortfolioPerformance = calculatePerformanceSummary(alignedPortfolioValues, { riskFreeRate, frequency });
    const benchmarkPerformance = calculatePerformanceSummary(alignedBenchmarkValues, { riskFreeRate, frequency });
    const portfolioCumulativeReturn = alignedPortfolioPerformance.cumulativeReturn;
    const benchmarkCumulativeReturn = benchmarkPerformance.cumulativeReturn;

    benchmarkResult = {
      ...(benchmark.name === undefined ? {} : { name: benchmark.name }),
      alignedDates,
      alignedValues: alignedBenchmarkValues,
      performance: benchmarkPerformance,
    };
    comparison = {
      alignedDates,
      portfolioCumulativeReturn,
      benchmarkCumulativeReturn,
      cumulativeReturnDifference: portfolioCumulativeReturn - benchmarkCumulativeReturn,
      relativeCumulativeReturn: (1 + portfolioCumulativeReturn) / (1 + benchmarkCumulativeReturn) - 1,
    };
  }

  return {
    portfolio: {
      dates,
      values,
      performance: portfolioPerformance,
      allocations,
      holdingContributions,
    },
    benchmark: benchmarkResult,
    comparison,
  };
}
