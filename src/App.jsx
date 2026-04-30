import { useEffect, useState, useRef } from "react";

import CandlestickChart from "./components/CandlestickChart";
import { fetchCandlesWithFailover, getCachedCandles, TIMEFRAMES } from "./services/marketDataService";

function App() {
  const [symbolInput, setSymbolInput] = useState("SPY");
  const [activeSymbol, setActiveSymbol] = useState("SPY");
  const [activeTimeframe, setActiveTimeframe] = useState("1d");
  const [refreshSeed] = useState(0);
  const [marketState, setMarketState] = useState({
    candles: [],
    isLoading: true,
    error: null,
  });

  const [debugLogs, setDebugLogs] = useState([]);
  const [debugOpen, setDebugOpen] = useState(false);

  const addLog = (msg, type = "info") => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev.slice(-50), { time, msg, type }]); // keep last 50 logs
  };

  useEffect(() => {
    addLog("App mounted. Checking env vars...", "info");
    addLog(`FINNHUB key: ${import.meta.env.VITE_FINNHUB_API_KEY ? "present (" + import.meta.env.VITE_FINNHUB_API_KEY.slice(0,6) + "...)" : "MISSING"}`, import.meta.env.VITE_FINNHUB_API_KEY ? "success" : "error");
    addLog(`ALPHA_VANTAGE key: ${import.meta.env.VITE_ALPHA_VANTAGE_API_KEY ? "present (" + import.meta.env.VITE_ALPHA_VANTAGE_API_KEY.slice(0,4) + "...)" : "MISSING"}`, import.meta.env.VITE_ALPHA_VANTAGE_API_KEY ? "success" : "error");
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let timerId = null;

    async function loadCandles() {
      // Try to show cached data quickly (stale-while-revalidate)
      try {
        const cached = getCachedCandles(activeSymbol, activeTimeframe);
        if (cached && cached.candles && cached.candles.length) {
          setMarketState({ candles: cached.candles, isLoading: false, error: null });
          addLog(`Loaded cached ${cached.candles.length} candles for ${activeSymbol} @${activeTimeframe} (age ${Math.round(cached.ageMs/1000)}s)`, 'info');
        } else {
          setMarketState((previous) => ({
            ...previous,
            isLoading: previous.candles.length === 0,
            error: null,
          }));
        }
      } catch (e) {
        addLog(`Cache read error: ${e.message}`, "error");
        setMarketState((previous) => ({
          ...previous,
          isLoading: previous.candles.length === 0,
          error: null,
        }));
      }

      addLog(`Requesting ${activeSymbol} @${activeTimeframe}...`, "info");

      // Attempt network fetch and update cache on success
      try {
        const response = await fetchCandlesWithFailover(activeSymbol, activeTimeframe);

        if (isCancelled) return;

        setMarketState({
          candles: response.candles,
          isLoading: false,
          error: null,
        });

        const resolvedNote = response.resolvedSymbol && response.resolvedSymbol !== activeSymbol
          ? ` (resolved: ${response.resolvedSymbol})`
          : '';
        addLog(`✅ ${response.candles.length} candles for ${activeSymbol}${resolvedNote} @${activeTimeframe} via ${response.sourceLabel}`, "success");

        timerId = window.setTimeout(loadCandles, response.nextRecommendedRefreshMs || 60000);
      } catch (error) {
        if (isCancelled) return;

        const cached = getCachedCandles(activeSymbol, activeTimeframe);
        if (cached && cached.candles && cached.candles.length) {
          addLog(`⚠ Refresh failed but using cache: ${error.message}`, 'error');
        } else {
          setMarketState((previous) => ({
            ...previous,
            isLoading: false,
            error: error.message,
          }));

          addLog(`❌ Error fetching ${activeSymbol}: ${error.message}`, "error");
        }

        const waitMs = (error && error.nextRecommendedRefreshMs) ? error.nextRecommendedRefreshMs : 60000;
        timerId = window.setTimeout(loadCandles, waitMs);
      }
    }

    loadCandles();

    return () => {
      isCancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [activeSymbol, activeTimeframe, refreshSeed]);

  const handleSymbolSubmit = (event) => {
    event.preventDefault();
    const nextSymbol = symbolInput.trim().toUpperCase();

    if (nextSymbol) {
      setActiveSymbol(nextSymbol);
    }
  };

  return (
    <main className="trading-view-shell">
      <header className="trading-nav">
        <form className="symbol-search-form" onSubmit={handleSymbolSubmit}>
          <input
            className="symbol-input"
            value={symbolInput}
            onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
            placeholder="SPY, AAPL, US100..."
            aria-label="Symbol search"
          />
        </form>

        <div className="timeframe-bar">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.id}
              className={`tf-btn${activeTimeframe === tf.id ? ' tf-active' : ''}`}
              onClick={() => setActiveTimeframe(tf.id)}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <button className="debug-toggle-btn" onClick={() => setDebugOpen(!debugOpen)}>
          {debugOpen ? "×" : "⚙"}
        </button>
      </header>

      <section className="fullscreen-chart-layout">
        {marketState.error && <div className="overlay-error">{marketState.error}</div>}
        <CandlestickChart candles={marketState.candles} />
      </section>

      {debugOpen && (
        <div className="debug-window">
          <div className="debug-header">
            <h3>Debug Console</h3>
            <button onClick={() => setDebugOpen(false)}>×</button>
          </div>
          <div className="debug-content">
            {debugLogs.length === 0 && <div className="log-line log-info">Waiting for logs...</div>}
            {debugLogs.map((log, i) => (
              <div key={i} className={`log-line log-${log.type}`}>
                <span className="log-time">[{log.time}]</span> {log.msg}
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
