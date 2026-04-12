import { useEffect, useState } from "react";

import CandlestickChart from "./components/CandlestickChart";
import { fetchCandlesWithFailover, getAlphaVantageQuotaStatus } from "./services/marketDataService";

const overviewCards = [
  { label: "Net Worth", value: "CHF 128,400", trend: "+4.8% this month" },
  { label: "Cash Flow", value: "+CHF 3,240", trend: "Income above target" },
  { label: "Monthly Spend", value: "CHF 2,860", trend: "12% below budget" },
];

const budgetItems = [
  { name: "Housing", spent: "CHF 1,240", limit: "CHF 1,500", status: "On track" },
  { name: "Food", spent: "CHF 420", limit: "CHF 550", status: "Healthy pace" },
  { name: "Transport", spent: "CHF 180", limit: "CHF 250", status: "Stable" },
  { name: "Subscriptions", spent: "CHF 96", limit: "CHF 120", status: "Review 2 renewals" },
];

const transactions = [
  { merchant: "Swiss Rail", category: "Transport", amount: "-CHF 48.00", when: "Today, 08:15" },
  { merchant: "Salary", category: "Income", amount: "+CHF 5,900.00", when: "Yesterday" },
  { merchant: "Migros", category: "Groceries", amount: "-CHF 72.40", when: "Yesterday" },
  { merchant: "Streaming Bundle", category: "Subscriptions", amount: "-CHF 18.90", when: "Apr 10" },
];

const goals = [
  { title: "Emergency Fund", progress: "76%", detail: "CHF 7,600 of CHF 10,000" },
  { title: "Tax Reserve", progress: "58%", detail: "CHF 2,900 of CHF 5,000" },
  { title: "Summer Travel", progress: "34%", detail: "CHF 1,020 of CHF 3,000" },
];

