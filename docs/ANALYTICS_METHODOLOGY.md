# Quantara Analytics Methodology & Mathematical Specifications

This document defines the mathematical foundations, conventions, assumptions, and edge-case handling rules implemented in `@quantara/analytics`.

---

## 1. Return Calculations

### 1.1 Periodic Simple Return
Simple return represents the percentage change in asset or portfolio value between observation period $t-1$ and period $t$.

$$\mathbf{R}_t = \frac{P_t - P_{t-1}}{P_{t-1}} = \frac{P_t}{P_{t-1}} - 1$$

Where:
- $P_t$: Price / value at observation index $t$ ($t \ge 1$)
- $P_{t-1}$: Price / value at observation index $t-1$

#### Assumptions & Validations:
- Price values must be strictly positive finite numbers ($P > 0$). Negative or zero prices are invalid in cash equity portfolios and throw an error.
- Minimum observations: At least 2 prices ($N \ge 2$) are required to compute 1 periodic return. An array with fewer than 2 prices throws an error.
- Observations must be strictly ordered chronologically.

---

### 1.2 Cumulative Return
Cumulative return reflects the total compound growth of capital over an entire observation horizon from $t=0$ to $t=T$.

$$\mathbf{R}_{cum} = \prod_{t=1}^{T} (1 + R_t) - 1 = \frac{P_T - P_0}{P_0}$$

The cumulative return series $\{CR_t\}_{t=0}^T$ tracks the growth trajectory from base 0:
$$CR_0 = 0$$
$$CR_t = \prod_{i=1}^{t} (1 + R_i) - 1 = \frac{P_t}{P_0} - 1$$

#### Edge Cases:
- Flat price series ($P_t = P_0$ for all $t$): $R_{cum} = 0.0$.
- Total loss ($P_T = 0$): $R_{cum} = -1.0$ (-100%).
- Return values $< -1.0$ (loss > 100%) represent leveraged debt or invalid accounting in unleveraged long portfolios and are rejected.

---

## 2. Portfolio Valuation & Weight Allocation

### 2.1 Portfolio Position Value & Total Portfolio Value
For $M$ holdings with quantities $q_i$ and current prices $p_i$, alongside optional cash balance $C$:

$$V_i = q_i \times p_i \quad \text{for } i \in \{1, \dots, M\}$$
$$V_{total} = \sum_{i=1}^{M} V_i + C$$

### 2.2 Portfolio Asset Weights
The allocation weight $w_i$ of each constituent holding and cash is:

$$w_i = \frac{V_i}{V_{total}}, \quad w_{cash} = \frac{C}{V_{total}}$$

Such that:
$$\sum_{i=1}^{M} w_i + w_{cash} = 1.0$$

#### Assumptions & Constraints:
- Long-only portfolio assumption: $q_i \ge 0$ and $p_i \ge 0$ and $C \ge 0$.
- Non-zero portfolio valuation: $V_{total} > 0$. If $V_{total} = 0$, weights cannot be normalized and an error is thrown.
- Missing prices: If any constituent asset with $q_i > 0$ lacks an associated price, the function throws an error rather than assuming price = 0.
- Cash flows: External cash contributions or withdrawals are treated at the portfolio level as changes in cash balance $C$. Buy/sell transactions exchange cash for quantity at price $p$, preserving $V_{total}$ pre-trade friction.

---

## 3. Volatility (Annualized Standard Deviation)

### 3.1 Sample Standard Deviation of Returns
For a sample of $N$ periodic returns $\{R_1, R_2, \dots, R_N\}$:

$$\bar{R} = \frac{1}{N} \sum_{t=1}^{N} R_t$$

$$\sigma_{sample} = \sqrt{\frac{1}{N - 1} \sum_{t=1}^{N} (R_t - \bar{R})^2}$$

Bessel's correction ($N - 1$ in the denominator) is used to ensure an unbiased estimator of population variance.

### 3.2 Annualization Convention
Periodic volatility is scaled to an annual basis using the square root of time rule:

$$\sigma_{annual} = \sigma_{sample} \times \sqrt{k}$$

Where $k$ is the annualization factor (number of periods in one calendar trading year):
- **Daily:** $k = 252$ (standard Indian / global equity trading days per year)
- **Weekly:** $k = 52$
- **Monthly:** $k = 12$
- **Quarterly:** $k = 4$
- **Annual:** $k = 1$

