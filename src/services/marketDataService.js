import { CapacitorHttp, Capacitor } from '@capacitor/core';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CACHE_PREFIX = 'market_candles_v2:';

const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

// ── Symbol alias map ─────────────────────────────────────────────────────────
// Common trading names → Yahoo Finance ticker
const SYMBOL_ALIASES = {
  'US100':   'NQ=F',     // Nasdaq 100 futures
  'NAS100':  'NQ=F',
  'NASDAQ':  '^IXIC',    // Nasdaq Composite index
  'NASDAQ100': 'NQ=F',
  'US30':    'YM=F',     // Dow Jones futures
  'DOW':     '^DJI',     // Dow Jones index
  'US500':   'ES=F',     // S&P 500 futures
  'SP500F':  'ES=F',     // S&P 500 futures
  'SP500':   '^GSPC',    // S&P 500 index
  'GOLD':    'GC=F',     // Gold futures
  'XAUUSD':  'GC=F',
  'SILVER':  'SI=F',     // Silver futures
  'XAGUSD':  'SI=F',
  'OIL':     'CL=F',     // Crude oil futures
  'CRUDE':   'CL=F',
  'EURUSD':  'EURUSD=X',
  'GBPUSD':  'GBPUSD=X',
  'USDJPY':  'USDJPY=X',
  'BTCUSD':  'BTC-USD',
  'BTC':     'BTC-USD',
  'ETHUSD':  'ETH-USD',
  'ETH':     'ETH-USD',
  'VIX':     '^VIX',
  'DXY':     'DX-Y.NYB', // Dollar index
};

function resolveSymbol(input) {
  const upper = input.trim().toUpperCase();
  return SYMBOL_ALIASES[upper] || upper;
}

// ── Timeframe configs ────────────────────────────────────────────────────────
// Each timeframe maps to Yahoo interval + range values

export const TIMEFRAMES = [
  { id: '1m',  label: '1m',  yahooInterval: '1m',  yahooRange: '1d',  finnhubRes: '1'  },
  { id: '5m',  label: '5m',  yahooInterval: '5m',  yahooRange: '5d',  finnhubRes: '5'  },
  { id: '15m', label: '15m', yahooInterval: '15m', yahooRange: '5d',  finnhubRes: '15' },
  { id: '30m', label: '30m', yahooInterval: '30m', yahooRange: '1mo', finnhubRes: '30' },
  { id: '1h',  label: '1H',  yahooInterval: '1h',  yahooRange: '1y',  finnhubRes: '60' },
  { id: '4h',  label: '4H',  yahooInterval: '1h',  yahooRange: '2y',  finnhubRes: '240' },
  { id: '1d',  label: '1D',  yahooInterval: '1d',  yahooRange: 'max', finnhubRes: 'D'  },
  { id: '1wk', label: '1W',  yahooInterval: '1wk', yahooRange: 'max', finnhubRes: 'W'  },
];

function getTimeframeConfig(timeframeId) {
  return TIMEFRAMES.find(t => t.id === timeframeId) || TIMEFRAMES[4]; // default 1D
}

function getDaysFromYahooRange(rangeStr) {
  if (!rangeStr) return 90;
  if (rangeStr === '1d') return 1;
  if (rangeStr === '5d') return 5;
  if (rangeStr.endsWith('mo')) {
    const months = parseInt(rangeStr.replace('mo', ''), 10) || 1;
    return months * 30;
  }
  if (rangeStr.endsWith('y')) {
    const years = parseInt(rangeStr.replace('y', ''), 10) || 1;
    return years * 365;
  }
  if (rangeStr === 'max') return 365 * 200;
  return 90;
}

function getCacheKey(symbol, timeframeId) {
  return `${CACHE_PREFIX}${symbol.trim().toUpperCase()}:${timeframeId}`;
}

export function getCachedCandles(symbol, timeframeId = '1d') {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const key = getCacheKey(symbol, timeframeId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.candles)) return null;
    parsed.ageMs = Date.now() - (parsed.timestamp || 0);
    parsed.stale = parsed.ageMs > CACHE_TTL_MS;
    return parsed;
  } catch (e) {
    return null;
  }
}

function setCachedCandles(symbol, timeframeId, result) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const key = getCacheKey(symbol, timeframeId);
    const payload = {
      timestamp: Date.now(),
      candles: result.candles,
      source: result.source,
      sourceLabel: result.sourceLabel,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    // ignore cache failures
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function httpGetJson(url, headers = {}) {
  const finalHeaders = {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json',
    ...headers,
  };

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url, headers: finalHeaders });
    if (response.status < 200 || response.status >= 300) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } else {
    const response = await fetch(url, { headers: finalHeaders });
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return await response.json();
  }
}

