# Quantara — Project Plan

## 1. Product Overview & Core Principle

**Quantara** is a portfolio analytics and risk intelligence platform designed to evaluate investment portfolios with institutional-grade rigor. It is built to answer key investment questions:
- How has the portfolio performed over time (absolute & risk-adjusted)?
- Do returns justify the risk taken?
- Which holdings drive portfolio gains, losses, and risk concentration?
- How does the portfolio compare with benchmark indices (e.g., Nifty 50)?
- How would the portfolio respond under historical stress events and hypothetical market shocks?

**Core Product Principle:** Quantara is an analytical intelligence engine, not a CRUD app, stock screener, or chatbot wrapper. All metrics are deterministic, transparent, and mathematically verifiable.

---

## 2. System Architecture

Quantara is structured into decoupled, modular layers:

```
┌────────────────────────────────────────────────────────┐
│                   Quantara Frontend                    │
│      React + Vite + Tailwind CSS + Recharts UI        │
│    (Portfolio views, risk attribution, stress tests)   │
└───────────────────────────┬────────────────────────────┘
                            │ REST API / JSON
┌───────────────────────────▼────────────────────────────┐
│                   Quantara Backend                     │
│                Node.js + Express API                   │
│   (Auth, CSV ingestion, portfolio routes, persistence)  │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
┌─────────────▼──────────────┐ ┌───────────▼─────────────┐
│      MongoDB Atlas         │ │   @quantara/analytics   │
│   User & portfolio state   │ │ Pure JS financial math  │
│  (Mongoose schemas/models) │ │ (Zero external I/O deps)│
└────────────────────────────┘ └─────────────────────────┘
```

### Module Responsibilities:
1. **`@quantara/analytics` (Core Engine):**
   - Independent, zero-dependency pure JavaScript calculation library.
   - Handles return series, portfolio aggregation, volatility, drawdowns, risk-adjusted ratios (Sharpe, Sortino, Treynor), benchmark beta/alpha, and scenario stress testing.
   - Comprehensive test suite with Vitest and hand-verified financial fixtures.
2. **`backend/` (API & Persistence):**
   - Node.js + Express REST API (`config/`, `controllers/`, `middlewares/`, `models/`, `routes/`, `services/`, `utils/`).
   - Handles user authentication, portfolio management, CSV parsing/validation, benchmark historical data caching, and metric execution via `analytics`.
   - MongoDB Atlas via Mongoose for user accounts, stored portfolios, and holding snapshots.
3. **`frontend/` (Visual Intelligence Dashboard):**
   - React + Vite + Tailwind CSS + Recharts single-page application.
   - Dynamic charts powered by Recharts (drawdown underwater charts, cumulative return comparisons, asset allocation donuts, risk-return scatter plots).
   - Responsive, high-density analytical dashboard with no mock/placeholder data.

---

## 3. Product Modules

| Module | Purpose | Status |
| :--- | :--- | :--- |
| **M1: Analytics Foundation** | Period returns, cumulative returns, portfolio weights, volatility, max drawdown, Sharpe ratio | In Progress (Milestone 1) |
| **M2: Advanced Risk & Benchmarking** | Sortino ratio, Downside deviation, Benchmark Beta, Jensen's Alpha, Tracking error, Information ratio | Planned (Milestone 2) |
| **M3: Data Ingestion & Models** | CSV import (NSE/BSE/Yahoo format), holdings validation, Mongoose models, price series storage | Planned (Milestone 3) |
| **M4: Backend API Integration** | Express API endpoints (`/api/portfolios`, `/api/analytics`, `/api/benchmarks`) | Planned (Milestone 4) |
| **M5: Analytics Dashboard (UI)** | Interactive dashboard with Recharts, risk cards, weight treemap/table, underwater drawdown chart | Planned (Milestone 5) |
| **M6: Stress Testing & Scenarios** | Historical shocks (COVID crash March 2020, 2008 GFC, Rate Hike 2022) & custom factor shocks | Planned (Milestone 6) |
| **M7: Explainability Layer** | Deterministic metric explanations with optional LLM narrative layer (strictly non-calculating) | Planned (Milestone 7) |

---

## 4. Implementation Milestones

### Milestone 1: Analytics Foundation (Current)
- Establish monorepo structure with `@quantara/analytics`.
- Implement core financial functions: simple returns, cumulative returns, portfolio value & weights, annualized volatility, max drawdown, Sharpe ratio.
- Implement strict input validators, explicit annualization conventions, and error handling.
- Write automated Vitest unit tests covering nominal, edge, and invalid cases with hand-verified fixtures.
- Document analytics methodology in `docs/ANALYTICS_METHODOLOGY.md`.

### Milestone 2: Risk Metrics & Benchmark Analytics
- Add downside risk metrics (Sortino ratio, Semi-variance, Value-at-Risk / CVaR historical).
- Add benchmark comparative analytics: Covariance, Beta ($\beta$), Alpha ($\alpha$), Tracking Error, and Information Ratio against Nifty 50.
- Fixtures and test suite for benchmark analytics.

### Milestone 3: Data Ingestion & Backend Core
- Initialize Express server and MongoDB Mongoose schemas (`User`, `Portfolio`, `Holding`, `PriceHistory`).
- Implement CSV parser for standard broker trade books / transaction histories and price series.
- Ingestion data validation and reconciliation.

### Milestone 4: Portfolio API Services
- Express routes for portfolio CRUD, time-series calculation triggers, and caching.
- Benchmark data seed service (Nifty 50 historical daily close).

### Milestone 5: Web UI & Visual Analytics
- Initialize React + Vite + Tailwind CSS frontend.
- Build KPI cards (Total Value, Cumulative Return, Annualized Volatility, Max Drawdown, Sharpe Ratio).
- Build interactive Recharts components: Portfolio vs Benchmark Growth, Underwater Drawdown Plot, Asset Allocation.

### Milestone 6: Scenario Analysis & Stress Testing
- Portfolio factor exposure engine (shocking specific asset classes or market beta).
- Historical scenario replay (e.g., March 2020 Covid drawdown simulation).

---

## 5. Acceptance Criteria (Milestone 1)

1. **Precision & Correctness:**
   - Calculations match independent hand-calculated mathematical benchmarks within $10^{-6}$ numerical tolerance.
2. **Robust Validation:**
   - Invalid prices ($\le 0$), empty series, mismatched dates, non-finite values, and zero denominators throw explicit errors rather than returning NaN or silent zeroes.
3. **Explicit Conventions:**
   - Return frequencies (daily = 252, weekly = 52, monthly = 12) and risk-free rates ($R_f$) are required or strictly typed parameters.
4. **Zero Side-effects:**
   - Calculations are deterministic, immutable, and have zero external runtime dependencies.
5. **Full Test Coverage:**
   - 100% of core functions covered by automated Vitest tests covering standard flow, boundary cases (single period, flat prices, bankruptcy), and invalid inputs.
