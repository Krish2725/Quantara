/**
 * Hand-verified numerical fixtures for testing Quantara financial analytics.
 * Every value in this file was independently derived mathematically.
 */

export const fixtureA = {
  description: '5-day price series with single intermediate pullback and final all-time high',
  prices: [100, 105, 102, 110, 108],
  expected: {
    returns: [
      (105 - 100) / 100,                   // 0.05
      (102 - 105) / 105,                   // -0.02857142857142857
      (110 - 102) / 102,                   // 0.0784313725490196
      (108 - 110) / 110,                   // -0.01818181818181818
    ],
    cumulativeReturn: 0.08,                // (108 - 100) / 100 = 8%
    cumulativeReturnSeries: [
      0.0,
      0.05,
      0.02,
      0.10,
      0.08,
    ],
    sampleMeanReturn: 0.020419531448943214,
    sampleVolatility: 0.052059440977132165,
    annualizedVolatilityDaily: 0.052059440977132165 * Math.sqrt(252), // ~0.8264180053
    drawdown: {
      maxDrawdown: (102 - 105) / 105,      // -0.02857142857142857 (-2.857%)
      peakValue: 105,
      peakIndex: 1,
      troughValue: 102,
      troughIndex: 2,
      recoveryIndex: 3,                   // Reached 110 at index 3
      drawdownDuration: 1,
      recoveryDuration: 1,
      drawdownSeries: [
        0,
        0,
        (102 - 105) / 105,
        0,
        (108 - 110) / 110,
      ],
    },
    sharpe: {
      rf: 0.06,
      k: 252,
      dailyRf: (1 + 0.06) ** (1 / 252) - 1,
      annualizedReturn: 0.020419531448943214 * 252, // 5.14572192513369
      excessReturn: (0.020419531448943214 - ((1 + 0.06) ** (1 / 252) - 1)) * 252,
      sharpeRatio: ((0.020419531448943214 - ((1 + 0.06) ** (1 / 252) - 1)) / 0.052059440977132165) * Math.sqrt(252),
    },
  },
};

export const fixtureB = {
  description: 'Indian Large-Cap Equity Allocation with Cash',
  holdings: [
    { assetId: 'TCS', quantity: 10 },
    { assetId: 'INFY', quantity: 25 },
    { assetId: 'RELIANCE', quantity: 10 },
  ],
  prices: {
    TCS: 3500,
    INFY: 1400,
    RELIANCE: 2800,
  },
  cash: 2000,
  expected: {
    totalValue: 100000,
    cashWeight: 0.02,
    holdings: [
      { assetId: 'TCS', quantity: 10, price: 3500, value: 35000, weight: 0.35 },
      { assetId: 'INFY', quantity: 25, price: 1400, value: 35000, weight: 0.35 },
      { assetId: 'RELIANCE', quantity: 10, price: 2800, value: 28000, weight: 0.28 },
    ],
  },
};

export const fixtureC = {
  description: 'Severe 40% Drawdown with Multi-Period Recovery',
  values: [100, 105, 120, 110, 84, 72, 90, 120, 130],
  expected: {
    maxDrawdown: -0.40, // (72 - 120) / 120 = -0.40 (-40%)
    peakValue: 120,
    peakIndex: 2,
    troughValue: 72,
    troughIndex: 5,
    recoveryIndex: 7,   // Recovered back to 120 at index 7
    drawdownDuration: 3, // 5 - 2 = 3 steps to bottom
    recoveryDuration: 2, // 7 - 5 = 2 steps to recover
  },
};
