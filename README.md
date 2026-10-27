# Quantara

**A transaction-based investment tracker with clear portfolio accounting and historical risk analytics.**

Quantara helps self-directed investors keep their stock trades, holdings, cost basis, and market information in one place. It separates actual BUY/SELL records from market-price data, so an execution price is never mistaken for a historical close or live quote.

**Live app:** [quantara-lime.vercel.app](https://quantara-lime.vercel.app)

**Backend health:** [quantara-lime.vercel.app/health](https://quantara-lime.vercel.app/health)

## The problem

Investors often piece together a portfolio from brokerage records, spreadsheets, market sites, and separate calculators. That makes it harder to reconcile trades with current holdings, understand how profit and loss were derived, and interpret historical risk. Quantara brings these workflows together while keeping the underlying transactions inspectable and the analytics assumptions explicit.

## Who it is for

Quantara is designed for individual, self-directed investors who want to record a long-only stock portfolio, review transaction-derived holdings and profit/loss, and inspect historical prices and risk measures. It is a tracking and learning tool—not a brokerage, tax service, or source of investment advice.

## What you can do

- Create an account and keep a portfolio scoped to your authenticated account.
- Search for an instrument and select its listing, exchange, MIC, and quote currency.
- Record dated BUY and SELL transactions; reject sales that exceed the available quantity.
- Import past investment transactions from CSV after previewing the rows and validating the complete batch.
- Review holdings, weighted-average cost basis, realized and unrealized P/L, market value, and quote freshness.
- View provider-supplied split-adjusted historical prices and instrument-level risk analysis.
- Compare several instruments on the Overview chart using indexed performance, distinct from actual price charts.
- Explore an explicitly labeled synthetic demo when live provider data is unavailable.
- Inspect a rotating market watchlist with explicit pending, stale, and unavailable quote states. The frontend polls every 90 seconds and the backend refreshes at most four symbols per poll, rotating through the 30-symbol list in about 12 minutes.

## How it works

```text
React + Vite frontend
        │ same-origin /api requests
        ▼
Vercel rewrites ──► Express API on Render
                          ├── MongoDB: users, sessions, portfolios
                          └── Twelve Data: quotes, search, price history

Shared analytics package: transaction accounting and historical metrics
```

The frontend presents the app and validates user input. The Express backend handles authentication, authorization, provider requests, and persistence. MongoDB stores the authenticated user's portfolio and server-side session. The shared `analytics/` package contains deterministic financial calculations used by the application and backend.

## Run locally

### Requirements

- Node.js 20 or later with npm
- MongoDB running locally or a MongoDB Atlas database
- A Twelve Data API key is optional; live search, quotes, and price history depend on the key's plan and exchange access

### Install and configure

Run from the repository root:

```bash
npm install
```

Copy the root `.env.example` file to `backend/.env`. Set a local MongoDB connection string and a unique session secret of at least 32 characters. Add a Twelve Data key only if needed. Keep secrets in the backend environment; never expose them through `VITE_` variables or commit `.env` files.

Example local configuration:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/quantara
SESSION_SECRET=replace_with_a_unique_random_secret_at_least_32_characters
FRONTEND_ORIGIN=http://127.0.0.1:5173,http://localhost:5173
TRUST_PROXY=0
TWELVE_DATA_API_KEY=your_key_if_available
```

Start the services in separate terminals from the repository root:

```bash
npm run dev:backend
npm run dev:frontend
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The Vite development server proxies API requests to the backend on port 3000. `GET /health` reports service and database connection status without exposing credentials.

## Use the application

1. Register or sign in. Dashboard routes require an authenticated session.
2. Set the portfolio base currency before recording transactions. FX conversion is not implemented, so transactions must use that currency.
3. Add an investment to create a BUY, or use Transactions to record a BUY or SELL. Select the exact instrument listing and enter the actual trade date, quantity, execution price, and fees.
4. Review holdings and accounting on Investments and Transactions. Trade rows are append-only in the UI; corrections should be recorded as offsetting transactions.
5. To import past trades, open **Transactions → Import Investment Transactions**. Review the preview and validation results before confirming the whole batch.
6. Use Overview for portfolio summaries and multi-instrument indexed comparison. Use Risk Analysis for one instrument's actual historical prices and drawdown/risk metrics.

### Transaction CSV

The importer accepts a header row with these required columns: `date,symbol,type,quantity,price`. `fees` is optional and defaults to zero.

```csv
date,symbol,type,quantity,price,fees
2026-09-07,NVDA,BUY,10,150.00,1.00
2026-09-10,NVDA,BUY,5,155.00,1.00
2026-09-15,NVDA,SELL,3,165.00,1.00
```

Dates may use strict `YYYY-MM-DD` or `DD-MM-YYYY` format. The importer validates the complete batch, instrument identity, positive values, and the chronological long-only ledger before saving. Invalid batches are rejected atomically. These rows represent actual trades; their prices are execution prices, not historical market closes.

The former `date,symbol,price` historical-price CSV upload is retired. Legacy account fields are retained for compatibility but are not used as quote or chart data. Historical charts use provider history.

## Portfolio accounting

For each instrument, the ledger applies BUY and SELL transactions in chronological order using weighted-average cost:

- BUY basis increases by `quantity × execution price + buy fees`.
- SELL basis removed is the fraction of current basis corresponding to shares sold.
- Realized P/L is `quantity × sale price − sell fees − basis removed`.
- Unrealized P/L is current provider-quoted value minus remaining cost basis.

The MongoDB portfolio is authoritative. A recoverable browser copy is retained locally, but it does not replace server persistence. Portfolio and session records are scoped to the authenticated user. Importing a transaction batch creates ledger transactions; it is not the historical-price import feature.

## Historical analytics and assumptions

Risk Analysis uses a selected instrument's provider-supplied daily, split-adjusted price history. The chart displays actual prices; the Overview comparison chart separately indexes each series to a starting value of 100. Split-adjusted prices without dividends measure **price-only returns**, not total investment returns and not transaction-weighted portfolio performance.

Daily analytics use 252 observations per year by default. Arithmetic annualized return is the mean daily simple return multiplied by 252; it is not CAGR. Volatility uses sample standard deviation annualized by `√252`. Sharpe uses daily excess returns and the configured annual risk-free rate. Maximum drawdown is calculated from the running historical peak. Irregular date gaps count as one observation interval; missing observations are not interpolated. See [docs/ANALYTICS_METHODOLOGY.md](docs/ANALYTICS_METHODOLOGY.md) for formulas, validation rules, edge cases, and limitations.

Historical price metrics are backward-looking and depend on data coverage. They do not predict future performance or provide investment recommendations. Provider quote coverage, update delay, exchange access, and display entitlements depend on the Twelve Data plan. Quantara does not invent missing quotes or history.

## Security and data handling

- Passwords are hashed; authenticated requests use server-side sessions stored in MongoDB.
- Session cookies are HTTP-only, SameSite=Lax, and Secure in production.
- State-changing authentication and portfolio requests require a CSRF token.
- Portfolio endpoints enforce authenticated user ownership.
- Production deployment requires `MONGODB_URI`, `SESSION_SECRET` (at least 32 characters), `FRONTEND_ORIGIN`, `NODE_ENV=production`, and `TRUST_PROXY=1` behind Render's proxy. `TWELVE_DATA_API_KEY` is optional for live market data.
- Do not commit secrets, share API keys, or place backend credentials in frontend build variables.

## Production deployment

The frontend is deployed on Vercel at [https://quantara-lime.vercel.app](https://quantara-lime.vercel.app). The backend service is [https://quantara-mepr.onrender.com](https://quantara-mepr.onrender.com). The Vercel configuration in [`vercel.json`](vercel.json) forwards `/api/*` and `/health` to Render and routes the remaining paths to the frontend application.

Vercel builds from the repository root with:

| Setting | Value |
| --- | --- |
| Root Directory | `.` (repository root) |
| Install Command | `npm ci` |
| Build Command | `npm --workspace=quantara-frontend run build` |
| Output Directory | `frontend/dist` |
| `VITE_API_BASE_URL` | Leave unset; API calls use the Vercel same-origin rewrites |

Configure the backend environment variables in Render. Set `FRONTEND_ORIGIN` to `https://quantara-lime.vercel.app` (no trailing slash). Set `TRUST_PROXY=1` and `NODE_ENV=production`. Add the production MongoDB URI and a unique session secret; add the Twelve Data key if live market data is desired. Do not put backend secrets in Vercel frontend variables.

Health check: [https://quantara-lime.vercel.app/health](https://quantara-lime.vercel.app/health). After changing deployment settings, verify health, registration/login, refresh, logout, and that a saved portfolio reloads through the Vercel domain.

## Project structure

```text
analytics/   Shared deterministic portfolio and risk calculations
backend/     Express API, authentication, MongoDB, and market-data adapter
frontend/    React application, routes, charts, and transaction workflows
docs/        Analytics methodology and supporting documentation
vercel.json  Production frontend routing and backend rewrites
```

## Tests and production build

Run the analytics, backend, and frontend test suites from the repository root:

```bash
npm test
```

Build the frontend for production:

```bash
npm --workspace=quantara-frontend run build
```

The backend has a separate production start command for deployment:

```bash
npm start --workspace=quantara-backend
```
