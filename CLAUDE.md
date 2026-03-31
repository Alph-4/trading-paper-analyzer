# Trading Paper Analyzer — Claude Instructions

## Project Overview
React + Vite dashboard for analyzing paper trading results from CSV exports.
Dark terminal aesthetic with Tailwind v4 + Recharts.

## Tech Stack
- React 19 + Vite 8
- Tailwind CSS v4 (`@tailwindcss/vite` plugin, CSS-only config in `src/index.css`)
- Recharts for all charts
- PapaParse for CSV parsing
- date-fns for date manipulation
- lucide-react for icons

## Domain Knowledge

### Trading & Finance
- **PnL** = Profit & Loss (realized). Gross PnL = trade result before commission. Net PnL = after commission.
- **Win Rate** = % of trades with gross PnL > 0.
- **Profit Factor** = Sum(wins) / |Sum(losses)|. > 1.5 is good, > 2 is excellent.
- **Expectancy** = (Win Rate × Avg Win) + (Loss Rate × Avg Loss). Positive = edge.
- **Max Drawdown** = Largest peak-to-trough decline in balance. Key risk metric.
- **Sharpe Ratio** ≈ Mean(returns) / Std(returns) × √252 (annualized). > 1 is acceptable, > 2 is good.
- **Sortino Ratio** = Like Sharpe but only penalizes downside volatility. More relevant for trading.
- **Calmar Ratio** = Annualized Return / Max Drawdown. > 1 is good.
- **R-Multiple** = PnL / Risk (not directly available here, but can approximate).
- **FX pairs convention**: EUR/GBP → base=EUR, quote=GBP. Long = buy EUR, sell GBP.
- **Commission drag**: Total commissions as % of gross PnL shows efficiency.

### CSV Format (TradingView Paper Trading Export)
Columns: `Heure`, `Balance avant`, `Balance après`, `Pertes et profits réalisés (valeur)`, `Pertes et profits réalisés (devise)`, `Action`

Row types:
1. `Commission for: Enter position for symbol X` — entry fee (negative PnL)
2. `Close long/short position for symbol X at price Y` — trade result
3. `Commission for: Close long/short position for symbol X` — exit fee (negative PnL)

Trade lifecycle: Entry commission → (time passes) → Close trade row + Exit commission row (same timestamp/symbol).

### Data Science Analysis Patterns
- **Descriptive stats**: Mean, median, std dev, skewness, kurtosis of PnL distribution.
- **Time series**: Balance curve, equity curve, drawdown curve.
- **Segmentation**: By symbol, direction (long/short), hour of day, weekday.
- **Correlation**: No direct market data here, but can analyze performance vs time patterns.
- **Monte Carlo**: Shuffle past trades to simulate future equity paths (if enough data).
- **Kelly Criterion**: Optimal position size = Win Rate - (Loss Rate / Win/Loss Ratio).
- **Streak analysis**: Max consecutive wins/losses. Long loss streaks = psychological impact.
- **Rolling metrics**: 5-trade rolling win rate shows recent performance trends.

## Code Conventions
- All colors use Tailwind utility classes. Positive = `text-emerald-400`, Negative = `text-red-400`.
- Card pattern: `bg-zinc-900 border border-zinc-800 rounded-xl p-4`
- Analytics live in `src/utils/analytics.js`, CSV parsing in `src/utils/parseCSV.js`
- Chart components receive pre-computed data as props — no analytics inside chart components.
- Format currency: always 2 decimal places with `$` prefix. Format % with 1 decimal.

## Key File Paths
- `src/utils/parseCSV.js` — CSV → structured row array
- `src/utils/analytics.js` — All metrics computation
- `src/App.jsx` — Root state (csvData, analytics, activeTab)
- `src/components/Dashboard.jsx` — Tab container