#### Edge Cases & Validations:
- Requires $N \ge 2$ returns. For $N < 2$, degrees of freedom $N - 1 = 0$, division by zero is undefined; throws an error.
- Constant returns ($R_t = c$ for all $t$): $\sigma_{sample} = 0.0$ and $\sigma_{annual} = 0.0$.
- Annualization factor $k$ must be a positive finite number ($k > 0$).

---

## 4. Maximum Drawdown (MDD) & Drawdown Series

Drawdown measures the percentage decline in portfolio value from its historical cumulative peak.

### 4.1 Running Peak
At each observation step $t \in \{0, \dots, T\}$:

$$M_t = \max_{0 \le s \le t} (V_s)$$

### 4.2 Drawdown Series
$$DD_t = \frac{V_t - M_t}{M_t}$$

- When portfolio value is at an all-time high, $V_t = M_t \implies DD_t = 0.0$.
- In a decline, $DD_t \in [-1.0, 0.0)$.

### 4.3 Maximum Drawdown (MDD)
The maximum peak-to-trough decline over the period:

$$MDD = \min_{0 \le t \le T} (DD_t)$$

Quantara returns:
- `maxDrawdown`: Negative decimal value (e.g., `-0.245` for a 24.5% drop).
- `maxDrawdownPercent`: Percentage representation (e.g., `-24.5%`).
- `peakValue` & `peakIndex`: The peak value and index preceding the maximum trough.
- `troughValue` & `troughIndex`: The lowest value and index reached before recovery.
- `drawdownSeries`: Array of drawdown values at each step for underwater charting.

#### Edge Cases & Validations:
- Monotonically increasing portfolio values: $MDD = 0.0$, peak is final index, trough is final index.
- Single observation: $MDD = 0.0$.
- Total loss to 0: $MDD = -1.0$ (-100%).
- All values must be non-negative finite numbers ($V_t \ge 0$). Peak $M_0$ must be $> 0$.

---

## 5. Sharpe Ratio

The Sharpe ratio measures the excess return per unit of total risk (volatility).

### 5.1 Annualized Sharpe Ratio Formula

The configured risk-free rate is an annual effective rate. Quantara converts it to an equivalent rate per observation using geometric compounding:

$$R_{f,period} = (1 + R_f)^{1/k} - 1$$

The annualized Sharpe ratio uses each observation's excess return:

$$\text{Sharpe Ratio} = \frac{\overline{(R_t - R_{f,period})}}{\sigma_{sample}(R_t)} \times \sqrt{k}$$

Where:
- $k$: Configured observations per year; `DAILY` defaults to 252. Other named factors or a positive numeric factor can be supplied.
- $R_f$: Annual effective risk-free rate assumption, defaulting to `0.065` (6.5%). It is configurable and is not a guaranteed current market quote. Values must exceed -100% for effective-rate conversion.
- The denominator is sample standard deviation of the original periodic returns. Subtracting a constant periodic risk-free rate does not change that standard deviation.
- Arithmetic annualized mean return remains $\bar{R}_{periodic} \times k$ and is not CAGR. It is reported separately from the Sharpe excess return.

### 5.2 Edge Cases & Zero Volatility Handling
- **Zero Volatility ($\sigma = 0$):**
  If all returns are identical, risk is zero. If mean periodic excess return is effectively zero, Sharpe is defined as `0.0`. If it is non-zero, division by zero is mathematically undefined and Quantara throws a descriptive `CalculationError` rather than returning `Infinity` or `NaN`.
- **Negative Sharpe Ratio:**
  When mean periodic return is below the effective periodic risk-free rate, the Sharpe ratio is legitimately negative. It indicates that risk-free cash would have outperformed the risky portfolio under the selected observation convention.
- **Frequency Matching:**
  The annual effective rate is converted with $(1+R_f)^{1/k}-1$ and subtracted from each observation return before averaging. This uses one common observation-period risk-free rate.
- Annualization uses the configured observation-frequency factor and assumes regular observations. Irregular date gaps are treated as one observation period: no interpolation or elapsed-calendar-time adjustment is applied.

---

## 6. Hand-Verifiable Numerical Fixtures

### Fixture A: 5-Day Simple Price Series
- Prices: `[100, 105, 102, 110, 108]`
- Observations: $N = 5$ prices, $T = 4$ periods.

1. **Periodic Returns:**
   - $R_1 = \frac{105 - 100}{100} = +0.050000$ (+5.0%)
   - $R_2 = \frac{102 - 105}{105} = -0.028571$ (-2.8571%)
   - $R_3 = \frac{110 - 102}{102} = +0.078431$ (+7.8431%)
   - $R_4 = \frac{108 - 110}{110} = -0.018182$ (-1.8182%)

