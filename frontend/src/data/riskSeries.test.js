import { describe, expect, it } from 'vitest';
import { describeMaximumDrawdown, prepareRiskObservations } from './riskSeries.js';

describe('risk analysis observations', () => {
  it('sorts valid prices into chronological order without changing values', () => {
    expect(prepareRiskObservations([
      { date: '2025-01-03', price: 12 }, { date: '2025-01-01', price: 10 }, { date: '2025-01-02', price: 11 },
    ])).toEqual([
      { date: '2025-01-01', price: 10 }, { date: '2025-01-02', price: 11 }, { date: '2025-01-03', price: 12 },
    ]);
  });
  it.each([
    [[{ date: '2025-02-30', price: 10 }, { date: '2025-03-01', price: 11 }, { date: '2025-03-02', price: 12 }], /invalid observation/],
    [[{ date: '2025-01-01', price: 10 }, { date: '2025-01-02', price: null }, { date: '2025-01-03', price: 12 }], /invalid observation/],
    [[{ date: '2025-01-01', price: 10 }, { date: '2025-01-02', price: Infinity }, { date: '2025-01-03', price: 12 }], /invalid observation/],
    [[{ date: '2025-01-01', price: 10 }, { date: '2025-01-01', price: 11 }, { date: '2025-01-03', price: 12 }], /duplicate observation/],
    [[{ date: '2025-01-01', price: 10 }, { date: '2025-01-02', price: 11 }], /At least three/],
  ])('rejects unsafe input instead of inventing observations', (series, message) => {
    expect(() => prepareRiskObservations(series)).toThrow(message);
  });

  it('maps the calculated maximum drawdown index to its exact peak/trough dates and percentage', () => {
    const observations = prepareRiskObservations([
      { date: '2025-01-01', price: 100 }, { date: '2025-01-02', price: 120 }, { date: '2025-01-03', price: 90 },
    ]);
    expect(describeMaximumDrawdown(observations, { peakIndex: 1, troughIndex: 2, maxDrawdown: -0.25 }))
      .toEqual({ peakDate: '2025-01-02', troughDate: '2025-01-03', maxDrawdownPercent: -25 });
    expect(() => describeMaximumDrawdown(observations, { peakIndex: 1, troughIndex: 2, maxDrawdown: 0.1 })).toThrow(/do not match/);
  });
});
