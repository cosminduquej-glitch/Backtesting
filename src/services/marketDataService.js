import { CapacitorHttp, Capacitor } from '@capacitor/core';

function getRangeConfig(range) {
  const configs = {
    "1M": { rangeStr: "1mo", intervalStr: "1d" },
    "3M": { rangeStr: "3mo", intervalStr: "1d" },
    "6M": { rangeStr: "6mo", intervalStr: "1d" },
    "1Y": { rangeStr: "1y", intervalStr: "1d" },
  };

  return configs[range] || configs["3M"];
}

function getDaysFromRange(rangeStr) {
  if (!rangeStr) return 90;
  if (rangeStr.endsWith('mo')) {
    const months = parseInt(rangeStr.replace('mo', ''), 10) || 1;
    return months * 30;
  }
  if (rangeStr.endsWith('y')) {
    const years = parseInt(rangeStr.replace('y', ''), 10) || 1;
    return years * 365;
  }
  return 90;
}

async function httpGetJson(url, headers = {}) {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url, headers });
    if (response.status < 200 || response.status >= 300) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  } else {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  }
}

async function httpGetText(url, headers = {}) {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url, headers });
    if (response.status < 200 || response.status >= 300) {
      const err = new Error(`HTTP ${response.status}`);
      err.status = response.status;
      throw err;
    }
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  } else {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  }
}

async function fetchFromFinnhub(symbol, rangeConfig) {
  const token = import.meta.env.VITE_FINNHUB_API_KEY;
  if (!token) throw new Error('Missing FINNHUB API key');

  // map 1d -> D for finnhub
  const resolution = rangeConfig.intervalStr === '1d' ? 'D' : rangeConfig.intervalStr;
  const to = Math.floor(Date.now() / 1000);
  const days = getDaysFromRange(rangeConfig.rangeStr);
  const from = to - Math.max(1, days) * 24 * 60 * 60;

  const endpoint = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}&token=${encodeURIComponent(token)}`;

  const payload = await httpGetJson(endpoint, { Accept: 'application/json' });

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

  return {
    symbol,
    source: 'finnhub',
    sourceLabel: 'Finnhub',
    candles,
    nextRecommendedRefreshMs: 60 * 1000,
  };
}

async function fetchFromAlphaVantage(symbol, rangeConfig) {
  const key = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error('Missing Alpha Vantage API key');

  const endpoint = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${encodeURIComponent(key)}`;
  const payload = await httpGetJson(endpoint, { Accept: 'application/json' });

  const series = payload && (payload['Time Series (Daily)'] || payload['Time Series Daily']);
  if (!series || typeof series !== 'object') {
    throw new Error('No Alpha Vantage time series returned');
  }

  const days = getDaysFromRange(rangeConfig.rangeStr);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const dates = Object.keys(series).sort((a, b) => new Date(a) - new Date(b)); // ascending
  const candles = [];
  for (const date of dates) {
    const row = series[date];
    if (!row) continue;
    // Alpha Vantage date strings are YYYY-MM-DD
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

  // Already ascending by date
  return {
    symbol,
    source: 'alphavantage',
    sourceLabel: 'Alpha Vantage',
    candles,
    nextRecommendedRefreshMs: 60 * 1000,
  };
}

async function fetchFromStooq(symbol, rangeConfig) {
  // Stooq uses lowercase tickers and .us suffix for US stocks
  let s = symbol.toLowerCase();
  if (!s.includes('.')) s = `${s}.us`;
  const endpoint = `https://stooq.com/q/d/l/?s=${encodeURIComponent(s)}&i=d`;
  const text = await httpGetText(endpoint, { Accept: 'text/csv' });
  if (!text || !text.trim()) throw new Error('No data from Stooq');

  const lines = text.trim().split('\n');
  if (lines.length <= 1) throw new Error('No CSV rows from Stooq');

  const header = lines.shift().split(',').map(h => h.trim().toLowerCase());
  const dateIdx = header.indexOf('date');
  const openIdx = header.indexOf('open');
  const highIdx = header.indexOf('high');
  const lowIdx = header.indexOf('low');
  const closeIdx = header.indexOf('close');

  const days = getDaysFromRange(rangeConfig.rangeStr);
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

  return {
    symbol,
    source: 'stooq',
    sourceLabel: 'Stooq (no-key fallback)',
    candles,
    nextRecommendedRefreshMs: 60 * 1000,
  };
}

async function fetchFromYahoo(symbol, rangeConfig) {
  const endpoint = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${rangeConfig.intervalStr}&range=${rangeConfig.rangeStr}`;
  const payload = await httpGetJson(endpoint, { Accept: 'application/json' });
  const result = payload?.chart?.result?.[0];
  if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
    throw new Error(`No candle data returned for ${symbol}`);
  }

  const timestamps = result.timestamp;
  const quote = result.indicators.quote[0];
  const candles = [];
  for (let i = 0; i < timestamps.length; i++) {
    if (quote.open[i] !== null && quote.high[i] !== null && quote.low[i] !== null && quote.close[i] !== null) {
      candles.push({
        timestamp: timestamps[i] * 1000,
        open: Number(quote.open[i]),
        high: Number(quote.high[i]),
        low: Number(quote.low[i]),
        close: Number(quote.close[i]),
      });
    }
  }
  if (!candles.length) throw new Error('No valid candles inside Yahoo response');
  candles.sort((a, b) => a.timestamp - b.timestamp);

  return {
    symbol,
    source: 'yahoo',
    sourceLabel: 'Yahoo Finance (Free)',
    candles,
    nextRecommendedRefreshMs: 60 * 1000,
  };
}

export async function fetchCandlesWithFailover(symbol, range = '3M') {
  const cleanedSymbol = symbol.trim().toUpperCase();
  const rangeConfig = getRangeConfig(range);

  if (!cleanedSymbol) throw new Error('Please enter a symbol');

  // Provider priority: Finnhub (if key), Alpha Vantage (if key), Stooq (no-key fallback), Yahoo (last resort)
  const providers = [];
  if (import.meta.env.VITE_FINNHUB_API_KEY) providers.push(fetchFromFinnhub);
  if (import.meta.env.VITE_ALPHA_VANTAGE_API_KEY) providers.push(fetchFromAlphaVantage);
  providers.push(fetchFromStooq);
  providers.push(fetchFromYahoo);

  let lastError = null;
  for (const provider of providers) {
    try {
      const result = await provider(cleanedSymbol, rangeConfig);
      if (result && Array.isArray(result.candles) && result.candles.length) return result;
    } catch (err) {
      // Keep trying next provider
      // eslint-disable-next-line no-console
      console.warn('Market data provider failed:', err && err.message ? err.message : err);
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error(`Failed to fetch candles for ${cleanedSymbol}`);
}
