import { calculateAnnualizedVolatility } from './risk.js';
import { calculateDrawdown } from './drawdown.js';
import { calculateSimpleReturns } from './returns.js';

export const PORTFOLIO_HEALTH_WEIGHTS = Object.freeze({
  unrealizedPerformance: 30,
  realizedPerformance: 10,
  diversification: 15,
  volatility: 15,
  drawdown: 15,
  dataCoverage: 15,
});

export const STOCK_RATING_WEIGHTS = Object.freeze({
  unrealizedPerformance: 35,
  oneYearPerformance: 25,
  volatility: 15,
  drawdown: 15,
  concentration: 10,
});

export const HEALTH_THRESHOLDS = Object.freeze({ excellent: 80, good: 65, neutral: 45, poor: 30 });
export const STOCK_RATING_THRESHOLDS = Object.freeze({ excellent: 80, good: 65, neutral: 50, poor: 35 });

function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function clamp(value, min = 0, max = 100) { return Math.max(min, Math.min(max, value)); }
// Smooth relative scale: +/-20% maps to 75/25, with no hard return cutoff.
function returnScore(percent) { return clamp(50 + 50 * percent / (Math.abs(percent) + 20)); }
function normalizedHistory(holding, asOfDate) {
  const values = holding.historyValues;
  if (!Array.isArray(values) || values.length < 3) return null;
  const valid = [...values].filter((point) => {
    if (!point || typeof point.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(point.date) || point.date > asOfDate || !finite(point.price) || point.price <= 0) return false;
    const date = new Date(`${point.date}T00:00:00Z`);
    return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === point.date;
  }).sort((a, b) => a.date.localeCompare(b.date));
  if (valid.length < 3 || valid.some((point, index) => index > 0 && valid[index - 1].date === point.date)) return null;
  try {
    const prices = valid.map((point) => point.price);
    return { values: valid, metrics: { annualizedVolatility: calculateAnnualizedVolatility(calculateSimpleReturns(prices), 'DAILY'), ...calculateDrawdown(prices) } };
  }
  catch { return null; }
}
function trailingOneYearReturn(history) {
  if (!history || history.values.length < 60) return null;
  const end = history.values.at(-1);
  const endTime = Date.parse(`${end.date}T00:00:00Z`);
  if (!Number.isFinite(endTime)) return null;
  const target = endTime - 365 * 24 * 60 * 60 * 1000;
  const start = history.values.find((point) => Date.parse(`${point.date}T00:00:00Z`) >= target);
  if (!start || endTime - Date.parse(`${start.date}T00:00:00Z`) < 300 * 24 * 60 * 60 * 1000) return null;
  return (end.price / start.price - 1) * 100;
}
function category(score, thresholds = STOCK_RATING_THRESHOLDS) {
  if (!finite(score)) return 'Insufficient Data';
  if (score >= thresholds.excellent) return 'Excellent';
  if (score >= thresholds.good) return 'Good';
  if (score >= thresholds.neutral) return 'Neutral';
  if (score >= thresholds.poor) return 'Poor';
  return 'Very Poor';
}
function weightedAvailable(components, weights) {
  const usable = Object.entries(components).filter(([key, value]) => finite(value) && weights[key] > 0);
  const totalWeight = usable.reduce((sum, [key]) => sum + weights[key], 0);
  return totalWeight ? usable.reduce((sum, [key, value]) => sum + value * weights[key], 0) / totalWeight : null;
}

/**
 * Explainable score from genuine open positions, provider quotes and provider histories.
 * Imported-only instruments must not be passed in this holdings array.
 */