function formatPrice(value) {
  if (typeof value !== "number") {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value) {
  if (typeof value !== "number") {
    return "--";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatUpdateTime(value) {
  if (!value) {
    return "Not updated yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function getRefreshLabel(source, nextRecommendedRefreshMs) {
  if (source === "alpha_vantage") {
    const minutes = Math.max(1, Math.ceil((nextRecommendedRefreshMs || 0) / 60000));
    return `Fallback every ~${minutes} min`;
  }

  return "Every 1 minute";
}

function App() {
  const [symbolInput, setSymbolInput] = useState("AAPL");
  const [activeSymbol, setActiveSymbol] = useState("AAPL");
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [marketState, setMarketState] = useState({
    candles: [],
    source: "idle",
    sourceLabel: "Waiting for data",
    nextRecommendedRefreshMs: 60000,
    quota: getAlphaVantageQuotaStatus(),
    isLoading: true,
    error: null,
    lastUpdated: null,
    fallbackReason: null,
  });

  useEffect(() => {
    let isCancelled = false;
    let timerId = null;

    async function loadCandles() {
      setMarketState((previous) => ({
        ...previous,
        isLoading: previous.candles.length === 0,
        error: null,
      }));

      try {
        const response = await fetchCandlesWithFailover(activeSymbol, "3M");

        if (isCancelled) {
          return;
        }

        setMarketState({
          ...response,
          isLoading: false,
          error: null,
          lastUpdated: Date.now(),
        });

        timerId = window.setTimeout(loadCandles, response.nextRecommendedRefreshMs || 60000);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setMarketState((previous) => ({
          ...previous,
          isLoading: false,
          error: error.message,
          quota: getAlphaVantageQuotaStatus(),
        }));

        timerId = window.setTimeout(loadCandles, 60000);
      }
    }

    loadCandles();

    return () => {
      isCancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [activeSymbol, refreshSeed]);

  const latestCandle = marketState.candles[marketState.candles.length - 1];
  const previousCandle = marketState.candles[marketState.candles.length - 2];
  const priceChange = latestCandle && previousCandle ? latestCandle.close - previousCandle.close : null;
  const priceChangePercent =
    latestCandle && previousCandle && previousCandle.close
      ? (priceChange / previousCandle.close) * 100
      : null;

  const handleSymbolSubmit = (event) => {
    event.preventDefault();
    const nextSymbol = symbolInput.trim().toUpperCase();

    if (nextSymbol) {
      setActiveSymbol(nextSymbol);
    }
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">DroidCore</p>
          <h1>Candlestick charts with Finnhub first and Alpha Vantage as live fallback.</h1>
          <p className="hero-text">
            Finnhub is used as the default data source and refreshes once per minute. If it becomes
            unreachable, the app automatically switches to Alpha Vantage and throttles that fallback to
            stay inside the 25 requests per day free limit.
          </p>
          <form className="hero-actions symbol-form" onSubmit={handleSymbolSubmit}>
            <input
              className="symbol-input"
              value={symbolInput}
              onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
              placeholder="AAPL"
              aria-label="Symbol"
            />
            <button type="submit" className="primary-btn">Load Chart</button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setRefreshSeed((value) => value + 1)}
            >
              Refresh Now
            </button>
          </form>
          <div className="quick-symbols">
            {["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"].map((symbol) => (
              <button
                key={symbol}
                type="button"
                className={`quick-symbol-chip ${symbol === activeSymbol ? "active" : ""}`}
                onClick={() => {
                  setSymbolInput(symbol);
                  setActiveSymbol(symbol);
                }}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>
        <div className="hero-panel">
          <span className="panel-label">Market Feed</span>
          <div className="panel-amount">{activeSymbol}</div>
          <p className="panel-note">
            Source: {marketState.sourceLabel}. Last update: {formatUpdateTime(marketState.lastUpdated)}.
          </p>
          <div className="panel-grid">
            <div>
              <span>Primary</span>
              <strong>Finnhub</strong>
            </div>
            <div>
              <span>Fallback</span>
              <strong>Alpha Vantage</strong>
            </div>
            <div>
              <span>Refresh</span>
              <strong>{getRefreshLabel(marketState.source, marketState.nextRecommendedRefreshMs)}</strong>
            </div>
            <div>
              <span>Alpha quota left</span>
              <strong>{marketState.quota?.remaining ?? 25} today</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="market-layout">
        <article className="panel chart-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Trading View</p>
              <h2>{activeSymbol} candlestick chart</h2>
            </div>
            <div className="status-cluster">
              <span className={`status-pill ${marketState.source === "finnhub" ? "good" : "warning"}`}>
                {marketState.sourceLabel}
              </span>
              <span className="status-pill muted">{getRefreshLabel(marketState.source, marketState.nextRecommendedRefreshMs)}</span>
            </div>
          </div>

          {marketState.error ? <p className="chart-error">{marketState.error}</p> : null}
          {marketState.fallbackReason ? (
            <p className="chart-hint">Fallback active because Finnhub returned: {marketState.fallbackReason}</p>
          ) : (
            <p className="chart-hint">Finnhub is polled every minute. Alpha Vantage only steps in when needed.</p>
          )}

          <CandlestickChart candles={marketState.candles} />
        </article>

        <article className="panel market-sidebar">
          <div className="section-head">
            <div>
              <p className="eyebrow">Snapshot</p>
              <h2>Current market status</h2>
            </div>
          </div>
          <div className="quote-grid">
            <div className="quote-card">
              <span>Last close</span>
              <strong>{formatPrice(latestCandle?.close)}</strong>
            </div>
            <div className="quote-card">
              <span>Daily change</span>
              <strong>{typeof priceChange === "number" ? formatPrice(priceChange) : "--"}</strong>
            </div>
            <div className="quote-card">
              <span>Change %</span>
              <strong>{formatPercent(priceChangePercent)}</strong>
            </div>
            <div className="quote-card">
              <span>Day range</span>
              <strong>
                {latestCandle ? `${formatPrice(latestCandle.low)} - ${formatPrice(latestCandle.high)}` : "--"}
              </strong>
            </div>
          </div>

          <div className="data-rules">
            <strong>Failover rules</strong>
            <ul className="check-list compact">
              <li>Finnhub is the standard source</li>
              <li>Automatic refresh every 1 minute on Finnhub</li>
              <li>Alpha Vantage is only used if Finnhub fails</li>
              <li>Alpha fallback is cached and rate-limited to 25/day</li>
            </ul>
          </div>
        </article>
      </section>

      <section className="overview-grid">
        {overviewCards.map((card) => (
          <article key={card.label} className="metric-card">
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.trend}</p>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Budget</p>
              <h2>Monthly envelopes</h2>
            </div>
            <span className="chip">April 2026</span>
          </div>
          <div className="budget-list">
            {budgetItems.map((item) => (
              <div key={item.name} className="budget-item">
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.spent} of {item.limit}</p>
                </div>
                <span>{item.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Goals</p>
              <h2>Savings progress</h2>
            </div>
            <span className="chip">Auto-sync ready</span>
          </div>
          <div className="goal-list">
            {goals.map((goal) => (
              <div key={goal.title} className="goal-card">
                <div className="goal-top">
                  <strong>{goal.title}</strong>
                  <span>{goal.progress}</span>
                </div>
                <div className="goal-bar">
                  <div className="goal-fill" style={{ width: goal.progress }} />
                </div>
                <p>{goal.detail}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="content-grid content-grid-bottom">
        <article className="panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">Transactions</p>
              <h2>Latest activity</h2>
            </div>
            <span className="chip">Live feed</span>
          </div>
          <div className="transaction-list">
            {transactions.map((item) => (
              <div key={`${item.merchant}-${item.when}`} className="transaction-item">
                <div>
                  <strong>{item.merchant}</strong>
                  <p>{item.category}</p>
                </div>
                <div className="transaction-meta">
                  <strong>{item.amount}</strong>
                  <span>{item.when}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel accent-panel">
          <p className="eyebrow">Android Environment</p>
          <h2>Preserved from the original project</h2>
          <ul className="check-list">
            <li>Capacitor 5.7.8 core and Android packages retained</li>
            <li>Gradle wrapper 8.11.1 retained</li>
            <li>Android Gradle Plugin 8.7.2 retained</li>
            <li>Native Android project still available in android/</li>
          </ul>
        </article>
      </section>
    </main>
  );
}

export default App;
