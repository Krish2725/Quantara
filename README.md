# Quantara

Quantara is a browser-based, transaction-ledger investment tracker with a Twelve Data market-data adapter and the existing historical analytics API. Buy and sell transactions are the source of truth. Historical market prices and current quotes come from the configured provider or an explicitly labeled synthetic demo. The product does not fabricate missing market data or provide investment advice.

## Features

- Search instruments by ticker or company name and select the exact exchange, MIC and quote currency.
- Record dated BUY/SELL transactions with quantity, execution price and fees. Overselling is rejected.
- Preview and import Excel-exported investment transaction CSVs into the same authenticated append-only ledger. Imported BUY/SELL rows use the normal holdings and weighted-average accounting pipeline and are marked as imports.
- Calculate weighted-average cost basis: purchase fees are capitalized; sale fees reduce net sale proceeds; partial sale basis is removed proportionally.
- Show remaining quantity, cost basis, average cost, quote timestamp/source, market value, realized and unrealized P/L, total P/L and available daily change.
- Persist portfolio settings and transactions through the Express API to MongoDB. A local browser backup supports recovery and one-time migration.
- Show an animated, rotating 30-symbol S&P 500 watchlist with provider price, absolute/percentage change, freshness, and per-symbol unavailable/stale states.
- Fetch split-adjusted historical prices through the provider for actual open holdings; provider-unavailable states remain explicit.
- Inspect individual instrument price histories and calculate historical risk metrics through the existing analytics API. These are not transaction-weighted portfolio returns.
- Load an explicitly synthetic demo to explore the dashboard without a provider key.

## Requirements and startup

Install dependencies at the repository root:

```bash
npm install
```

Copy `.env.example` to `backend/.env`, set `MONGODB_URI` and optionally `TWELVE_DATA_API_KEY`, then start the backend and frontend in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

The frontend normally runs at `http://127.0.0.1:5173`; the API listens on port 3000. The Vite development proxy forwards `/api` requests to the backend. `TWELVE_DATA_API_KEY` is read only by the backend; never use a `VITE_` prefix for provider credentials. Restart the backend after changing `backend/.env`.

