import { useEffect, useRef } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";

function CandlestickChart({ candles }) {
  const chartContainerRef = useRef();
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

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
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
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

      try {
        seriesRef.current.setData(formattedData);
        // Auto-fit: zoom so all candles are visible on screen
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      } catch (err) {
        console.error("Chart data error:", err);
      }
    }
  }, [candles]);

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