async function httpGetText(url, headers = {}) {
  const finalHeaders = {
    'User-Agent': BROWSER_UA,
    ...headers,
  };

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url, headers: finalHeaders });
    if (response.status < 200 || response.status >= 300) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  } else {
    const response = await fetch(url, { headers: finalHeaders });
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return await response.text();
  }
}

// ── Shared Yahoo parser ───────────────────────────────────────────────────────

function parseYahooChart(payload, symbol, sourceId, sourceLabel) {
  const result = payload?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
    throw new Error(`No candle data from ${sourceLabel}`);
  }

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quote.open[i] != null && quote.high[i] != null && quote.low[i] != null && quote.close[i] != null) {
      candles.push({
        timestamp: timestamps[i] * 1000,
        open: Number(quote.open[i]),
        high: Number(quote.high[i]),
        low: Number(quote.low[i]),
        close: Number(quote.close[i]),
      });
    }
  }
  if (!candles.length) throw new Error(`Empty candle array from ${sourceLabel}`);
  candles.sort((a, b) => a.timestamp - b.timestamp);

  return { symbol, source: sourceId, sourceLabel, candles, nextRecommendedRefreshMs: 60_000 };
}

// ── Provider: Yahoo Finance query1 ───────────────────────────────────────────

async function fetchYahooQ1(symbol, tf) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${tf.yahooInterval}&range=${tf.yahooRange}`;
  const payload = await httpGetJson(url);
  return parseYahooChart(payload, symbol, 'yahoo-q1', 'Yahoo (q1)');
}

// ── Provider: Yahoo Finance query2 ───────────────────────────────────────────

async function fetchYahooQ2(symbol, tf) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${tf.yahooInterval}&range=${tf.yahooRange}`;
  const payload = await httpGetJson(url);
  return parseYahooChart(payload, symbol, 'yahoo-q2', 'Yahoo (q2)');
}

// ── Provider: Yahoo via allorigins proxy (bypasses IP rate limits) ────────────

async function fetchYahooProxied(symbol, tf) {
  const target = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${tf.yahooInterval}&range=${tf.yahooRange}`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`;
  const payload = await httpGetJson(proxyUrl);
  return parseYahooChart(payload, symbol, 'yahoo-proxy', 'Yahoo (proxy)');
}

// ── Provider: Finnhub ─────────────────────────────────────────────────────────

async function fetchFromFinnhub(symbol, tf) {
  const token = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!token) throw new Error('Missing FINNHUB API key');

  const to = Math.floor(Date.now() / 1000);
  const days = getDaysFromYahooRange(tf.yahooRange);
  const from = to - Math.max(1, days) * 24 * 60 * 60;

  const endpoint = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${tf.finnhubRes}&from=${from}&to=${to}&token=${encodeURIComponent(token)}`;
  const payload = await httpGetJson(endpoint);

  if (!payload || payload.s !== 'ok' || !Array.isArray(payload.t) || payload.t.length === 0) {
    throw new Error('No finnhub candle data');
  }

  const candles = [];
  for (let i = 0; i < payload.t.length; i++) {
    if ([payload.o[i], payload.h[i], payload.l[i], payload.c[i]].some(v => v === null || v === undefined)) continue;
    candles.push({
      timestamp: payload.t[i] * 1000,
      open: Number(payload.o[i]),
      high: Number(payload.h[i]),
      low: Number(payload.l[i]),
      close: Number(payload.c[i]),
    });
  }

  if (!candles.length) throw new Error('No valid finnhub candles');
  candles.sort((a, b) => a.timestamp - b.timestamp);

  return { symbol, source: 'finnhub', sourceLabel: 'Finnhub', candles, nextRecommendedRefreshMs: 60_000 };
}

// ── Provider: Alpha Vantage ───────────────────────────────────────────────────

async function fetchFromAlphaVantage(symbol, tf) {
  const key = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error('Missing Alpha Vantage API key');

  // Alpha Vantage only supports daily for free tier
  if (tf.yahooInterval !== '1d' && tf.yahooInterval !== '1wk') {
    throw new Error('Alpha Vantage free tier only supports daily');
  }

  const endpoint = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${encodeURIComponent(key)}`;
  const payload = await httpGetJson(endpoint);

  const series = payload && (payload['Time Series (Daily)'] || payload['Time Series Daily']);
  if (!series || typeof series !== 'object') {
    throw new Error('No Alpha Vantage time series returned');
  }

  const days = getDaysFromYahooRange(tf.yahooRange);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const dates = Object.keys(series).sort((a, b) => new Date(a) - new Date(b));
  const candles = [];
  for (const date of dates) {
    const row = series[date];
    if (!row) continue;
    const ts = new Date(date + 'T16:00:00Z').getTime();
    if (ts < cutoff) continue;
    const open = Number(row['1. open']);
    const high = Number(row['2. high']);
    const low = Number(row['3. low']);
    const close = Number(row['4. close']);
    if ([open, high, low, close].some(v => Number.isNaN(v))) continue;
    candles.push({ timestamp: ts, open, high, low, close });
  }

  if (!candles.length) throw new Error('No valid Alpha Vantage candles');

  return { symbol, source: 'alphavantage', sourceLabel: 'Alpha Vantage', candles, nextRecommendedRefreshMs: 60_000 };
}

