import { useEffect, useState } from "react";

const CHART_WIDTH = 920;
const CHART_HEIGHT = 420;
const PADDING = { top: 24, right: 64, bottom: 38, left: 20 };

function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateLabel(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function buildPriceLevels(minLow, maxHigh) {
  const steps = 5;
  const span = maxHigh - minLow || 1;

  return Array.from({ length: steps }, (_, index) => maxHigh - (span / (steps - 1)) * index);
}

function CandlestickChart({ candles }) {
  const [activeIndex, setActiveIndex] = useState(candles.length ? candles.length - 1 : 0);

  useEffect(() => {
    if (candles.length) {
      setActiveIndex(candles.length - 1);
    }
  }, [candles]);

  if (!candles.length) {
    return (
      <div className="chart-empty">
        <strong>No candle data yet</strong>
        <p>Add your Finnhub and Alpha Vantage keys to load the chart.</p>
      </div>
    );
  }

  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  const priceRange = maxHigh - minLow || 1;
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const slotWidth = plotWidth / candles.length;
  const bodyWidth = Math.max(4, slotWidth * 0.56);
  const selectedCandle = candles[activeIndex] || candles[candles.length - 1];
  const priceLevels = buildPriceLevels(minLow, maxHigh);

  const getY = (price) => {
    const normalized = (price - minLow) / priceRange;
    return PADDING.top + plotHeight - normalized * plotHeight;
  };

  return (
    <div className="chart-shell">
      <div className="chart-summary">
        <div>
          <span className="chart-meta-label">Selected candle</span>
          <strong>{formatDateTime(selectedCandle.timestamp)}</strong>
        </div>
        <div className="ohlc-grid">
          <div>
            <span>O</span>
            <strong>{formatPrice(selectedCandle.open)}</strong>
          </div>
          <div>
            <span>H</span>
            <strong>{formatPrice(selectedCandle.high)}</strong>
          </div>
          <div>
            <span>L</span>
            <strong>{formatPrice(selectedCandle.low)}</strong>
          </div>
          <div>
            <span>C</span>
            <strong>{formatPrice(selectedCandle.close)}</strong>
          </div>
        </div>
      </div>

      <svg
        className="chart-svg"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label="Candlestick chart"
      >
        {priceLevels.map((level) => {
          const y = getY(level);

          return (
            <g key={level}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={CHART_WIDTH - PADDING.right}
                y2={y}
                className="chart-grid-line"
              />
              <text
                x={CHART_WIDTH - PADDING.right + 10}
                y={y + 4}
                className="chart-axis-label"
              >
                {formatPrice(level)}
              </text>
            </g>
          );
        })}

        {candles.map((candle, index) => {
          const xCenter = PADDING.left + index * slotWidth + slotWidth / 2;
          const openY = getY(candle.open);
          const closeY = getY(candle.close);
          const highY = getY(candle.high);
          const lowY = getY(candle.low);
          const isBullish = candle.close >= candle.open;
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(2, Math.abs(closeY - openY));
          const isActive = index === activeIndex;

          return (
            <g
              key={`${candle.timestamp}-${index}`}
              onMouseEnter={() => setActiveIndex(index)}
              onFocus={() => setActiveIndex(index)}
              tabIndex={0}
              className="chart-candle-group"
            >
              {isActive ? (
                <rect
                  x={xCenter - slotWidth / 2}
                  y={PADDING.top}
                  width={slotWidth}
                  height={plotHeight}
                  className="chart-active-column"
                />
              ) : null}
              <line
                x1={xCenter}
                y1={highY}
                x2={xCenter}
                y2={lowY}
                className={`chart-wick ${isBullish ? "bullish" : "bearish"}`}
              />
              <rect
                x={xCenter - bodyWidth / 2}
                y={bodyY}
                width={bodyWidth}
                height={bodyHeight}
                rx="2"
                className={`chart-body ${isBullish ? "bullish" : "bearish"} ${isActive ? "active" : ""}`}
              />
            </g>
          );
        })}

        {candles
          .filter((_, index) => index % Math.max(1, Math.ceil(candles.length / 6)) === 0)
          .map((candle, index) => {
            const originalIndex = candles.findIndex((entry) => entry.timestamp === candle.timestamp);
            const x = PADDING.left + originalIndex * slotWidth + slotWidth / 2;

            return (
              <text
                key={`${candle.timestamp}-label-${index}`}
                x={x}
                y={CHART_HEIGHT - 10}
                textAnchor="middle"
                className="chart-axis-label"
              >
                {formatDateLabel(candle.timestamp)}
              </text>
            );
          })}
      </svg>
    </div>
  );
}

export default CandlestickChart;
