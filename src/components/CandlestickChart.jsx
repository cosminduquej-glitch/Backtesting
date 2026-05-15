import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";

function CandlestickChart({ candles, activeSymbol, activeTimeframe, jumpToLatestSignal }) {
  const chartContainerRef = useRef();
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const pendingJumpRef = useRef([]);
  const latestDataRef = useRef([]);
  const consumedJumpSignalRef = useRef(-1);
  const savedTimeRangeRef = useRef(null);

  function clearPendingJumps() {
    for (const handle of pendingJumpRef.current) {
      if (handle.type === "raf") window.cancelAnimationFrame(handle.id);
      if (handle.type === "timeout") window.clearTimeout(handle.id);
    }
    pendingJumpRef.current = [];
  }

  function jumpToLatestCandles() {
    const chart = chartRef.current;
    const data = latestDataRef.current;
    const series = seriesRef.current;
    if (!chart || !data || data.length === 0) return;

    const barsToShow = Math.min(data.length, 30);
    const firstVisibleLogical = Math.max(0, data.length - barsToShow);
    const lastLogical = Math.max(0, data.length - 1);
    const fromTime = data[firstVisibleLogical].time;
    const toTime = data[lastLogical].time;

    const timeScale = chart.timeScale();
    const rightScale = chart.priceScale("right");

    // Reset vertical price zoom so latest candles are at correct visible height.
    rightScale.applyOptions({
      autoScale: true,
      scaleMargins: { top: 0.12, bottom: 0.12 },
    });
    if (series?.priceScale) {
      series.priceScale().applyOptions({
        autoScale: true,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      });
    }

    timeScale.setVisibleLogicalRange({ from: firstVisibleLogical, to: lastLogical + 1 });
    timeScale.setVisibleRange({ from: fromTime, to: toTime });
    timeScale.scrollToRealTime();

    // Fit once, then keep manual vertical control unlocked.
    const unlockVertical = () => {
      rightScale.applyOptions({
        autoScale: false,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      });
      if (series?.priceScale) {
        series.priceScale().applyOptions({
          autoScale: false,
          scaleMargins: { top: 0.12, bottom: 0.12 },
        });
      }
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(unlockVertical));
  }

  function scheduleJumpToLatest() {
    clearPendingJumps();
    jumpToLatestCandles();

    const raf1 = window.requestAnimationFrame(() => jumpToLatestCandles());
    const raf2 = window.requestAnimationFrame(() => {
      const nested = window.requestAnimationFrame(() => jumpToLatestCandles());
      pendingJumpRef.current.push({ type: "raf", id: nested });
    });
    const t1 = window.setTimeout(() => jumpToLatestCandles(), 120);

    pendingJumpRef.current.push({ type: "raf", id: raf1 });
    pendingJumpRef.current.push({ type: "raf", id: raf2 });
    pendingJumpRef.current.push({ type: "timeout", id: t1 });
  }

  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartRef.current = createChart(chartContainerRef.current, {
      layout: {
        background: { type: "solid", color: "#131722" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "rgba(42, 46, 57, 0.5)" },
        horzLines: { color: "rgba(42, 46, 57, 0.5)" },
      },
      width: chartContainerRef.current.clientWidth || 800,
      height: chartContainerRef.current.clientHeight || 600,
      autoSize: true,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 10,
        minBarSpacing: 0.05,
        shiftVisibleRangeOnNewBar: true,
      },
      kineticScroll: {
        touch: true,
        mouse: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      rightPriceScale: {
        autoScale: true,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      crosshair: {
        mode: 1, 
        vertLine: { width: 1, color: "#787b86", style: 0 },
        horzLine: { width: 1, color: "#787b86", style: 0 },
      },
    });

    seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor: "#089981", // Standard tradingview green
      downColor: "#f23645", // Standard tradingview red
      borderVisible: false,
      wickUpColor: "#089981",
      wickDownColor: "#f23645",
    });

    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) {
        return;
      }
      const newRect = entries[0].contentRect;
      chartRef.current.applyOptions({ 
        width: newRect.width, 
        height: newRect.height 
      });
      // Keep latest candles visible after resize/orientation/layout changes.
      scheduleJumpToLatest();
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      clearPendingJumps();
      resizeObserver.disconnect();
      chartRef.current.remove();
    };
  }, []);

  useEffect(() => {
    if (seriesRef.current && candles && candles.length > 0) {
      const formattedData = candles
        .map((c) => ({
          time: Math.floor(c.timestamp / 1000), // convert ms to seconds
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
        .sort((a, b) => a.time - b.time); // strict ascending time order

      // Snapshot the current visible time range and data length before setData.
      const timeScale = chartRef.current?.timeScale();
      let prevLogicalRange = null;
      try {
        prevLogicalRange = timeScale?.getVisibleLogicalRange();
      } catch (_) { /* chart not ready */ }
      const prevDataLen = latestDataRef.current.length;

      try {
        seriesRef.current.setData(formattedData);
        latestDataRef.current = formattedData;
        // Only force-jump when explicitly requested (symbol/timeframe change or Latest button).
        if (jumpToLatestSignal !== consumedJumpSignalRef.current) {
          scheduleJumpToLatest();
          consumedJumpSignalRef.current = jumpToLatestSignal;
        } else {
          const candlesAdded = formattedData.length - prevDataLen;

          if (prevLogicalRange && timeScale && candlesAdded > 0) {
            // Scroll forward by the number of new candles so the view follows the action.
            timeScale.setVisibleLogicalRange({
              from: prevLogicalRange.from + candlesAdded,
              to: prevLogicalRange.to + candlesAdded,
            });
          } else if (prevLogicalRange && timeScale) {
            // No new candles — restore the exact same visible window.
            timeScale.setVisibleLogicalRange(prevLogicalRange);
          } else if (savedTimeRangeRef.current && timeScale) {
            timeScale.setVisibleLogicalRange(savedTimeRangeRef.current);
          }
          
          // Keep user-controlled vertical scale stable when new candles are revealed.
          const rightScale = chartRef.current?.priceScale("right");
          rightScale?.applyOptions({
            autoScale: false,
            scaleMargins: { top: 0.12, bottom: 0.12 },
          });
          seriesRef.current?.priceScale?.().applyOptions({
            autoScale: false,
            scaleMargins: { top: 0.12, bottom: 0.12 },
          });
        }
      } catch (err) {
        console.error("Chart data error:", err);
      }
    }
  }, [candles, activeSymbol, activeTimeframe, jumpToLatestSignal]);

  useEffect(() => {
    if (latestDataRef.current && latestDataRef.current.length > 0) {
      if (jumpToLatestSignal !== consumedJumpSignalRef.current) {
        scheduleJumpToLatest();
        consumedJumpSignalRef.current = jumpToLatestSignal;
      }
    }
  }, [jumpToLatestSignal]);

  // Continuously track the visible logical range so we can restore it after setData.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const timeScale = chart.timeScale();
    const handler = () => {
      try {
        const lr = timeScale.getVisibleLogicalRange();
        if (lr) savedTimeRangeRef.current = lr;
      } catch (_) { /* ignore */ }
    };
    timeScale.subscribeVisibleLogicalRangeChange(handler);
    return () => {
      try { timeScale.unsubscribeVisibleLogicalRangeChange(handler); } catch (_) {}
    };
  }, []);

  return (
    <div className="chart-shell">
      {/* We use position absolute so it stretches across the entire screen shell layout */}
      <div 
        ref={chartContainerRef} 
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} 
      />
      {(!candles || candles.length === 0) && (
        <div className="chart-empty" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
          <strong>No candle data yet</strong>
          <p>Connecting to market data...</p>
        </div>
      )}
    </div>
  );
}

export default CandlestickChart;
