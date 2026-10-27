import { isProviderEligibleInstrument } from '../data/ledger.js';

export async function refreshPortfolioMarketData(holdings, {
  getQuote, getHistory, onQuote, onHistory, onError, isActive = () => true,
}) {
  for (const holding of holdings.filter((item) => item.quantity > 0 && isProviderEligibleInstrument(item.instrument))) {
    const key = `${holding.instrument.micCode}:${holding.instrument.symbol}`;
    try {
      const quote = await getQuote(holding.instrument);
      if (isActive()) onQuote?.(key, holding.instrument, quote);
    } catch (error) {
      if (isActive()) onError?.(key, 'quote', error);
    }
    try {
      const history = await getHistory(holding.instrument);
      if (isActive()) onHistory?.(key, history);
    } catch (error) {
      if (isActive()) onError?.(key, 'history', error);
    }
  }
}
