# DroidCore

**Android Launch Platform**

DroidCore is a ready-to-build Android scaffold built on Capacitor, React, and Vite.  
Clone → customize → build APK. Ship Android apps fast.

## Features

- ⚡ Capacitor 5.x Android build environment
- 🛠️ Gradle 8.11.1 + Android Gradle Plugin 8.7.2
- ⚛️ React 18 + Vite 5 dev server
- 📊 Market data candlestick chart demo (Finnhub + Alpha Vantage failover)
- 📱 Single-command APK build (`./build_apk.sh`)
- 🔐 Release signing config ready
- 📷 Camera, microphone, location, and storage permissions pre-configured

## Quick Start

```bash
npm install
npm run dev        # Start dev server
npm run build      # Production build
```

## Android Build

### Prerequisites

- **Java 17** — `brew install openjdk@17`
- **Android SDK** — via Android Studio or `brew install android-commandlinetools`

### Build APK

```bash
./build_apk.sh             # Release build
./build_apk.sh --debug     # Debug build
```

The script will:
1. Ask for a build keyword (used in the APK filename)
2. Build the web app with Vite
3. Sync with Capacitor
4. Run Gradle assembleRelease (or assembleDebug)
5. Output `droidcore-<keyword>-release-<timestamp>.apk`

## Environment Variables

Copy `.env.example` to `.env` and add your API keys:

```bash
VITE_FINNHUB_API_KEY=your-key
VITE_ALPHA_VANTAGE_API_KEY=your-key
```

## Preserved Versions

| Package | Version |
|---|---|
| `@capacitor/android` | `^5.7.8` |
| `@capacitor/cli` | `^5.7.8` |
| `@capacitor/core` | `^5.7.8` |
| Gradle wrapper | `8.11.1` |
| Android Gradle Plugin | `8.7.2` |

See [ANDROID_ENV_VERSIONS.md](ANDROID_ENV_VERSIONS.md) for the full list.

## Project Structure

```
├── android/                 # Native Android project
│   ├── app/                 # App module (manifests, resources, Java)
│   ├── gradle/              # Gradle wrapper
│   └── build.gradle         # Root Gradle config
├── src/                     # React source
│   ├── App.jsx              # Main app component
│   ├── components/          # UI components
│   ├── services/            # Data services
│   ├── index.css            # Styles
│   └── main.jsx             # Entry point
├── public/                  # Static assets
├── capacitor.config.json    # Capacitor config
├── build_apk.sh             # APK build script
├── droidcore_alp_logo.svg   # Logo source
└── vite.config.js           # Vite config
```

## License

Private.
