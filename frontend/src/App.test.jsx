import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import { MemoryRouter } from 'react-router-dom';
import TransactionTracker, { AddInvestment, Transactions } from './components/TransactionTracker.jsx';
import MarketTicker, { MARKET_TICKER_POLL_MS, TickerStrip } from './components/MarketTicker.jsx';
import PublicLanding from './components/PublicLanding.jsx';
import { ThemeProvider } from './theme/ThemeContext.jsx';

describe('public Quantara homepage', () => {
  it('explains the product and links to the existing authentication routes', () => {
    const markup = renderToStaticMarkup(<ThemeProvider><MemoryRouter><PublicLanding /></MemoryRouter></ThemeProvider>);
    expect(markup).toContain('Clarity for every');
    expect(markup).toContain('Investment imports');
    expect(markup).toContain('Risk analytics');
    expect(markup).toContain('href="/login"');
    expect(markup).toContain('href="/register"');
    expect(markup).toContain('ILLUSTRATIVE PREVIEW');
    expect(markup).toContain('No live market data or personal account information is displayed.');
    expect(markup).toContain('id="features"');
    expect(markup).toContain('id="analytics"');
    expect(markup).toContain('aria-label="Appearance: Light"');
  });

  it('places the same appearance control in the authenticated dashboard header', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><ThemeProvider><TransactionTracker user={{ id: 'theme-test', name: 'Test User' }} onLogout={async () => {}}/></ThemeProvider></MemoryRouter>);
    expect(markup).toContain('aria-label="Appearance: Light"');
    expect(markup).toContain('Base currency');
    expect(markup).toContain('Log out');
  });
});

