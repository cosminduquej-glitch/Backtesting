# Copilot instructions for DroidCore (Backtesting repo)

Purpose: give Copilot sessions quick, factual guidance tailored to this repository so suggestions are accurate and actionable.

---

Build, test, and lint commands

- Install dependencies: npm install
- Dev server: npm run dev  # starts Vite dev server (hot reload)
- Production build: npm run build  # outputs to dist/
- Preview production build: npm run preview
- Android APK build: ./build_apk.sh [--debug]
  - The script prompts for a build keyword and performs: Vite build -> Capacitor sync -> Gradle assemble

Notes:
- package.json defines scripts: dev, build, preview. No test or lint scripts detected in repository.
- Node engine: node >=22 required (see package.json "engines").

If tests are later added, follow the project's test script (npm run test). To run a single test with common runners:
- Jest: npm test -- -t "<test name pattern>"
- Vitest: npx vitest run -t "<pattern>"

---

High-level architecture

- Web front-end (src/): React 18 + Vite 5. Entry point: src/main.jsx -> App.jsx
- Native Android project (android/): full Capacitor Android app; Gradle wrapper included.
- Capacitor glue: capacitor.config.json keeps native/web integration settings.
- APK build flow: web build (Vite) -> capacitor sync -> gradle assemble (handled by build_apk.sh)
- Static assets: public/ (served by Vite and bundled into APK webview assets)
- Services/API clients: src/services/ (market data fallback logic exists per README)

Relevant files:
- build_apk.sh — single-command Android build script (release/debug)
- ANDROID_ENV_VERSIONS.md — pinned SDK / Gradle versions to match CI/local SDKs
- capacitor.config.json — Capacitor config
- vite.config.js — Vite build/dev configuration

---

Key repository conventions and non-obvious patterns

- Environment variables must use the VITE_ prefix to be exposed to the client (e.g., VITE_FINNHUB_API_KEY). Copy .env.example -> .env.
- The APK build script asks for a "keyword" used in the output APK filename; Copilot should not hardcode filenames—use the script or follow its prompt.
- Preserved/pinned native tool versions: the repo pins @capacitor and Gradle wrapper versions (see ANDROID_ENV_VERSIONS.md). Avoid suggesting upgrades without verifying compatibility.
- Node "type": "module" is set in package.json — prefer ES module import/export patterns over CommonJS.
- No test/lint config present: avoid suggesting test/lint commands unless a matching config or scripts are added.
- Permissions (camera/mic/location/storage) and common Capacitor plugins are preconfigured — when suggesting plugin changes, ensure Android native manifest and Gradle settings are updated accordingly.

---

Other assistant configs

- No CLAUDE.md, AGENTS.md, .cursorrules, CONVENTIONS.md, or other known AI-assistant config files were detected. If these are added, incorporate their guidance here.

---

Quick tips for Copilot sessions (do not surface as generic advice to users):
- Prefer using build_apk.sh for Android packaging to ensure the correct sequence of build, sync, and Gradle tasks.
- Respect the Node >=22 engine requirement in generated package changes.
- When suggesting changes to native Android files, reference the android/ project layout and ANDROID_ENV_VERSIONS.md for compatibility.

---

Maintainer contacts and next steps

- README.md contains additional context for Android prerequisites (Java 17, Android SDK).