The maintained watchlist lives in `backend/src/tickerWatchlist.js`; `TICKER_SYMBOLS` can reduce or reorder it, but cannot introduce unlisted identities. The ticker attempts at most four symbols per 90-second refresh, keeps per-symbol cached results, and rotates through the configured list. Thus a full cycle takes about 12 minutes at default settings, before provider failures or cooldowns. Provider entitlements are account-specific; unavailable symbols remain explicitly unavailable. Twelve Data charges credits per symbol even when using its batch interface, so batching does not make 30-symbol refreshes free. See [S&P Dow Jones Indices](https://www.spglobal.com/spdji/en/indices/equity/sp-500/) for constituent reference and [Twelve Data batch request credit behavior](https://support.twelvedata.com/en/articles/5203360-batch-api-requests).

For local persistence, install MongoDB Community Server and use `MONGODB_URI=mongodb://127.0.0.1:27017/quantara`. For MongoDB Atlas, create a database user and network access rule, then set `MONGODB_URI` to the Atlas connection string in `backend/.env`. Never commit `.env` or place credentials in frontend variables. `GET /health` reports whether a URI is configured and whether Mongoose is connected, without returning the URI. Without a reachable database, the API remains available for analytics and market data but portfolio loads/saves return an error; it does not claim a successful save.

Quantara uses MongoDB-backed server sessions and per-account portfolio ownership. Set `SESSION_SECRET` to a unique random secret (at least 32 characters), `MONGODB_URI` to the database, and `FRONTEND_ORIGIN` to the exact comma-separated frontend origins. `TRUST_PROXY=1` should only be enabled behind a trusted reverse proxy. The session cookie is HTTP-only, SameSite=Lax, Secure in production, and expires after 14 days. State-changing auth and portfolio requests require a CSRF token.

On first login, any existing valid browser ledger is offered for explicit import only if the account has no portfolio. Existing browser-key Mongo records are not assigned to an account; they remain inaccessible through the API. If server portfolio data already exists, it is loaded and the browser copy is retained as `quantara.transaction-ledger.backup.v1`; the app does not merge conflicting portfolios. The browser ledger remains a recoverable backup after successful saves. Synthetic demo transactions are not persisted.

Without a key, the app shows setup instructions and does not substitute prices. Users may still explore the clearly labeled illustrative demo. Search, live quotes and provider history require a configured key and the correct Twelve Data plan and exchange entitlement.

## Provider behavior and plan limits

The adapter calls Twelve Data's symbol search, quote and daily time-series endpoints. It uses the exchange MIC from the selected listing for quote/history requests, displays provider timestamps and currency, applies an 8-second timeout, and maps missing configuration, provider authorization/access, rate limiting, missing symbols and invalid responses to clear API errors. Results are cached server-side in memory (search 5 minutes, quote 1 minute, daily history 6 hours) and matching in-flight requests are deduplicated. Cache is lost when the backend restarts.

Market-data routes are public for the dashboard's pre-transaction instrument lookup and ticker; requests share an in-memory limit of 60 per client IP per 15 minutes. This limits accidental or abusive provider-quota use but is not a distributed quota system. Behind a trusted reverse proxy, configure `TRUST_PROXY=1` so client addresses are identified correctly.

Twelve Data plan entitlements change what is available and whether internal display is permitted. Consult [Twelve Data pricing](https://twelvedata.com/pricing), [API documentation](https://twelvedata.com/docs), and its [exchange coverage listing](https://twelvedata.com/exchanges?country=India) before use. The free Basic plan has limited credits and display rights; exchange availability and latency vary by plan. The app does not claim real-time coverage for every exchange. A 429 response is surfaced instead of retried endlessly. Do not assume a key provides a particular exchange or display entitlement.

## Using the tracker

1. Register or sign in. Unauthenticated visitors are sent to the login page. Signing out destroys the server session.
2. If offered, choose “Import local portfolio” to copy the existing browser ledger to the signed-in account. The original browser copy is retained; import is never automatic.
3. Select the portfolio base currency before adding the first transaction. FX conversion is not implemented, so all transactions must use that currency.
4. Choose **Add investment** to record a BUY only. Use **Transactions → Add transaction** for BUY or SELL. A sale must use an existing open holding and cannot exceed its available quantity.
5. Search an instrument and choose its exact listing. If the provider is not configured, enter ticker, exchange, MIC and currency manually. Record the actual execution date, quantity, unit price and fees; the quote is only a convenience and is not automatically treated as an executed trade.
6. Use Investments to review holdings, cost basis, quotes and P/L. Use Transactions to review the append-only ledger and realized P/L.
7. On Transactions, use **Import Investment Transactions** for actual past trades. Upload `date,symbol,type,quantity,price,fees` (fees optional), inspect the full preview and confirm. Common aliases such as `ticker`, `side`, `qty`, `unit_price` and `commission` are accepted. Dates may be strict `YYYY-MM-DD` or `DD-MM-YYYY`. Every symbol must resolve to one stock listing; new/ambiguous symbols require selecting an exact provider-verified listing. The whole batch is rejected if a row is invalid or sells exceed shares available at that point in chronological order. The authenticated endpoint validates the whole ledger again and atomically stores rows with their idempotency record in one MongoDB portfolio document.
8. Use Overview, Investments, Transactions and Risk Analysis to inspect the same persisted, transaction-derived holdings. Historical price charts use provider history only. Legacy user-supplied history fields from prior versions are retained in account settings for compatibility, but are ignored by charts, valuations, risk calculations and portfolio scoring. No transaction or legacy setting is silently removed.
9. The Portfolio Health estimate and stock ratings are descriptive rules over open transaction-derived positions. Missing quotes or history remain unavailable and are not counted as zero risk.

Trades are append-only in the UI. A correction should be recorded as an offsetting transaction. The MongoDB portfolio is authoritative; a user-scoped local copy is retained as a recoverable backup. Clearing browser data removes only that local backup, not the MongoDB portfolio.

## CSV format

### Investment transaction import

```csv
date,symbol,type,quantity,price,fees
2026-09-07,NVDA,BUY,10,150.00,1.00
2026-09-10,NVDA,BUY,5,155.00,1.00
2026-09-15,NVDA,SELL,3,165.00,1.00
```

Required canonical columns are `date,symbol,type,quantity,price`; `fees` is optional and defaults to zero. Header matching ignores case and surrounding whitespace and supports documented common aliases. Dates support strict `YYYY-MM-DD` and `DD-MM-YYYY`, normalized to ISO. Rows preserve CSV order for same-day execution. An atomic batch must contain 1–500 fully valid rows. Before confirmation the client previews row errors, quantities, gross values and cash effect; the server independently verifies listing identity and runs the combined chronological ledger through the existing long-only validation and accounting rules. No database write happens for invalid rows or an invalid SELL sequence. New symbols require an exact listing selected from provider search. Imported transactions are stored as ordinary ledger entries with source/batch/CSV-row metadata. A UUID import id and canonical content hash are persisted alongside them in the same MongoDB portfolio document, so retrying identical content returns the prior result without duplication and changed content under that id conflicts. The single-document compare-and-set write makes the ledger append and idempotency record atomic; normal portfolio saves also merge concurrent append-only transaction rows. No multi-document transaction is required.

Investment transaction rows represent actual trades. Execution prices in this file are not historical market closes.

Legacy historical-price CSV upload is retired. Prior account config fields are preserved opaquely and never consumed as quotes or price history. Historical chart data comes from the Twelve Data provider; no replacement, deletion, or automatic migration of legacy records is performed.

## Architecture and API

- `analytics/`: shared transaction-derived holdings/valuation math, historical performance, portfolio comparison, and deterministic explainable health/rating calculations used by backend and frontend.
- `backend/`: Express authentication and analytics routes, MongoDB sessions, user model, Twelve Data adapter, cached market ticker, and per-user Mongoose portfolio persistence.
- `frontend/`: React + Vite authentication routes, protected transaction ledger, server persistence client with recoverable local backup, provider API client and CSV validation.
- `docs/ANALYTICS_METHODOLOGY.md`: analytics formulas and conventions.

Endpoints:

- `GET /health`
- `GET /api/auth/csrf`, `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/portfolio` and `PUT /api/portfolio` require an authenticated session; writes require the CSRF header.
- `GET /api/portfolio` includes a canonical ledger-derived summary; imported transaction writes return the same summary with the persisted ledger.
- `GET /api/market-data/status`
- `GET /api/market-data/ticker` (cached rotating 30-symbol watchlist; independent quote results/errors and partial-availability states)
- `GET /api/market-data/test-connection` checks the documented Basic trial symbol AAPL on NASDAQ (`XNGS`) without changing portfolio data.
- `GET /api/market-data/search?q=...`
- `GET /api/market-data/quote?symbol=...&micCode=...`
- `GET /api/market-data/history?symbol=...&micCode=...`
- `POST /api/portfolio-analysis` for a numeric value series.
- `POST /api/portfolio-comparison` for the pre-existing dated buy-and-hold analysis contract.

The transaction ledger is calculated in the browser and validated again by the backend before persistence. Portfolio health uses the same exported `@quantara/analytics` function in the app, with actual open holdings, provider quotes, and provider histories. It uses no separate guessed server-side metrics. The ticker watchlist identities are maintained centrally; account plan coverage is not guaranteed and prices are never fabricated. Daily change is unavailable if the provider omits previous close. The refresh interval defaults to 90 seconds (`TICKER_REFRESH_MS` can override it); each refresh advances at most four quote requests (`TICKER_BATCH_SIZE`, capped at four). Quote cache and ticker rotation/stale data are in-memory and reset on backend restart.

## Accounting conventions and limitations

- The tracker is long-only and rejects a sell larger than the available quantity.
- Weighted-average basis includes buy fees. Selling removes the same proportion of current average basis as shares sold. Realized P/L is quantity × execution price minus sell fees minus basis removed.
- Open unrealized P/L is provider-quote market value minus remaining basis. Imported CSV history is never used for current valuation, quote display, or P/L. Portfolio totals require every open holding to have a provider quote in the base currency.
- FX conversion, short positions, dividends, taxes, deposits/withdrawals, rebalancing and transaction-weighted portfolio return are not implemented. Historical price metrics exclude dividends and do not predict future results.
- The provider's daily series is split-adjusted according to its API mode. Imported CSV adjustment quality is the user's responsibility.
- Historical metrics use the existing analytics conventions: annualized mean return is arithmetic, not CAGR; annualization assumes regular observations; short histories can mislead. See the methodology document.

## Deployment status

The production frontend is built to `frontend/dist`. The root `vercel.json` proxies `/api/*` and `/health` to Render and sends remaining SPA routes to `index.html`. Replace `YOUR-RENDER-SERVICE` in both external destinations with the actual Render service hostname before deploying. Leave `VITE_API_BASE_URL` unset for this same-origin proxy; setting it to Render directly bypasses the proxy and makes browser session cookies cross-site. Set the backend `FRONTEND_ORIGIN` to the exact Vercel production origin. Provide production `MONGODB_URI`, a unique `SESSION_SECRET` of at least 32 characters, `NODE_ENV=production`, and `TRUST_PROXY=1` behind Render's proxy. Verify `/health`, registration/login, refresh, logout, and a persisted portfolio through the Vercel domain before sharing it. This repository does not contain the actual Render hostname or verify a live deployment.

## Verification

```bash
npm test
npm --workspace=quantara-frontend run build
```