2. **Cumulative Return:**
   - $R_{cum} = \frac{108 - 100}{100} = +0.080000$ (+8.0%)
   - Compound verification: $(1 + 0.05)(1 - 0.028571)(1 + 0.078431)(1 - 0.018182) - 1 = 0.080000$

3. **Sample Volatility (Daily, $k = 252$):**
   - Mean $\bar{R} = \frac{0.050000 - 0.02857142857 + 0.07843137255 - 0.01818181818}{4} = 0.0204195314$
   - Sum of squared deviations $= 0.00813055618$
   - $\sigma_{daily} = \sqrt{\frac{0.00813055618}{4 - 1}} = \sqrt{0.00271018539} \approx 0.05205944$
   - $\sigma_{annual} = 0.05205944 \times \sqrt{252} \approx 0.82641801$ (82.6418%)

4. **Maximum Drawdown:**
   - Peaks:
     - $t=0: P=100$, Peak $= 100, DD = 0.0$
     - $t=1: P=105$, Peak $= 105, DD = 0.0$
     - $t=2: P=102$, Peak $= 105, DD = \frac{102 - 105}{105} = -0.028571$ (-2.857%)
     - $t=3: P=110$, Peak $= 110, DD = 0.0$
     - $t=4: P=108$, Peak $= 110, DD = \frac{108 - 110}{110} = -0.018182$ (-1.818%)
   - Maximum Drawdown $= -0.028571$ (-2.8571%), occurring from Peak at index 1 (105) to Trough at index 2 (102).

5. **Sharpe Ratio (Annualized with $R_f = 0.06$, $k = 252$):**
   - $R_{f,daily} = (1 + 0.06)^{1/252} - 1 \approx 0.0002312526$
   - Mean daily excess return $= 0.0204195314 - 0.0002312526 = 0.0201882789$
   - Sharpe $= \frac{0.0201882789}{0.05205944} \times \sqrt{252} \approx 6.156021$

---

### Fixture B: Portfolio Allocation & Weights
- Holding 1: `TCS`, quantity = 10, price = 3,500 $\implies$ Value = 35,000
- Holding 2: `INFY`, quantity = 25, price = 1,400 $\implies$ Value = 35,000
- Holding 3: `RELIANCE`, quantity = 10, price = 2,800 $\implies$ Value = 28,000
- Cash: 2,000
- Total Portfolio Value $= 35,000 + 35,000 + 28,000 + 2,000 = 100,000$
- Weights:
  - `TCS`: $35,000 / 100,000 = 0.35$ (35%)
  - `INFY`: $35,000 / 100,000 = 0.35$ (35%)
  - `RELIANCE`: $28,000 / 100,000 = 0.28$ (28%)
  - `Cash`: $2,000 / 100,000 = 0.02$ (2%)
  - Sum $= 1.00$ (100%)

---

## 7. Historical Portfolio Construction & Benchmark Comparison

### 7.1 Input Contract

`calculateHistoricalPortfolioAnalysis` and `POST /api/portfolio-comparison` accept:

```json
{
  "holdings": [
    {
      "assetId": "AAA",
      "quantity": 2,
      "prices": [
        { "date": "2025-01-01", "price": 10 },
        { "date": "2025-01-02", "price": 12 },
        { "date": "2025-01-03", "price": 11 }
      ]
    }
  ],
  "benchmark": {
    "name": "Example Index",
    "values": [
      { "date": "2025-01-01", "value": 100 },
      { "date": "2025-01-02", "value": 101 },
      { "date": "2025-01-03", "value": 99 }
    ]
  },
  "riskFreeRate": 0.06,
  "frequency": "DAILY"
}
```

`holdings` is required and non-empty. Each `assetId` must be unique, each quantity and price must be positive and finite, and each date must be a valid `YYYY-MM-DD` calendar date. Price observations must be unique and strictly ascending. All holdings must have exactly the same dates in the same order; a missing observation is rejected rather than filled. At least three portfolio dates are required by the summary statistics.

Benchmark data is optional. It uses strictly ascending, unique, positive finite dated observations. The calculation uses the exact date intersection with the portfolio and returns the matched dates in `benchmark.alignedDates` and `comparison.alignedDates`. It does not interpolate or carry a benchmark value across a missing date. At least three shared dates are required. Benchmark dates outside the portfolio date range are not used.