export function calculatePortfolioHealth({ holdings = [], realizedPnl = null, totalBuyCost = null, asOfDate = new Date().toISOString().slice(0, 10), healthThresholds = HEALTH_THRESHOLDS, stockThresholds = STOCK_RATING_THRESHOLDS } = {}) {
  if (!Array.isArray(holdings)) throw new TypeError('holdings must be an array.');
  const asOfTime = typeof asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? new Date(`${asOfDate}T00:00:00Z`) : null;
  if (!asOfTime || !Number.isFinite(asOfTime.valueOf()) || asOfTime.toISOString().slice(0, 10) !== asOfDate) throw new TypeError('asOfDate must be an ISO calendar date.');
  for (const thresholds of [healthThresholds, stockThresholds]) if (!thresholds || !['excellent', 'good', 'neutral', 'poor'].every((key) => finite(thresholds[key]) && thresholds[key] >= 0 && thresholds[key] <= 100) || !(thresholds.excellent > thresholds.good && thresholds.good > thresholds.neutral && thresholds.neutral > thresholds.poor)) throw new TypeError('Health category thresholds must descend from excellent to poor within 0–100.');
  const active = holdings.filter((holding) => holding && finite(holding.quantity) && holding.quantity > 0);
  if (!active.length) return { available: false, score: null, category: 'Insufficient Data', provisional: true, components: {}, holdings: [], coverage: { openHoldings: 0, quoteCoveragePercent: 0, historyCoveragePercent: 0 } };

  const quoteCount = active.filter((item) => finite(item.marketValue) && item.marketValue >= 0 && finite(item.unrealizedPnl)).length;
  const historyBySymbol = active.map((item) => normalizedHistory(item, asOfDate));
  const historyCount = historyBySymbol.filter(Boolean).length;
  const allQuotes = quoteCount === active.length;
  const totalMarketValue = allQuotes ? active.reduce((sum, item) => sum + item.marketValue, 0) : null;
  const weights = allQuotes && totalMarketValue > 0 ? active.map((item) => item.marketValue / totalMarketValue) : null;
  const concentration = weights ? weights.reduce((sum, weight) => sum + weight ** 2, 0) : null;
  const unrealizedPercent = allQuotes && active.every((item) => finite(item.costBasis) && item.costBasis > 0)
    ? active.reduce((sum, item) => sum + item.unrealizedPnl, 0) / active.reduce((sum, item) => sum + item.costBasis, 0) * 100 : null;
  const realizedPercent = finite(realizedPnl) && finite(totalBuyCost) && totalBuyCost > 0 ? realizedPnl / totalBuyCost * 100 : null;
  const historyWeights = active.map((item) => finite(item.costBasis) && item.costBasis > 0 ? item.costBasis : 0);
  const riskWeightTotal = historyWeights.reduce((sum, value, index) => sum + (historyBySymbol[index] ? value : 0), 0);
  const volatility = riskWeightTotal > 0 ? historyBySymbol.reduce((sum, history, index) => sum + (history ? history.metrics.annualizedVolatility * historyWeights[index] : 0), 0) / riskWeightTotal : null;
  const drawdown = riskWeightTotal > 0 ? historyBySymbol.reduce((sum, history, index) => sum + (history ? history.metrics.maxDrawdown * historyWeights[index] : 0), 0) / riskWeightTotal : null;
  const quoteCoveragePercent = quoteCount / active.length * 100;
  const historyCoveragePercent = historyCount / active.length * 100;
  const coverageScore = (quoteCoveragePercent + historyCoveragePercent) / 2;
  const componentScores = {
    unrealizedPerformance: finite(unrealizedPercent) ? returnScore(unrealizedPercent) : null,
    realizedPerformance: finite(realizedPercent) ? returnScore(realizedPercent) : null,
    diversification: finite(concentration) ? clamp((1 - concentration) * 100) : null,
    volatility: finite(volatility) ? clamp((1 - Math.min(volatility / 0.8, 1)) * 100) : null,
    drawdown: finite(drawdown) ? clamp((1 - Math.min(Math.abs(drawdown) / 0.8, 1)) * 100) : null,
    dataCoverage: coverageScore,
  };
  const nonCoverageWeights = { ...PORTFOLIO_HEALTH_WEIGHTS, dataCoverage: 0 };
  const availableScore = weightedAvailable(componentScores, nonCoverageWeights);
  const score = availableScore == null
    ? coverageScore
    : (availableScore * (100 - PORTFOLIO_HEALTH_WEIGHTS.dataCoverage) + coverageScore * PORTFOLIO_HEALTH_WEIGHTS.dataCoverage) / 100;
  const stockRatings = active.map((holding, index) => {
    const history = historyBySymbol[index];
    const oneYearPercent = trailingOneYearReturn(history);
    const stockWeight = weights?.[index] ?? null;
    const pnlPercent = finite(holding.unrealizedPnlPercent) ? holding.unrealizedPnlPercent * 100
      : finite(holding.costBasis) && holding.costBasis > 0 && finite(holding.unrealizedPnl) ? holding.unrealizedPnl / holding.costBasis * 100 : null;
    const components = {
      unrealizedPerformance: finite(pnlPercent) ? returnScore(pnlPercent) : null,
      oneYearPerformance: finite(oneYearPercent) ? returnScore(oneYearPercent) : null,
      volatility: history ? clamp((1 - Math.min(history.metrics.annualizedVolatility / 0.8, 1)) * 100) : null,
      drawdown: history ? clamp((1 - Math.min(Math.abs(history.metrics.maxDrawdown) / 0.8, 1)) * 100) : null,
      concentration: finite(stockWeight) ? clamp((1 - stockWeight) * 100) : null,
    };
    const stockScore = weightedAvailable(components, STOCK_RATING_WEIGHTS);
    const reasons = [];
    if (history && history.metrics.annualizedVolatility >= 0.5) reasons.push(`High historical volatility (${(history.metrics.annualizedVolatility * 100).toFixed(1)}%).`);
    if (history && history.metrics.maxDrawdown <= -0.4) reasons.push(`Deep historical drawdown (${(history.metrics.maxDrawdown * 100).toFixed(1)}%).`);
    if (finite(pnlPercent)) reasons.push(`Unrealized return ${pnlPercent.toFixed(1)}% of cost basis since acquisition (not annualized).`);
    if (finite(oneYearPercent)) reasons.push(`Trailing one-year price return ${oneYearPercent.toFixed(1)}%.`);
    if (!history) reasons.push('No usable provider history; historical risk and one-year return are unavailable.');
    if (!finite(holding.currentPrice)) reasons.push('Provider quote unavailable; current valuation is unavailable.');
    if (finite(stockWeight) && stockWeight >= 0.4) reasons.push(`Concentrated position (${(stockWeight * 100).toFixed(1)}% of current value).`);
    if (!reasons.length) reasons.push('Insufficient quote, cost-basis, or provider-history data for a reliable rating.');
    return {
      symbol: holding.symbol || holding.instrument?.symbol || '', name: holding.name || holding.instrument?.name || '',
      currency: holding.currency || holding.instrument?.currency || '',
      quantity: holding.quantity, costBasis: holding.costBasis, averageCost: finite(holding.averageCost) ? holding.averageCost : holding.costBasis / holding.quantity,
      currentPrice: finite(holding.currentPrice) ? holding.currentPrice : null, quoteTimestamp: holding.quoteTimestamp || null,
      marketValue: finite(holding.marketValue) ? holding.marketValue : null, unrealizedPnl: finite(holding.unrealizedPnl) ? holding.unrealizedPnl : null,
      unrealizedPnlPercent: finite(pnlPercent) ? pnlPercent : null, weight: stockWeight, historicalVolatility: history?.metrics.annualizedVolatility ?? null,
      maximumDrawdown: history?.metrics.maxDrawdown ?? null, oneYearReturnPercent: oneYearPercent, score: stockScore,
      category: category(stockScore, stockThresholds), reasons: reasons.slice(0, 4), dataQuality: { quote: finite(holding.currentPrice), providerHistory: Boolean(history), oneYearHistory: finite(oneYearPercent) },
    };
  });
  return {
    available: true, score: Number(score.toFixed(2)), category: category(score, healthThresholds),
    provisional: quoteCoveragePercent < 100 || historyCoveragePercent < 100 || availableScore == null,
    components: {
      unrealizedPerformance: { score: componentScores.unrealizedPerformance, returnPercent: unrealizedPercent, weightPercent: 30, available: finite(unrealizedPercent) },
      realizedPerformance: { score: componentScores.realizedPerformance, returnPercent: realizedPercent, weightPercent: 10, amount: realizedPnl, available: finite(realizedPercent) },
      diversification: { score: componentScores.diversification, concentrationIndex: concentration, weightPercent: 15, available: finite(concentration) },
      volatility: { score: componentScores.volatility, annualizedVolatility: volatility, weightPercent: 15, available: finite(volatility) },
      drawdown: { score: componentScores.drawdown, maximumDrawdown: drawdown, weightPercent: 15, available: finite(drawdown) },
      dataCoverage: { score: coverageScore, quoteCoveragePercent, historyCoveragePercent, weightPercent: 15, available: true },
    },
    coverage: { openHoldings: active.length, quoteCount, historyCount, quoteCoveragePercent, historyCoveragePercent },
    holdings: stockRatings,
  };
}
