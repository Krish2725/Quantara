const tradingDates = [
  '2025-01-06', '2025-01-07', '2025-01-08', '2025-01-09',
  '2025-01-10', '2025-01-13', '2025-01-14', '2025-01-15',
];

// Synthetic observations for product demonstration only. They are not quotes,
// adjusted prices, or a representation of any real issuer or market index.
export const samplePortfolioRequest = {
  holdings: [
    { assetId: 'ORBT', quantity: 8, prices: [152, 155, 153, 158, 161, 160, 166, 169].map((price, i) => ({ date: tradingDates[i], price })) },
    { assetId: 'NOVA', quantity: 12, prices: [84, 82, 86, 88, 87, 91, 93, 95].map((price, i) => ({ date: tradingDates[i], price })) },
    { assetId: 'PINE', quantity: 5, prices: [210, 208, 211, 215, 214, 218, 220, 222].map((price, i) => ({ date: tradingDates[i], price })) },
  ],
  benchmark: {
    name: 'Illustrative benchmark',
    values: [100, 100.8, 100.2, 101.1, 101.6, 102.2, 102.8, 103.5]
      .map((value, i) => ({ date: tradingDates[i], value })),
  },
  riskFreeRate: 0.04,
  frequency: 'DAILY',
};

export const sampleAssets = {
  ORBT: { name: 'Orbit Systems', color: '#256b59' },
  NOVA: { name: 'Nova Materials', color: '#70a99b' },
  PINE: { name: 'Pinecrest Group', color: '#c2a267' },
};

export const sampleDisclosure = 'Synthetic sample portfolio and illustrative benchmark. Values are for product demonstration only and are not live market data.';