`riskFreeRate` and `frequency` use the conventions and defaults in sections 3 and 5: annual risk-free rate defaults to 0.065 and frequency defaults to DAILY (252 periods per year). Frequency may be `DAILY`, `WEEKLY`, `MONTHLY`, `QUARTERLY`, `SEMI_ANNUALLY`, or `ANNUAL`, or a custom positive finite numeric annualization factor.

### 7.2 Construction, Allocation & Attribution

Quantara applies the buy-and-hold assumption: quantities are constant across the supplied date range. At date $t$, holding market value is $V_{i,t}=q_i p_{i,t}$ and portfolio market value is $V_t=\sum_i V_{i,t}$. There is no cash balance in this historical input contract. Allocation weight is $w_{i,t}=V_{i,t}/V_t$; the response includes these weights and values for each date.

The holding-level `cumulativeContribution` is $(V_{i,T}-V_{i,0})/V_0$. It is expressed as a decimal contribution to portfolio cumulative return, and sums to $(V_T-V_0)/V_0$ under the constant-quantity, no-cash assumptions. This is endpoint value attribution; it does not claim to model transaction timing or trading costs.

### 7.3 Benchmark Comparison Metrics

Portfolio and benchmark cumulative returns are calculated from their first and last aligned observations. `cumulativeReturnDifference` is $R_p-R_b$, a decimal percentage-point difference (for example, 0.055 is 5.5 percentage points). `relativeCumulativeReturn` is $(1+R_p)/(1+R_b)-1$, the portfolio's relative compounded wealth change over the same matched window. The nested performance summaries use the portfolio's full date series and the benchmark's aligned series, respectively.

`frequency` controls annualization by observation count, not by elapsed calendar duration. If matched observations have irregular time gaps, annualized return, volatility and Sharpe ratio do not adjust for those gaps; cumulative and relative cumulative returns still use the actual first and last matched values. No missing observation is interpolated.

### 7.4 Unsupported Cash-Flow and Corporate-Action Handling

Dividends are not modeled as separate cash flows. If a caller wants total-return treatment, it must supply a consistently dividend-adjusted price series; the API does not verify whether prices are adjusted. External deposits and withdrawals are unsupported and are not neutralized, so including them in the portfolio's market-value path can distort calculated returns and contributions. Rebalancing is unsupported: quantities remain constant for the entire series. Taxes, fees, slippage, and transaction costs are also not modeled.

## 8. Transaction Ledger and Live Valuation

The transaction tracker stores the authenticated user's versioned, append-only ledger in a MongoDB portfolio document; a browser-local copy is retained only as a recoverable backup. For each instrument, it sorts transactions by trade date and creation time and applies a long-only weighted-average cost method. A BUY increases quantity and basis by `quantity × execution price + buy fees`. A SELL removes the fraction `sold quantity / pre-sale quantity` of the current basis; realized P/L is `quantity × sale price − sell fees − basis removed`. Selling more than the available quantity is rejected. This ledger method is separate from the existing dated buy-and-hold analytics API described above.

Confirmed transaction CSV imports create ordinary ledger rows with `source: import`, a batch identifier and original CSV row number. Dates are parsed as strict ISO or day-first dates before being stored in ISO form. The backend validates the full appended ledger in chronological order before writing. Same-day rows use CSV row order through deterministic creation timestamps. Fees follow the same BUY basis capitalization and SELL proceeds deduction as manual entries. Import batch id plus a hash of its normalized content is stored in the same portfolio document as the new rows; a MongoDB compare-and-set on the document revision atomically commits both, and retries return the existing result only when the content hash matches. Batch identifiers are scoped by MongoDB user ownership. This avoids partial multi-document writes and does not treat two visually identical but separately identified legitimate trades as duplicates. The server does not trust frontend preview validation.

For an open position, unrealized P/L is `quantity × selected valuation price − remaining basis`. Provider quotes include their source, currency, and timestamp. If the provider quote is unavailable, current market value and unrealized P/L are unavailable. Portfolio totals require all open positions to have a valuation in the selected base currency. Historical prices also come from the provider; user-supplied execution prices in imported transactions are never substituted for market closes.

The tracker does not model FX conversion, dividends, deposits/withdrawals, taxes, corporate action cash flows or transaction-weighted portfolio returns. Its historical risk screen analyzes one instrument's daily split-adjusted price series; split adjustment accounts for share-count changes, but the series excludes dividends and therefore measures price-only returns, not total investment returns. Those metrics must not be interpreted as whole-portfolio performance. Provider exchange coverage, latency and display rights depend on the user's Twelve Data plan. Legacy `importedHistory` config fields are retained opaquely for backward compatibility but are ignored by charts, valuation, risk, and health calculations. The retired `date,symbol,price` upload path is not used. Historical closes come from the provider; CSV transaction `price` always means execution price.