describe('transaction-based dashboard', () => {
  it('renders a labeled, keyboard-focusable market ticker loading state', () => {
    const markup = renderToStaticMarkup(<MarketTicker />);
    expect(markup).toContain('MARKET WATCH');
    expect(markup).toContain('Loading market quotes');
    expect(markup).toContain('tabindex="0"');
  });

  it('polls the rotating ticker on the 110-second provider refresh cadence', () => {
    expect(MARKET_TICKER_POLL_MS).toBe(110_000);
  });
  it('renders multiple ticker symbols independently and repeats them for the seamless cycle', () => {
    const markup = renderToStaticMarkup(<TickerStrip items={[
      { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', price: 100, dailyChangePercent: 1.25, quoteTimestamp: '2026-10-26T19:59:00.000Z' },
      { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', price: null, dailyChangePercent: null, error: { code: 'PROVIDER_RATE_LIMIT', message: 'Rate limit reached' } },
      { symbol: 'GOOGM', name: 'Alphabet Inc.', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD', price: 200, dailyChangePercent: null, quoteTimestamp: '2026-10-26T19:59:00.000Z' },
    ]}/>);
    expect(markup.match(/<strong>AAPL<\/strong>/g)).toHaveLength(2);
    expect(markup.match(/<strong>NVDA<\/strong>/g)).toHaveLength(2);
    expect(markup.match(/<strong>GOOGM<\/strong>/g)).toHaveLength(2);
    expect(markup).toContain('Rate limit reached');
    expect(markup).toContain('Change n/a');
    expect(markup).toContain('Apple Inc.');
    expect(markup).toContain('aria-hidden="true"');
  });
  it('keeps the seamless direction, data-sized duration, pause selectors and reduced-motion support', () => {
    const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.ticker-track\s*\{[^}]*animation:ticker-sweep\s+var\(--ticker-duration,15s\)\s+linear\s+infinite/s);
    const ticker = renderToStaticMarkup(<TickerStrip items={['A', 'B', 'C', 'D'].map((symbol) => ({ symbol, micCode: 'XNGS' }))}/>);
    expect(ticker).toContain('--ticker-duration:20s');
    expect(css).toContain('from{transform:translateX(-50%)}to{transform:translateX(0)}');
    expect(css).toContain('.ticker-viewport:hover .ticker-track,.ticker-viewport:focus .ticker-track');
    expect(css).toContain('@media(prefers-reduced-motion:reduce)');
    expect(css).toContain('@media(max-width:640px)');
  });
  it('does not render portfolio content before the server session has been verified', () => {
    const markup = renderToStaticMarkup(<MemoryRouter><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>);
    expect(markup).toContain('Loading your secure session');
    expect(markup).not.toContain('Your ledger is empty');
    expect(markup).not.toContain('Add investment');
  });

  it('keeps a historical execution price distinct from the fetched current quote', () => {
    const instrument = { symbol: 'FORCEMOT', name: 'Force Motors', exchange: 'NSE', micCode: 'XNSE', currency: 'INR', country: 'India' };
    const markup = renderToStaticMarkup(<AddInvestment
      provider={{ configured: true }} ledger={{ config: { baseCurrency: 'INR' } }} portfolio={{ holdings: [] }} baseCurrency="INR" baseCurrencyLocked={false} onBaseCurrencyChange={() => {}}
      searchText="" setSearchText={() => {}} search={() => {}} searchResults={[]} searching={false}
      instrument={instrument} selectInstrument={() => {}} transactionType="BUY" setTransactionType={() => {}}
      date="2023-02-10" setDate={() => {}} quantity="2" setQuantity={() => {}} unitPrice="8300" setUnitPrice={() => {}}
      fees="20" setFees={() => {}} quote={{ price: 9100, currency: 'INR', quoteTimestamp: '2025-03-04T10:00:00.000Z', isMarketOpen: false, source: 'Twelve Data' }}
      quoteLoading={false} quoteError={null} onRefreshQuote={() => {}} availableQuantity={0} onSave={() => {}} demoMode={false} onExitDemo={() => {}}
    />);
    expect(markup).toContain('Latest provider quote:');
    expect(markup).toContain('Portfolio Settings');
    expect(markup).toContain('set this before your first transaction');
    expect(markup).toContain('Twelve Data');
    expect(markup).toContain('value="8300"');
    expect(markup).toContain('value="2023-02-10"');
    expect(markup).toContain('max=');
    expect(markup).toContain('Enter actual execution price');
    expect(markup).toContain('Transaction type: BUY');
    expect(markup).not.toContain('>SELL</button>');
  });

  it('only exposes SELL in the Transactions form and limits its instrument list to open holdings', () => {
    const markup = renderToStaticMarkup(<AddInvestment
      allowSell provider={{ configured: false }} ledger={{ config: { baseCurrency: 'USD' }, transactions: [] }}
      portfolio={{ holdings: [{ instrument: { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', micCode: 'XNGS', currency: 'USD' }, quantity: 4 }] }}
      baseCurrency="USD" baseCurrencyLocked={false} onBaseCurrencyChange={() => {}} connectionTest={null} connectionTestError="" connectionTestLoading={false} onTestConnection={() => {}}
      searchText="" setSearchText={() => {}} search={() => {}} searchResults={[]} searching={false} instrument={null} selectInstrument={() => {}}
      transactionType="SELL" setTransactionType={() => {}} date="2025-01-01" setDate={() => {}} quantity="" setQuantity={() => {}} unitPrice="" setUnitPrice={() => {}} fees="0" setFees={() => {}}
      quote={null} quoteLoading={false} quoteError={null} onRefreshQuote={null} availableQuantity={0} onSave={() => {}} onCancel={() => {}} demoMode={false} onExitDemo={() => {}}
    />);
    expect(markup).toContain('>BUY</button>');
    expect(markup).toContain('>SELL</button>');
    expect(markup).toContain('Held investment');
    expect(markup).toContain('AAPL · Apple Inc. · 4.00 shares available');
  });

  it('places the primary Add transaction action on the Transactions page, including the empty state', () => {
    const markup = renderToStaticMarkup(<Transactions transactions={[]} baseCurrency="USD" onAddTransaction={() => {}}/>);
    expect(markup).toContain('Record a BUY or SELL transaction here');
    expect(markup).toContain('＋ Add transaction');
    expect(markup).toContain('Import Investment Transactions');
    expect(markup).toContain('date,symbol,type,quantity,price');
    expect(markup).not.toContain('date,symbol,price');
  });

  it('leaves historical BUY entry enabled when the provider quote is unavailable', () => {
    const instrument = { symbol: 'FORCEMOT', name: 'Force Motors', exchange: 'NSE', micCode: 'XNSE', currency: 'INR', country: 'India' };
    const markup = renderToStaticMarkup(<AddInvestment
      provider={{ configured: true }} ledger={{ config: { baseCurrency: 'INR' } }} portfolio={{ holdings: [] }} baseCurrency="INR" baseCurrencyLocked={false} onBaseCurrencyChange={() => {}}
      searchText="" setSearchText={() => {}} search={() => {}} searchResults={[]} searching={false}
      instrument={instrument} selectInstrument={() => {}} transactionType="BUY" setTransactionType={() => {}}
      date="2023-02-10" setDate={() => {}} quantity="2" setQuantity={() => {}} unitPrice="8300" setUnitPrice={() => {}}
      fees="20" setFees={() => {}} quote={null} quoteLoading={false} quoteError="Twelve Data plan required" onRefreshQuote={() => {}}
      availableQuantity={0} onSave={() => {}} demoMode={false} onExitDemo={() => {}}
    />);
    expect(markup).toContain('Provider quote unavailable: Twelve Data plan required');
    const saveButton = markup.match(/<button[^>]*>Save buy transaction<\/button>/)?.[0];
    expect(saveButton).toBeTruthy();
    expect(saveButton).not.toMatch(/\sdisabled(?:\s|=|>)/);
  });
});
