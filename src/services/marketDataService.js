const FINNHUB_ENDPOINT = "https://finnhub.io/api/v1/stock/candle";
const ALPHA_VANTAGE_ENDPOINT = "https://www.alphavantage.co/query";
const ALPHA_USAGE_KEY = "droidcore.alphaVantage.usage";
const ALPHA_CACHE_PREFIX = "droidcore.alphaVantage.cache";
const ALPHA_DAILY_LIMIT = 25;
const ALPHA_REFRESH_MS = Math.ceil((24 * 60 * 60 * 1000) / ALPHA_DAILY_LIMIT);

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readLocalStorage(key) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(key);
}

function writeLocalStorage(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, value);
}

function getRangeConfig(range) {
  const configs = {
    "1M": { label: "1M", days: 31 },
    "3M": { label: "3M", days: 92 },
    "6M": { label: "6M", days: 184 },
    "1Y": { label: "1Y", days: 366 },
  };

  return configs[range] || configs["3M"];
}

function normalizeCandle(candle) {
  return {
    timestamp: candle.timestamp,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  };
}

function sortCandles(candles) {
  return candles.sort((left, right) => left.timestamp - right.timestamp);
}

export function getAlphaVantageQuotaStatus() {
  const today = getTodayKey();
  const saved = safeParse(readLocalStorage(ALPHA_USAGE_KEY));

  if (!saved || saved.day !== today) {
    const reset = {
      day: today,
      count: 0,
      remaining: ALPHA_DAILY_LIMIT,
    };

    writeLocalStorage(ALPHA_USAGE_KEY, JSON.stringify(reset));
    return reset;
  }

  return {
    day: today,
    count: saved.count,
    remaining: Math.max(0, ALPHA_DAILY_LIMIT - saved.count),
  };
}

function consumeAlphaVantageRequest() {
  const status = getAlphaVantageQuotaStatus();
  const next = {
    day: status.day,
    count: status.count + 1,
    remaining: Math.max(0, ALPHA_DAILY_LIMIT - (status.count + 1)),
  };

  writeLocalStorage(ALPHA_USAGE_KEY, JSON.stringify(next));
  return next;
}

function getAlphaCacheKey(symbol, rangeLabel) {
  return `${ALPHA_CACHE_PREFIX}.${symbol}.${rangeLabel}`;
}

function getAlphaCachedPayload(symbol, rangeLabel) {
  const cached = safeParse(readLocalStorage(getAlphaCacheKey(symbol, rangeLabel)));

  if (!cached || !cached.candles || !cached.cachedAt) {
    return null;
  }

  return cached;
}

function setAlphaCachedPayload(symbol, rangeLabel, candles) {
  writeLocalStorage(
    getAlphaCacheKey(symbol, rangeLabel),
    JSON.stringify({
      cachedAt: Date.now(),
      candles,
    }),
  );
}

function buildFinnhubUrl(symbol, rangeConfig, apiKey) {
  const to = Math.floor(Date.now() / 1000);
  const from = to - rangeConfig.days * 24 * 60 * 60;
  const params = new URLSearchParams({
    symbol,
    resolution: "D",
    from: String(from),
    to: String(to),
    token: apiKey,
  });

  return `${FINNHUB_ENDPOINT}?${params.toString()}`;
}

async function fetchFinnhubCandles(symbol, rangeConfig, apiKey) {
  const response = await fetch(buildFinnhubUrl(symbol, rangeConfig, apiKey));

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (payload.s !== "ok" || !Array.isArray(payload.t) || !payload.t.length) {
    throw new Error("No candle data returned");
  }

  const candles = payload.t.map((timestamp, index) =>
    normalizeCandle({
      timestamp: timestamp * 1000,
      open: payload.o[index],
      high: payload.h[index],
      low: payload.l[index],
      close: payload.c[index],
    }),
  );

  return sortCandles(candles);
}