## 9. Portfolio Health Estimate and Holding Ratings

These descriptive scores are a Quantara-specific heuristic, not a forecast, personalized recommendation, or copy of another platform's rating system. Only holdings derived from BUY/SELL transactions with positive remaining quantity are scored. Legacy user-supplied history config is ignored; provider history must have at least three unique valid dated positive prices; dates after the supplied `asOfDate` are excluded. Daily gaps are treated as one observation interval and are not interpolated.

### 9.1 Component normalization

Let `r` be a return in percentage points, for example `+20` for +20%. Performance score is the smooth bounded function `clamp(50 + 50 × r / (|r| + 20), 0, 100)`. The 20-point scale is a smooth reference scale, not a return threshold or annualization; since-acquisition P/L is not annualized. Trailing historical return is specifically the first available close at/after one year before the latest eligible close, if at least 60 observations span at least 300 calendar days. It is a price return, not a total return.

Other components use these scores:

- Diversification: `100 × (1 − HHI)`, where HHI is the sum of squared open-position weights by provider-quoted current market value. It measures cross-holding concentration only, not sector or factor diversification.
- Volatility: `100 × (1 − min(annualized sample volatility / 0.80, 1))`. Annualization uses 252 daily observations per year and sample standard deviation.
- Drawdown: `100 × (1 − min(|maximum drawdown| / 0.80, 1))`. Maximum drawdown is the actual running-peak decline over eligible provider history.
- Coverage: the mean of quote coverage and provider-history coverage, each expressed from 0 to 100.

### 9.2 Portfolio score weights and missing data

Nominal weights are unrealized performance 30%, realized performance 10%, diversification 15%, volatility 15%, drawdown 15%, and data coverage 15%. Unrealized return is aggregated P/L over open cost basis; realized return is separately `realized P/L ÷ cumulative buy cost`, and is never added to unrealized P/L. The first five (non-coverage) component scores are weighted by their nominal weights and renormalized across only the components that have valid inputs. The resulting available-component score contributes 85% and coverage contributes 15%. If every non-coverage component is unavailable, the score equals coverage and is provisional. An empty portfolio has no score. Missing quotes/history are unavailable inputs, never zero P/L or zero risk. Volatility and drawdown are cost-basis-weighted averages among holdings with usable provider histories; they are not portfolio return series and do not model correlation.

Portfolio score categories default to Excellent `>=80`, Good `>=65`, Neutral `>=45`, Poor `>=30`, and Very Poor `<30`. The exported threshold objects can be passed as validated descending `healthThresholds` and `stockThresholds` overrides.

### 9.3 Per-holding rating

Each positive-quantity holding receives a weighted average of whichever components are available: since-acquisition unrealized return 35%, trailing one-year price return 25%, volatility 15%, drawdown 15%, and current portfolio weight 10%. Available weights are renormalized for that holding; no unavailable item receives an implicit zero. Stock categories default to Excellent `>=80`, Good `>=65`, Neutral `>=50`, Poor `>=35`, Very Poor `<35`, and Insufficient Data when no component is available. The UI shows quote timestamp, units, average cost, current value, P/L, risk measures, data status, and explanatory risk/return reasons. The scores are backward-looking, sensitive to history length and provider coverage, and can understate risk when data is missing.

## 10. Market ticker watchlist and request budget

The maintained initial 30-name S&P 500 watchlist and listing identity fields are in `backend/src/tickerWatchlist.js`; this is the only file to edit for membership. Symbols and exchange MICs are intended for provider lookup, but a listing in the watchlist does not guarantee the signed-in operator's Twelve Data account is entitled to return its quote. Recheck the official S&P 500 constituent reference and provider search/quote identity when maintaining the file. Constituents and provider symbols can change.

The ticker requests at most four symbols per configured refresh (default 90 seconds), rotates across the list, reuses the market-data service's cache/request deduplication, retains stale results only with an explicit stale state, and retries failures after a per-symbol cooldown. At the defaults, a full nominal pass over 30 symbols takes about 12 minutes, not 90 seconds. Twelve Data's batch interface still consumes credits per symbol, so a batch request is not a quota discount. Rotation and cache are in-memory and restart empty. Provider plan, quota, delay, and display permission are outside Quantara's control; unavailable/pending states are explicit, and no quote is synthesized.
