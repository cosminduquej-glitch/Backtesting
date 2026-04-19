import { useEffect, useState, useRef } from "react";

import CandlestickChart from "./components/CandlestickChart";
import { fetchCandlesWithFailover } from "./services/marketDataService";

function App() {
  const [symbolInput, setSymbolInput] = useState("SPY");
  const [activeSymbol, setActiveSymbol] = useState("SPY");
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
    setDebugLogs(prev => [...prev, { time, msg, type }]);
  };

  useEffect(() => {
    let isCancelled = false;
    let timerId = null;

    async function loadCandles() {
      // Try to show cached data quickly (stale-while-revalidate)
      try {
        const cached = getCachedCandles(activeSymbol, '3M');
        if (cached && cached.candles && cached.candles.length) {
          setMarketState({ candles: cached.candles, isLoading: false, error: null });
          addLog(`Loaded cached ${cached.candles.length} candles for ${activeSymbol} (age ${Math.round(cached.ageMs/1000)}s)`, 'info');
        } else {
          setMarketState((previous) => ({
            ...previous,
            isLoading: previous.candles.length === 0,
            error: null,
          }));
        }
      } catch (e) {
        setMarketState((previous) => ({
          ...previous,
          isLoading: previous.candles.length === 0,
          error: null,
        }));
      }

      addLog(`Requesting data for ${activeSymbol}...`, "info");

      // Attempt network fetch and update cache on success
      try {
        const response = await fetchCandlesWithFailover(activeSymbol, "3M");

        if (isCancelled) return;

        setMarketState({
          candles: response.candles,
          isLoading: false,
          error: null,
        });

        addLog(`Successfully loaded ${response.candles.length} candles for ${activeSymbol} (source: ${response.source})`, "success");

        timerId = window.setTimeout(loadCandles, response.nextRecommendedRefreshMs || 60000);
      } catch (error) {
        if (isCancelled) return;

        const cached = getCachedCandles(activeSymbol, '3M');
        if (cached && cached.candles && cached.candles.length) {
          // Keep showing cached data, just log the refresh error
          addLog(`Error refreshing ${activeSymbol}: ${error.message}`, 'error');
        } else {
          setMarketState((previous) => ({
            ...previous,
            isLoading: false,
            error: error.message,
          }));

          addLog(`Error fetching ${activeSymbol}: ${error.message}`, "error");
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
  }, [activeSymbol, refreshSeed]);

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
            placeholder="Search chart (e.g. SPY, AAPL)"
            aria-label="Symbol search"
          />
        </form>
        <button className="debug-toggle-btn" onClick={() => setDebugOpen(!debugOpen)}>
          {debugOpen ? "Hide Debug" : "Show Debug"}
        </button>
      </header>

      <section className="fullscreen-chart-layout">
        {marketState.error && <div className="overlay-error">{marketState.error}</div>}
        <CandlestickChart candles={marketState.candles} />
      </section>

      {debugOpen && (
        <div className="debug-window">
          <div className="debug-header">
            <h3>Debug Logs</h3>
            <button onClick={() => setDebugOpen(false)}>×</button>
          </div>
          <div className="debug-content">
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
