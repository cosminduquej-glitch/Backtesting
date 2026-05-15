import { useEffect, useMemo, useState, useRef, useCallback } from "react";

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

const makeDragInitState = () => ({
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

function App() {
  const [activeSymbol, setActiveSymbol] = useState("SP500");
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [backtestEnabled, setBacktestEnabled] = useState(false);
  const [backtestFrom, setBacktestFrom] = useState("");
  const [backtestStep, setBacktestStep] = useState(0);

  // --- Refs for the three draggable buttons ---
  const jumpBtnRef = useRef(null);
  const backtestMenuRef = useRef(null);
  const nextCandleRef = useRef(null);
  const chartLayoutRef = useRef(null);

  // --- Drag state refs (one per draggable) ---
  const dragStateRef = useRef(makeDragInitState());
  const menuDragStateRef = useRef(makeDragInitState());
  const nextCandleDragStateRef = useRef(makeDragInitState());
  const backtestMaxStepRef = useRef(0);

  // --- Position and visual drag state for backtest menu & next candle buttons ---
  const [menuBtnPos, setMenuBtnPos] = useState(null);
  const [menuBtnDragState, setMenuBtnDragState] = useState("idle");
  const [nextCandlePos, setNextCandlePos] = useState(null);
  const [nextCandleDragState, setNextCandleDragState] = useState("idle");

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
    setMenuOpen(false);
  }, [activeTimeframe, activeSymbol]);

  useEffect(() => {
    // Only reset backtest completely if the SYMBOL changes.
    // If the timeframe changes, we want to stay in backtest mode.
    setBacktestFrom('');
    setBacktestEnabled(false);
  }, [activeSymbol]);

  useEffect(() => {
    if (!marketState.candles || marketState.candles.length === 0) return;
    const sorted = [...marketState.candles].sort((a, b) => a.timestamp - b.timestamp);
    
    // Default to the last 100 candles for backtesting so there are 50 previous candles to preload.
    const startIdx = Math.max(0, sorted.length - 100);
    const defaultFromDate = new Date(sorted[startIdx].timestamp).toISOString().slice(0, 10);
    
    setBacktestFrom((prev) => prev || defaultFromDate);
  }, [marketState.candles]);

  // Auto-correct backtestFrom if user selects a date older than available data
  useEffect(() => {
    if (!backtestEnabled || !backtestFrom || !marketState.candles || marketState.candles.length === 0) return;
    const sorted = [...marketState.candles].sort((a, b) => a.timestamp - b.timestamp);
    const fromMs = new Date(`${backtestFrom}T00:00:00Z`).getTime();
    
    // If the selected date is older than the very first available candle
    if (fromMs < sorted[0].timestamp) {
      // 50 candles are needed for preload, so the earliest functional start date is index 50
      const oldestValidIdx = Math.min(50, sorted.length - 1);
      const oldestValidDate = new Date(sorted[oldestValidIdx].timestamp).toISOString().slice(0, 10);
      
      // Only set if different to avoid infinite loops
      if (backtestFrom !== oldestValidDate) {
        setBacktestFrom(oldestValidDate);
        addLog(`Requested date too old. Snapping to oldest available: ${oldestValidDate}`, 'warning');
      }
    }
  }, [backtestFrom, backtestEnabled, marketState.candles]);

  // --- Cleanup drag listeners on unmount ---
  useEffect(() => {
    return () => {
      [dragStateRef, menuDragStateRef, nextCandleDragStateRef].forEach((ref) => {
        const state = ref.current;
        if (state.pressTimer) {
          window.clearTimeout(state.pressTimer);
        }
      });
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

  /**
   * Generic factory that returns { onPointerDown, onContextMenu } props for any
   * draggable floating button.  Works identically to the existing "Latest" button
   * drag: long-press (350 ms) arms drag mode, then pointer-move repositions.
   *
   * @param {React.RefObject} elRef        - ref attached to the DOM element
   * @param {React.MutableRefObject} stRef  - ref holding per-button drag state
   * @param {Function} setPos              - state setter for { left, top }
   * @param {Function} setVisualState      - state setter for "idle"/"arming"/"dragging"
   * @param {Function} onTap               - called on short tap (no drag)
   */
  const makeDragHandlers = useCallback((elRef, stRef, setPos, setVisualState, onTap) => {
    const handleMove = (event) => {
      const state = stRef.current;
      if (state.pointerId !== event.pointerId || !elRef.current || !chartLayoutRef.current) return;
      if (!state.dragActive) {
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        if (Math.hypot(dx, dy) > 10) {
          state.holdCanceled = true;
          if (state.pressTimer) { window.clearTimeout(state.pressTimer); state.pressTimer = null; }
          setVisualState("idle");
        }
        return;
      }
      const containerRect = chartLayoutRef.current.getBoundingClientRect();
      const rect = elRef.current.getBoundingClientRect();
      const nextX = event.clientX - containerRect.left - state.offsetX;
      const nextY = event.clientY - containerRect.top - state.offsetY;
      const clamped = clampToContainer(nextX, nextY, rect.width, rect.height);
      setPos({ left: clamped.x, top: clamped.y });
      state.moved = true;
    };

    const handleUp = (event) => {
      const state = stRef.current;
      if (state.pointerId !== event.pointerId) return;
      if (state.pressTimer) { window.clearTimeout(state.pressTimer); state.pressTimer = null; }
      const wasDragging = state.dragActive;
      state.dragActive = false;
      setVisualState("idle");
      state.pointerId = null;
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      if (!wasDragging && !state.moved && !state.holdCanceled && onTap) {
        onTap();
      }
      state.holdCanceled = false;
    };

    const onPointerDown = (event) => {
      if (!elRef.current || !chartLayoutRef.current) return;
      event.preventDefault();
      const state = stRef.current;
      const rect = elRef.current.getBoundingClientRect();
      state.pointerId = event.pointerId;
      state.dragActive = false;
      state.moved = false;
      state.holdCanceled = false;
      setVisualState("arming");
      state.startX = event.clientX;
      state.startY = event.clientY;
      state.offsetX = event.clientX - rect.left;
      state.offsetY = event.clientY - rect.top;
      if (state.pressTimer) window.clearTimeout(state.pressTimer);
      state.pressTimer = window.setTimeout(() => {
        if (state.holdCanceled || state.pointerId !== event.pointerId) return;
        state.dragActive = true;
        setVisualState("dragging");
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(20);
        elRef.current?.setPointerCapture?.(event.pointerId);
      }, 350);
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    };

    return { onPointerDown, onContextMenu: (e) => e.preventDefault() };
  }, []);

  // --- Build drag props for each draggable button ---
  const jumpBtnDragProps = useMemo(
    () => makeDragHandlers(jumpBtnRef, dragStateRef, setJumpBtnPos, setJumpBtnDragState, () => setJumpToLatestSignal((p) => p + 1)),
    [makeDragHandlers]
  );

  const menuBtnDragProps = useMemo(
    () => makeDragHandlers(backtestMenuRef, menuDragStateRef, setMenuBtnPos, setMenuBtnDragState, () => setMenuOpen((p) => !p)),
    [makeDragHandlers]
  );

  const nextCandleDragProps = useMemo(
    () => makeDragHandlers(nextCandleRef, nextCandleDragStateRef, setNextCandlePos, setNextCandleDragState, () => {
      setBacktestStep((prev) => Math.min(prev + 1, backtestMaxStepRef.current));
    }),
    [makeDragHandlers]
  );

  const backtestContext = useMemo(() => {
    if (!backtestEnabled || !marketState.candles || marketState.candles.length === 0) {
      return { baseCandles: [], forwardCandles: [], maxStep: 0 };
    }

    const sorted = [...marketState.candles].sort((a, b) => a.timestamp - b.timestamp);
    const fromMs = backtestFrom ? new Date(`${backtestFrom}T00:00:00Z`).getTime() : Number.NEGATIVE_INFINITY;

    let firstIdx = sorted.findIndex((c) => c.timestamp >= fromMs);
    if (firstIdx === -1) return { baseCandles: [], forwardCandles: [], maxStep: 0 };

    // Force at least 50 candles of preload history if the dataset is large enough.
    // This fixes the 1min timeframe issue where the selected date is often the very first 
    // day of available data, leaving 0 historical candles to preload.
    if (firstIdx < 50 && sorted.length > 50) {
      firstIdx = 50;
    }

    let lastIdx = sorted.length - 1;
    if (lastIdx < firstIdx) return { baseCandles: [], forwardCandles: [], maxStep: 0 };

    // Load extra context before start date so chart does not look empty at start.
    const preloadStart = Math.max(0, firstIdx - 50);
    const baseCandles = sorted.slice(preloadStart, firstIdx + 1);
    const forwardCandles = sorted.slice(firstIdx + 1, lastIdx + 1);

    return {
      baseCandles,
      forwardCandles,
      maxStep: forwardCandles.length,
    };
  }, [backtestEnabled, backtestFrom, marketState.candles]);

  const backtestMaxStep = backtestContext.maxStep;
  backtestMaxStepRef.current = backtestMaxStep;

  useEffect(() => {
    if (!backtestEnabled) return;
    setBacktestStep(0);
    // Jump chart to show the new backtest date range.
    setJumpToLatestSignal((prev) => prev + 1);
  }, [backtestEnabled, backtestFrom, activeSymbol]);

  const lastViewedTimestampRef = useRef(null);

  const pendingSyncTimestampRef = useRef(null);

  useEffect(() => {
    if (activeTimeframe && backtestEnabled) {
      pendingSyncTimestampRef.current = lastViewedTimestampRef.current;
    }
  }, [activeTimeframe, backtestEnabled]);

  // Recalculate backtestStep to maintain the exact chronological time when new candles arrive
  useEffect(() => {
    if (pendingSyncTimestampRef.current && backtestEnabled && backtestContext.forwardCandles.length > 0) {
      let newStep = 0;
      for (let i = 0; i < backtestContext.forwardCandles.length; i++) {
        if (backtestContext.forwardCandles[i].timestamp <= pendingSyncTimestampRef.current) {
          newStep = i + 1;
        } else {
          break;
        }
      }
      setBacktestStep(newStep);
      pendingSyncTimestampRef.current = null;
    }
  }, [backtestContext.forwardCandles, backtestEnabled]);

  const displayedCandles = useMemo(() => {
    if (!backtestEnabled) return marketState.candles;
    if (!backtestContext.baseCandles.length) return [];
    const step = Math.min(backtestStep, backtestMaxStep);
    return [
      ...backtestContext.baseCandles,
      ...backtestContext.forwardCandles.slice(0, step),
    ];
  }, [backtestEnabled, marketState.candles, backtestContext, backtestStep, backtestMaxStep]);

  useEffect(() => {
    if (backtestEnabled && displayedCandles && displayedCandles.length > 0) {
      lastViewedTimestampRef.current = displayedCandles[displayedCandles.length - 1].timestamp;
    }
  }, [displayedCandles, backtestEnabled]);

  // handleNextBacktestCandle is now handled via nextCandleDragProps tap callback.

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
        <div
          className="backtest-menu-wrap"
          ref={backtestMenuRef}
          style={menuBtnPos ? { left: `${menuBtnPos.left}px`, top: `${menuBtnPos.top}px`, bottom: "auto" } : undefined}
        >
          <button
            className={`backtest-menu-btn backtest-menu-btn-${menuBtnDragState}`}
            onPointerDown={menuBtnDragProps.onPointerDown}
            onContextMenu={menuBtnDragProps.onContextMenu}
            aria-label="Backtest menu"
          >
            ...
          </button>
          {menuOpen && (
            <div className="backtest-menu-panel">
              <button
                className={`backtest-option${backtestEnabled ? " backtest-option-active" : ""}`}
                onClick={() => {
                  setBacktestEnabled((prev) => !prev);
                  setMenuOpen(false);
                  setJumpToLatestSignal((prev) => prev + 1);
                }}
              >
                Backtesting
              </button>
            </div>
          )}
        </div>

        {backtestEnabled && (
          <div className="backtest-range-panel">
            <label>
              Von
              <input
                type="date"
                value={backtestFrom}
                onChange={(e) => setBacktestFrom(e.target.value)}
              />
            </label>
          </div>
        )}

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
          candles={displayedCandles}
          activeSymbol={activeSymbol}
          activeTimeframe={activeTimeframe}
          jumpToLatestSignal={jumpToLatestSignal}
        />
        <button
          ref={jumpBtnRef}
          className={`jump-latest-btn jump-latest-btn-${jumpBtnDragState}`}
          style={jumpBtnPos ? { left: `${jumpBtnPos.left}px`, top: `${jumpBtnPos.top}px`, right: "auto", bottom: "auto" } : undefined}
          onPointerDown={jumpBtnDragProps.onPointerDown}
          onContextMenu={jumpBtnDragProps.onContextMenu}
          aria-label="Jump to latest candle"
        >
          Latest
        </button>

        {backtestEnabled && backtestContext.baseCandles.length > 0 && (
          <button
            ref={nextCandleRef}
            className={`backtest-next-btn backtest-next-btn-${nextCandleDragState}`}
            style={nextCandlePos ? { left: `${nextCandlePos.left}px`, top: `${nextCandlePos.top}px`, right: "auto", bottom: "auto" } : undefined}
            onPointerDown={nextCandleDragProps.onPointerDown}
            onContextMenu={nextCandleDragProps.onContextMenu}
            disabled={backtestStep >= backtestMaxStep}
            aria-label="Nächste Kerze"
          >
            →
          </button>
        )}
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
