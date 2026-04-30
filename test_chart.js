import { createChart } from 'lightweight-charts';
try {
  createChart(document.createElement('div'), {
    layout: { background: { type: "solid", color: "#131722" }, textColor: "#d1d4dc" },
    grid: { vertLines: { color: "rgba(42, 46, 57, 0.5)" }, horzLines: { color: "rgba(42, 46, 57, 0.5)" } },
    width: 0 || 800,
    height: 0 || 600,
    autoSize: true,
    timeScale: { timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1, vertLine: { width: 1, color: "#787b86", style: 0 }, horzLine: { width: 1, color: "#787b86", style: 0 } },
  });
  console.log("SUCCESS");
} catch (e) {
  console.error("ERROR:", e);
}
