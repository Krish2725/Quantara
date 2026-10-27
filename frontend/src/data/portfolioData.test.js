import { describe, expect, it } from 'vitest';
import { buildAnalysisRequest, createExamplePortfolio, parseBenchmarkCsv, readPortfolios, validatePortfolio, writePortfolios } from './portfolioData.js';
import { samplePortfolioRequest } from './samplePortfolio.js';

describe('portfolio data workflow', () => {
  it('parses benchmark CSV and rejects duplicate dates and invalid values', () => {
    expect(parseBenchmarkCsv('date,value\n2025-01-02,101\n2025-01-01,100', 'Index')).toEqual({ name: 'Index', values: [{ date: '2025-01-01', value: 100 }, { date: '2025-01-02', value: 101 }] });
    expect(() => parseBenchmarkCsv('date,value\n2025-01-01,100\n2025-01-01,101')).toThrow(/Duplicate/);
    expect(() => parseBenchmarkCsv('date,value\n2025-01-01,-1')).toThrow(/positive and finite/);
  });

  it('validates analysis holdings and exact aligned dates without filling missing rows', () => {
    const portfolio = createExamplePortfolio(samplePortfolioRequest, { id: 'sample' });
    expect(validatePortfolio(portfolio)).toBe(true);
    expect(() => validatePortfolio({ ...portfolio, holdings: [] })).toThrow(/at least one holding/);
    expect(() => validatePortfolio({ ...portfolio, holdings: [portfolio.holdings[0], { ...portfolio.holdings[1], quantity: -2 }] })).toThrow(/positive finite/);
    expect(() => validatePortfolio({ ...portfolio, prices: { ...portfolio.prices, NOVA: portfolio.prices.NOVA.slice(1) } })).toThrow(/do not match/);
    expect(() => validatePortfolio({ ...portfolio, prices: { ...portfolio.prices, ORBT: portfolio.prices.ORBT.slice(0, 2) } })).toThrow(/at least 3/);
  });

  it('builds the existing analysis API contract and persists analysis portfolios locally', () => {
    const portfolio = createExamplePortfolio(samplePortfolioRequest, { id: 'sample' });
    portfolio.riskFreeRate = 0.03; portfolio.frequency = 'WEEKLY';
    const request = buildAnalysisRequest(portfolio);
    expect(request).toEqual({ holdings: samplePortfolioRequest.holdings, benchmark: { name: 'Illustrative sample benchmark', values: samplePortfolioRequest.benchmark.values }, riskFreeRate: 0.03, frequency: 'WEEKLY' });
    expect(buildAnalysisRequest({ ...portfolio, benchmark: null }).benchmark).toBeUndefined();
    const data = new Map();
    const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    const saved = [createExamplePortfolio(samplePortfolioRequest, { id: 'saved' })];
    expect(writePortfolios(saved, storage)).toBe(true);
    expect(readPortfolios(storage)).toEqual(saved);
  });
});
