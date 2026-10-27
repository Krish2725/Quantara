import { describe, it, expect } from 'vitest';
import {
  calculatePortfolioAllocation,
  calculatePortfolioValueSeries,
} from '../src/portfolio.js';
import { CalculationError, ValidationError } from '../src/validators.js';
import { fixtureB } from './fixtures/hand-calculated.js';

describe('portfolio module', () => {
  describe('calculatePortfolioAllocation', () => {
    it('matches fixtureB total value, cash weight, and individual holding weights', () => {
      const result = calculatePortfolioAllocation(fixtureB.holdings, fixtureB.prices, {
        cash: fixtureB.cash,
      });

      expect(result.totalValue).toBe(fixtureB.expected.totalValue);
      expect(result.cash).toBe(fixtureB.cash);
      expect(result.cashWeight).toBeCloseTo(fixtureB.expected.cashWeight, 6);

      let sumWeights = result.cashWeight;
      for (let i = 0; i < result.holdings.length; i++) {
        const item = result.holdings[i];
        const expectedItem = fixtureB.expected.holdings[i];
        expect(item.assetId).toBe(expectedItem.assetId);
        expect(item.quantity).toBe(expectedItem.quantity);
        expect(item.price).toBe(expectedItem.price);
        expect(item.value).toBe(expectedItem.value);
        expect(item.weight).toBeCloseTo(expectedItem.weight, 6);
        sumWeights += item.weight;
      }

      // Weights must sum to 1.0
      expect(sumWeights).toBeCloseTo(1.0, 8);
    });

    it('handles zero quantity holdings with 0 value and 0 weight', () => {
      const holdings = [
        { assetId: 'INFY', quantity: 10 },
        { assetId: 'WIPRO', quantity: 0 },
      ];
      const prices = { INFY: 1500, WIPRO: 500 };
      const result = calculatePortfolioAllocation(holdings, prices, { cash: 5000 });

      expect(result.totalValue).toBe(20000);
      const wipro = result.holdings.find((h) => h.assetId === 'WIPRO');
      expect(wipro.value).toBe(0);
      expect(wipro.weight).toBe(0);
    });

    it('handles 100% cash portfolio', () => {
      const result = calculatePortfolioAllocation([], {}, { cash: 50000 });
      expect(result.totalValue).toBe(50000);
      expect(result.cashWeight).toBe(1.0);
      expect(result.holdings).toHaveLength(0);
    });

    it('throws ValidationError when price is missing for an active holding', () => {
      const holdings = [{ assetId: 'TCS', quantity: 10 }];
      const prices = {}; // Missing TCS
      expect(() => calculatePortfolioAllocation(holdings, prices)).toThrow(
        /Missing price for held asset "TCS"/
      );
    });

    it('throws CalculationError when total portfolio value is zero', () => {
      const holdings = [{ assetId: 'TCS', quantity: 0 }];
      const prices = { TCS: 3000 };
      expect(() => calculatePortfolioAllocation(holdings, prices, { cash: 0 })).toThrow(
        CalculationError
      );
    });

    it('throws ValidationError for negative quantities', () => {
      const holdings = [{ assetId: 'TCS', quantity: -5 }];
      const prices = { TCS: 3000 };
      expect(() => calculatePortfolioAllocation(holdings, prices)).toThrow(ValidationError);
    });

    it('throws ValidationError for negative or non-finite cash', () => {
      expect(() =>
        calculatePortfolioAllocation([], {}, { cash: -100 })
      ).toThrow(ValidationError);
      expect(() =>
        calculatePortfolioAllocation([], {}, { cash: NaN })
      ).toThrow(ValidationError);
    });

    it('rejects arithmetic overflow in positions, invested totals, and portfolio totals', () => {
      expect(() => calculatePortfolioAllocation([{ assetId: 'A', quantity: Number.MAX_VALUE }], { A: 2 }))
        .toThrow(CalculationError);
      expect(() => calculatePortfolioAllocation(
        [{ assetId: 'A', quantity: Number.MAX_VALUE }, { assetId: 'B', quantity: Number.MAX_VALUE }],
        { A: 1, B: 1 },
      )).toThrow(CalculationError);
      expect(() => calculatePortfolioAllocation([{ assetId: 'A', quantity: 1 }], { A: Number.MAX_VALUE }, { cash: Number.MAX_VALUE }))
        .toThrow(CalculationError);
    });
  });

  describe('calculatePortfolioValueSeries', () => {
    it('evaluates portfolio value series correctly over multiple periods', () => {
      const holdings = [
        { assetId: 'TCS', quantity: 10 },
        { assetId: 'INFY', quantity: 20 },
      ];
      const historicalPrices = {
        TCS: [100, 110, 105],
        INFY: [50, 60, 55],
      };
      // Step 0: 10*100 + 20*50 + 1000 = 1000 + 1000 + 1000 = 3000
      // Step 1: 10*110 + 20*60 + 1000 = 1100 + 1200 + 1000 = 3300
      // Step 2: 10*105 + 20*55 + 1000 = 1050 + 1100 + 1000 = 3150
      const values = calculatePortfolioValueSeries(holdings, historicalPrices, { cash: 1000 });
      expect(values).toEqual([3000, 3300, 3150]);
    });

    it('throws ValidationError if historical price lengths do not match', () => {
      const holdings = [
        { assetId: 'TCS', quantity: 10 },
        { assetId: 'INFY', quantity: 20 },
      ];
      const historicalPrices = {
        TCS: [100, 110],
        INFY: [50, 60, 55],
      };
      expect(() => calculatePortfolioValueSeries(holdings, historicalPrices)).toThrow(
        /Price history length mismatch/
      );
    });

    it('supports cash array time series matching valuation steps', () => {
      const holdings = [{ assetId: 'TCS', quantity: 10 }];
      const historicalPrices = { TCS: [100, 110] };
      const cashSeries = [500, 600];
      const values = calculatePortfolioValueSeries(holdings, historicalPrices, {
        cash: cashSeries,
      });
      expect(values).toEqual([1500, 1700]);
    });

    it('throws ValidationError for invalid input types and empty series in calculatePortfolioValueSeries', () => {
      expect(() => calculatePortfolioValueSeries([], {})).toThrow(ValidationError);
      expect(() =>
        calculatePortfolioValueSeries([{ assetId: 'TCS', quantity: 10 }], null)
      ).toThrow(ValidationError);
      expect(() =>
        calculatePortfolioValueSeries([{ assetId: 'TCS', quantity: 10 }], { TCS: [] })
      ).toThrow(ValidationError);
      expect(() =>
        calculatePortfolioValueSeries(
          [{ assetId: 'TCS', quantity: 10 }],
          { TCS: [100, -50] }
        )
      ).toThrow(ValidationError);
      expect(() =>
        calculatePortfolioValueSeries(
          [{ assetId: 'TCS', quantity: 0 }],
          { TCS: [100, 105] }
        )
      ).toThrow(ValidationError);
    });

    it('rejects malformed holdings, IDs, and quantities', () => {
      for (const holding of [null, undefined, 5, {}, { assetId: '', quantity: 1 },
        { assetId: 'A', quantity: -1 }, { assetId: 'A', quantity: NaN },
        { assetId: 'A', quantity: Infinity }, { assetId: 'A', quantity: '1' }]) {
        expect(() => calculatePortfolioValueSeries([holding], { A: [1, 2] })).toThrow(ValidationError);
      }
    });

    it('requires cash arrays to match the full price-series length and validates scalar cash', () => {
      const holdings = [{ assetId: 'A', quantity: 1 }];
      const prices = { A: [10, 11] };
      for (const cash of [[1], [1, 2, 3], -1, NaN, Infinity, '1']) {
        expect(() => calculatePortfolioValueSeries(holdings, prices, { cash })).toThrow(ValidationError);
      }
    });

    it('rejects invalid prices and arithmetic overflow', () => {
      const holdings = [{ assetId: 'A', quantity: 2 }];
      for (const price of [0, -1, NaN, Infinity, '2']) {
        expect(() => calculatePortfolioValueSeries(holdings, { A: [1, price] })).toThrow(ValidationError);
      }
      expect(() => calculatePortfolioValueSeries([{ assetId: 'A', quantity: Number.MAX_VALUE }], { A: [2] }))
        .toThrow(CalculationError);
      expect(() => calculatePortfolioValueSeries([{ assetId: 'A', quantity: 1 }], { A: [Number.MAX_VALUE] }, { cash: Number.MAX_VALUE }))
        .toThrow(CalculationError);
    });

    it('allows zero-quantity holdings and zero cash, with normalized allocation weights', () => {
      expect(calculatePortfolioValueSeries(
        [{ assetId: 'A', quantity: 1 }, { assetId: 'ZERO', quantity: 0 }], { A: [10, 20] }, { cash: 0 },
      )).toEqual([10, 20]);
      const allocation = calculatePortfolioAllocation(
        [{ assetId: 'A', quantity: 2 }, { assetId: 'B', quantity: 1 }], { A: 10, B: 20 }, { cash: 5 },
      );
      expect(allocation.holdings.reduce((sum, item) => sum + item.weight, allocation.cashWeight)).toBeCloseTo(1, 12);
    });

    it('throws ValidationError for invalid holding structure and prices in calculatePortfolioAllocation', () => {
      expect(() => calculatePortfolioAllocation(null, {})).toThrow(ValidationError);
      expect(() => calculatePortfolioAllocation([], null)).toThrow(ValidationError);
      expect(() =>
        calculatePortfolioAllocation([null], { TCS: 100 })
      ).toThrow(ValidationError);
      expect(() =>
        calculatePortfolioAllocation([{ assetId: '', quantity: 10 }], { '': 100 })
      ).toThrow(ValidationError);
      expect(() =>
        calculatePortfolioAllocation([{ assetId: 'TCS', quantity: 10 }], { TCS: -100 })
      ).toThrow(ValidationError);
    });
  });
});