function buildAlphaVantageUrl(symbol, apiKey) {
  const params = new URLSearchParams({
    function: "TIME_SERIES_DAILY",
    symbol,
    apikey: apiKey,
  });

  return `${ALPHA_VANTAGE_ENDPOINT}?${params.toString()}`;
}

async function fetchAlphaVantageCandles(symbol, rangeConfig, apiKey) {
  const cached = getAlphaCachedPayload(symbol, rangeConfig.label);

  if (cached && Date.now() - cached.cachedAt < ALPHA_REFRESH_MS) {
    return {
      candles: cached.candles,
      cached: true,
      nextRecommendedRefreshMs: ALPHA_REFRESH_MS - (Date.now() - cached.cachedAt),
      quota: getAlphaVantageQuotaStatus(),
    };
  }

  const status = getAlphaVantageQuotaStatus();

  if (status.remaining <= 0) {
    if (cached) {
      return {
        candles: cached.candles,
        cached: true,
        nextRecommendedRefreshMs: ALPHA_REFRESH_MS,
        quota: status,
      };
    }

    throw new Error("Daily fallback quota exhausted");
  }

  const response = await fetch(buildAlphaVantageUrl(symbol, apiKey));

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const series = payload["Time Series (Daily)"];

  if (!series) {
    throw new Error(payload.Note || payload["Error Message"] || "Alpha Vantage returned no daily series");
  }

  const candles = Object.entries(series)
    .map(([date, values]) =>
      normalizeCandle({
        timestamp: new Date(`${date}T00:00:00Z`).getTime(),
        open: values["1. open"],
        high: values["2. high"],
        low: values["3. low"],
        close: values["4. close"],
      }),
    )
    .filter((candle) => candle.timestamp >= Date.now() - rangeConfig.days * 24 * 60 * 60 * 1000);

  if (!candles.length) {
    throw new Error("No candles within requested range");
  }

  const sortedCandles = sortCandles(candles);
  const nextQuota = consumeAlphaVantageRequest();

  setAlphaCachedPayload(symbol, rangeConfig.label, sortedCandles);

  return {
    candles: sortedCandles,
    cached: false,
    nextRecommendedRefreshMs: ALPHA_REFRESH_MS,
    quota: nextQuota,
  };
}

export async function fetchCandlesWithFailover(symbol, range = "3M") {
  const cleanedSymbol = symbol.trim().toUpperCase();
  const rangeConfig = getRangeConfig(range);
  const finnhubKey = import.meta.env.VITE_FINNHUB_API_KEY;
  const alphaKey = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY;
  let finnhubError = null;

  if (!cleanedSymbol) {
    throw new Error("Please enter a symbol");
  }

  if (finnhubKey) {
    try {
      const candles = await fetchFinnhubCandles(cleanedSymbol, rangeConfig, finnhubKey);

      return {
        symbol: cleanedSymbol,
        source: "finnhub",
        sourceLabel: "Finnhub",
        candles,
        nextRecommendedRefreshMs: 60 * 1000,
        quota: getAlphaVantageQuotaStatus(),
      };
    } catch (error) {
      finnhubError = error;
    }
  } else {
    finnhubError = new Error("Finnhub API key missing");
  }

  if (!alphaKey) {
    throw new Error(
      `Finnhub unavailable: ${finnhubError?.message || "missing API key"}. Add VITE_ALPHA_VANTAGE_API_KEY for fallback.`,
    );
  }

  const alphaResponse = await fetchAlphaVantageCandles(cleanedSymbol, rangeConfig, alphaKey);

  return {
    symbol: cleanedSymbol,
    source: "alpha_vantage",
    sourceLabel: alphaResponse.cached ? "Alpha Vantage cached fallback" : "Alpha Vantage fallback",
    candles: alphaResponse.candles,
    nextRecommendedRefreshMs: alphaResponse.nextRecommendedRefreshMs,
    quota: alphaResponse.quota,
    fallbackReason: finnhubError?.message || "Finnhub unavailable",
    isFallbackCached: alphaResponse.cached,
  };
}
