# Quantara frontend

React + Vite + Tailwind dashboard for the existing Quantara analytics API.

## Run locally

From the repository root, `npm run dev` starts the Express API on port 3000 and the Vite development server on port 5173. Open <http://localhost:5173>. Vite proxies `/api` and `/health` to the backend. The API can also be started and used independently with `npm run dev:backend` and the frontend with `npm run dev:frontend`.

Set `VITE_API_BASE_URL` when the API is hosted at a different origin. The frontend sends `POST /api/portfolio-comparison` using the backend's existing `{ holdings, benchmark, riskFreeRate, frequency }` request contract. See `docs/ANALYTICS_METHODOLOGY.md` for the dated series schema and response metrics.

## Bundled sample assumptions

The dashboard starts with a deterministic, fully synthetic portfolio and illustrative benchmark. Its eight dated observations are bundled in `src/data/samplePortfolio.js`; no market data is downloaded. The sample contains three long-only positions at fixed quantities. The dashboard posts those observations to the backend and renders the resulting analysis response.

This fixture is not live market data and does not represent real issuers or an actual index. Price series do not include separately modeled dividends, cash flows, fees, taxes, or rebalancing. The contribution view follows the backend's buy-and-hold endpoint-value attribution. The dashboard labels the sample as synthetic and values as demo units because the API does not define a currency.

## Checks

- `npm run build` creates the production bundle in `frontend/dist`.
- `npm run test:frontend` runs frontend service and rendering tests.
- `npm test` runs analytics, backend API, and frontend tests.
