# Quantara — Current Scope and Roadmap

This document reflects the implementation in the repository as of 2026-10-27. The README and source code are the detailed setup and behavior references. Earlier concepts below are explicitly marked as not implemented.

## Product

Quantara is a browser-based, authenticated investment transaction tracker with portfolio valuation and historical risk analysis. It is intended for individual investors who want to review a long-only portfolio from recorded BUY/SELL transactions. It is descriptive software, not investment advice.

## Implemented architecture and workflows

- **Frontend:** React 19, React Router, Vite and Tailwind CSS. Public landing, login/register, authenticated dashboard, Overview, Investments, Transactions, Risk Analysis, light/dark/system themes, and the shared Q brand mark.
- **Backend:** Node.js and Express API. Session-based authentication, CSRF checks on mutations, auth/import rate limits, exact-origin credentialed CORS, Twelve Data adapter, ticker cache, and protected account portfolio endpoints.
- **Persistence:** Mongoose user and portfolio models, MongoDB-backed sessions, and user-scoped portfolios. Transaction imports validate and persist as atomic, idempotent ledger batches.
- **Analytics:** Shared pure-JavaScript package used by frontend/backend for ledger accounting, valuation, returns, volatility, Sharpe ratio, maximum drawdown, historical buy-and-hold comparison, and descriptive portfolio/holding scores. Methodology and assumptions are in `docs/ANALYTICS_METHODOLOGY.md`.
- **Market data:** Twelve Data symbol search, quotes and split-adjusted daily history. Missing data remains unavailable. The dashboard's synthetic sample is explicitly labeled and separate from provider market data.

## Accounting and data boundaries

The append-only BUY/SELL transaction ledger is the source of truth for holdings, weighted-average cost basis, and realized P/L. Buy fees are included in basis; sell fees reduce proceeds; overselling is rejected. Imported transaction CSV batches pass the same ledger rules. Historical market prices do not create trades or affect accounting. FX conversion, short positions, dividends, taxes, cash-flow accounting and transaction-weighted portfolio return are not implemented.

The market-data adapter uses a backend-only Twelve Data key. Provider access, history length, quote freshness and display entitlements depend on the account plan. No key or plan is assumed by this project.

## Not implemented

The following ideas in the original proposal are not part of the current application: Sortino/downside risk, beta/alpha, tracking error/information ratio, benchmark provider ingestion, stress/scenario testing, forecast or recommendation features, and the originally proposed Recharts visualizations. Current charts and scores must not be described as implementing those features.

Legacy user-supplied historical price CSV import is retired; old config fields may remain stored opaquely but are not used by charts or analytics. The supported CSV importer imports actual BUY/SELL transactions only. See the README for its schema and validation behavior.

## Build, tests and local development

Install from the repository root with `npm install`; copy `.env.example` to `backend/.env`, configure MongoDB and a backend-only session secret, and use `npm run dev:backend` plus `npm run dev:frontend`. `npm test` runs the analytics, backend and frontend suites. `npm --workspace=quantara-frontend run build` creates `frontend/dist`.

## Future work (not implemented)

Potential future work includes selected advanced risk metrics, benchmark data integration, stress testing, and richer date-aligned portfolio analysis. Any such work requires its own verified methodology, tests, and clear product labels before it is represented as available.
