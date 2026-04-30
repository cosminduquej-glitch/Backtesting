# DroidCore

Android trading-chart app scaffold built with Capacitor, React, and Vite.

## Current Features

- Real-time candlestick chart with multi-provider failover:
  - Yahoo (q1, q2, proxy)
  - Finnhub (if key is present)
  - Alpha Vantage (if key is present)
- Instrument selector (fixed list of supported symbols)
- Timeframes:
  - `1m`, `5m`, `15m`, `30m`, `1H`, `4H`, `1D`, `1W`
- Auto-jump to latest candles when symbol/timeframe changes
- `Latest` reset button:
  - Resets both time and price view to latest candles
  - Long-press to drag
  - Drag arming feedback and haptic vibration when drag becomes active
  - Hold-drag cancel behavior if finger moves away during hold
- Local candle caching for fast reloads
- Debug overlay for data-source and fetch diagnostics

## Environment Variables

Create `.env` in project root:

```bash
VITE_FINNHUB_API_KEY=your-key
VITE_ALPHA_VANTAGE_API_KEY=your-key
```

## Local Development

```bash
npm install
npm run dev
npm run build
```

## Android Build

### Script

```bash
./build_apk.sh
./build_apk.sh --debug
```

### Manual Windows/PowerShell flow

```powershell
npm run build
npx cap sync android
.\android\gradlew.bat -p android assembleDebug
```

APK output:

- `android/app/build/outputs/apk/debug/app-debug.apk`

## Version Notes

- Capacitor 5.x
- Gradle wrapper 8.11.1
- Android Gradle Plugin 8.7.2

See [ANDROID_ENV_VERSIONS.md](ANDROID_ENV_VERSIONS.md) for full environment details.