// ── Provider: Stooq ───────────────────────────────────────────────────────────

async function fetchFromStooq(symbol, tf) {
  // Stooq only supports daily
  if (tf.yahooInterval !== '1d' && tf.yahooInterval !== '1wk') {
    throw new Error('Stooq only supports daily data');
  }

  let s = symbol.toLowerCase();
  if (!s.includes('.')) s = `${s}.us`;
  const endpoint = `https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`;
  const text = await httpGetText(endpoint, { Accept: 'text/csv' });
  if (!text || !text.trim()) throw new Error('No data from Stooq');

  if (/get your apikey/i.test(text) || /enter the captcha/i.test(text) || text.trim().toLowerCase().startsWith('<!doctype html')) {
    throw new Error('Stooq requires API key (no-key endpoints removed)');
  }

  const lines = text.trim().split('\n');
  if (lines.length <= 1) throw new Error('No CSV rows from Stooq');

  const header = lines.shift().split(',').map(h => h.trim().toLowerCase());
  const dateIdx = header.indexOf('date');
  const openIdx = header.indexOf('open');
  const highIdx = header.indexOf('high');
  const lowIdx = header.indexOf('low');
  const closeIdx = header.indexOf('close');

  const days = getDaysFromYahooRange(tf.yahooRange);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const candles = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(',');
    const date = cols[dateIdx];
    const ts = new Date(date + 'T00:00:00Z').getTime();
    if (ts < cutoff) continue;
    const open = Number(cols[openIdx]);
    const high = Number(cols[highIdx]);
    const low = Number(cols[lowIdx]);
    const close = Number(cols[closeIdx]);
    if ([open, high, low, close].some(v => Number.isNaN(v))) continue;
    candles.push({ timestamp: ts, open, high, low, close });
  }

  if (!candles.length) throw new Error('No valid Stooq candles');
  candles.sort((a, b) => a.timestamp - b.timestamp);

  return { symbol, source: 'stooq', sourceLabel: 'Stooq', candles, nextRecommendedRefreshMs: 60_000 };
}

// ── Main fetch with failover ─────────────────────────────────────────────────

export async function fetchCandlesWithFailover(symbol, timeframeId = '1d') {
  const inputSymbol = symbol.trim().toUpperCase();
  const resolvedSymbol = resolveSymbol(inputSymbol);
  const tf = getTimeframeConfig(timeframeId);

  if (!inputSymbol) throw new Error('Please enter a symbol');

  // Provider priority: free no-key Yahoo first, then paid APIs, then Stooq
  const providers = [
    { name: 'yahoo-q1',    fn: fetchYahooQ1 },
    { name: 'yahoo-q2',    fn: fetchYahooQ2 },
    { name: 'yahoo-proxy', fn: fetchYahooProxied },
  ];

  // Keyed APIs in the middle (they may be rate-limited / expired)
  if (import.meta.env.VITE_FINNHUB_API_KEY) providers.push({ name: 'finnhub', fn: fetchFromFinnhub });
  if (import.meta.env.VITE_ALPHA_VANTAGE_API_KEY) providers.push({ name: 'alphavantage', fn: fetchFromAlphaVantage });

  providers.push({ name: 'stooq', fn: fetchFromStooq });

  const attempts = [];

  for (const provider of providers) {
    try {
      const result = await provider.fn(resolvedSymbol, tf);
      if (result && Array.isArray(result.candles) && result.candles.length) {
        // Store using the user's original symbol for cache lookup
        result.symbol = inputSymbol;
        result.resolvedSymbol = resolvedSymbol;
        try { setCachedCandles(inputSymbol, timeframeId, result); } catch (e) {}
        return result;
      }
    } catch (err) {
      const message = (err && err.message) ? err.message : String(err);
      attempts.push({ provider: provider.name, message, status: err && err.status });
      // eslint-disable-next-line no-console
      console.warn('Market data provider failed:', provider.name, message);
    }
  }

  const detail = attempts.map(a => `${a.provider}:${a.message}`).join('; ');
  const err = new Error(`All market data providers failed: ${detail}`);
  const has429 = attempts.some(a => a.status === 429 || (a.message && a.message.includes('429')) || (a.message && /too many requests/i.test(a.message)));
  err.nextRecommendedRefreshMs = has429 ? 15 * 60 * 1000 : 60 * 1000;
  err.attempts = attempts;
  throw err;
}
