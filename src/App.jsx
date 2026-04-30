import { useEffect, useState, useRef } from "react";

import CandlestickChart from "./components/CandlestickChart";
import { fetchCandlesWithFailover, getCachedCandles, TIMEFRAMES } from "./services/marketDataService";

const ACCESSIBLE_STOCKS = [
  { symbol: "SP500", label: "SP500 - S&P 500 Index" },
  { symbol: "AAPL", label: "AAPL - Apple" },
  { symbol: "MSFT", label: "MSFT - Microsoft" },
  { symbol: "NVDA", label: "NVDA - NVIDIA" },
  { symbol: "TSLA", label: "TSLA - Tesla" },
  { symbol: "AMZN", label: "AMZN - Amazon" },
  { symbol: "META", label: "META - Meta" },
  { symbol: "GOOGL", label: "GOOGL - Alphabet" },
  { symbol: "GOLD", label: "GOLD - Gold Futures" },
  { symbol: "OIL", label: "OIL - Crude Oil Futures" },
  { symbol: "BTCUSD", label: "BTCUSD - Bitcoin" },
  { symbol: "ETHUSD", label: "ETHUSD - Ethereum" },
];

function App() {
  const [activeSymbol, setActiveSymbol] = useState("SPY");
  const [activeTimeframe, setActiveTimeframe] = useState("1d");
  const [jumpToLatestSignal, setJumpToLatestSignal] = useState(0);
  const [jumpBtnPos, setJumpBtnPos] = useState(null);
  const [jumpBtnDragState, setJumpBtnDragState] = useState("idle");
  const [refreshSeed] = useState(0);
  const [marketState, setMarketState] = useState({
    candles: [],
    isLoading: true,
    error: null,
  });

  const [debugLogs, setDebugLogs] = useState([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const jumpBtnRef = useRef(null);
  const chartLayoutRef = useRef(null);
  const dragStateRef = useRef({
    pointerId: null,
    pressTimer: null,
    dragActive: false,
    moved: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    holdCanceled: false,
  });

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

  useEffect(() => {
    setJumpToLatestSignal((prev) => prev + 1);
  }, [activeSymbol, activeTimeframe]);

  useEffect(() => {
    return () => {
      const state = dragStateRef.current;
      if (state.pressTimer) {
        window.clearTimeout(state.pressTimer);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const clampToContainer = (x, y, width, height) => {
    const container = chartLayoutRef.current;
    if (!container) return { x, y };
    const margin = 8;
    const maxX = Math.max(margin, container.clientWidth - width - margin);
    const maxY = Math.max(margin, container.clientHeight - height - margin);
    return {
      x: Math.min(Math.max(x, margin), maxX),
      y: Math.min(Math.max(y, margin), maxY),
    };
  };

  const handlePointerMove = (event) => {
    const state = dragStateRef.current;
    if (state.pointerId !== event.pointerId || !jumpBtnRef.current || !chartLayoutRef.current) return;

    if (!state.dragActive) {
      // Cancel long-press arm if user moves finger before drag is active.
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      const movedDistance = Math.hypot(dx, dy);
      if (movedDistance > 10) {
        state.holdCanceled = true;
        if (state.pressTimer) {
          window.clearTimeout(state.pressTimer);
          state.pressTimer = null;
        }
        setJumpBtnDragState("idle");
      }
      return;
    }

    const containerRect = chartLayoutRef.current.getBoundingClientRect();
    const rect = jumpBtnRef.current.getBoundingClientRect();
    const nextX = event.clientX - containerRect.left - state.offsetX;
    const nextY = event.clientY - containerRect.top - state.offsetY;
    const clamped = clampToContainer(nextX, nextY, rect.width, rect.height);
    setJumpBtnPos({ left: clamped.x, top: clamped.y });
    state.moved = true;
  };

  const handlePointerUp = (event) => {
    const state = dragStateRef.current;
    if (state.pointerId !== event.pointerId) return;

    if (state.pressTimer) {
      window.clearTimeout(state.pressTimer);
      state.pressTimer = null;
    }

    const wasDragging = state.dragActive;
    state.dragActive = false;
    setJumpBtnDragState("idle");
    state.pointerId = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);

    if (!wasDragging && !state.moved && !state.holdCanceled) {
      setJumpToLatestSignal((prev) => prev + 1);
    }
    state.holdCanceled = false;
  };

  const handleJumpBtnPointerDown = (event) => {
    if (!jumpBtnRef.current || !chartLayoutRef.current) return;
    event.preventDefault();
    const state = dragStateRef.current;
    const containerRect = chartLayoutRef.current.getBoundingClientRect();
    const rect = jumpBtnRef.current.getBoundingClientRect();

    state.pointerId = event.pointerId;
    state.dragActive = false;
    state.moved = false;
    state.holdCanceled = false;
    setJumpBtnDragState("arming");
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.offsetX = event.clientX - rect.left;
    state.offsetY = event.clientY - rect.top;

    if (state.pressTimer) {
      window.clearTimeout(state.pressTimer);
    }

    state.pressTimer = window.setTimeout(() => {
      if (state.holdCanceled || state.pointerId !== event.pointerId) return;
      state.dragActive = true;
      setJumpBtnDragState("dragging");
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(20);
      }
      if (jumpBtnRef.current) {
        jumpBtnRef.current.setPointerCapture?.(event.pointerId);
      }
    }, 350);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  return (
    <main className="trading-view-shell">
      <header className="trading-nav">
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

      <section className="fullscreen-chart-layout" ref={chartLayoutRef}>
        <div className="floating-symbol-select">
          <div className="symbol-select-wrap">
            <select
              className="symbol-select"
              value={activeSymbol}
              onChange={(event) => setActiveSymbol(event.target.value)}
              aria-label="Choose stock"
            >
              {ACCESSIBLE_STOCKS.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {marketState.error && <div className="overlay-error">{marketState.error}</div>}
        <CandlestickChart
          candles={marketState.candles}
          activeSymbol={activeSymbol}
          activeTimeframe={activeTimeframe}
          jumpToLatestSignal={jumpToLatestSignal}
        />
        <button
          ref={jumpBtnRef}
          className={`jump-latest-btn jump-latest-btn-${jumpBtnDragState}`}
          style={jumpBtnPos ? { left: `${jumpBtnPos.left}px`, top: `${jumpBtnPos.top}px`, right: "auto", bottom: "auto" } : undefined}
          onPointerDown={handleJumpBtnPointerDown}
          onContextMenu={(event) => event.preventDefault()}
          aria-label="Jump to latest candle"
        >
          Latest
        </button>
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
