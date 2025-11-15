# Step & Calorie Counter

Minimal end-to-end stack for collecting step + calorie data on an iPhone (via Core Motion), persisting it on a tiny Node.js API, and visualizing progress on a web dashboard.

## Project layout

```
ios/
  StepCalorieCounter/          # SwiftUI iOS app that talks to Core Motion and posts metrics
server/
  src/server.js                # Express API that stores samples on disk (JSON)
web/
  index.html / app.js          # Static dashboard that polls the API and draws charts
```

## What you get

- **Native collector (SwiftUI + Core Motion)** – captures live step counts, estimates calories using weight/height, and periodically POSTs JSON with timestamps + device info.
- **Backend ingestion API (Express)** – `/api/metrics` accepts uploads, persists them to `server/data/metrics.json`, and exposes aggregated data via `GET /api/metrics`.
- **Web dashboard** – configurable API endpoint, live polling, summary stats, and a line chart of recent samples powered by Chart.js.

## Prerequisites

- Xcode 14+ and an Apple Developer account to run the iOS app on your iPhone.
- Node.js 18+ (used for the backend API).
- Any static file server (or simply open `web/index.html` in the browser once CORS is configured).

> **Network tip:** when running on a real iPhone, ensure your phone and development machine are on the same Wi‑Fi network. Update the server URL inside the iOS app to point to your machine's LAN IP (e.g., `http://192.168.86.42:4000`).

## 1. Run the API

```bash
cd server
npm install
npm run dev   # starts http://localhost:4000 with auto-reload
```

API surface:

```
POST /api/metrics         # collector uploads JSON { device, sample }
GET  /api/metrics?limit=50# dashboard fetches latest samples + totals
DELETE /api/metrics       # optional reset utility while testing
GET  /health              # returns { status, count }
```

Data is persisted in `server/data/metrics.json` so you can inspect or back up samples easily.

## 2. Build & run the iOS collector

1. Open `ios/StepCalorieCounter/StepCalorieCounter.xcodeproj` in Xcode.
2. Set your bundle identifier + signing team under *TARGETS ▸ Signing & Capabilities*.
3. Deploy to your iPhone 13 (or simulator). First launch will prompt for Motion usage permission.
4. Inside the app:
   - Enter the API base URL (e.g., `http://192.168.0.10:4000`).
   - Adjust weight/height so calorie estimates are tailored to you.
   - Tap **Start Tracking**. The app will show live pedometer readings and push data to the backend every ~60 seconds (configurable slider).

> The pedometer streams in foreground. For long-running background collection, consider adding Background Deliveries + HealthKit integration in a later iteration.

## 3. Launch the dashboard

You can open `web/index.html` directly, but running through a simple static server avoids mixed-content issues:

```bash
# from project root
target_ip=http://localhost:4000 # or your LAN IP
python3 -m http.server --directory web 4173
# visit http://localhost:4173 and configure API URL when prompted
```

The dashboard polls `/api/metrics?limit=50` every 10 seconds, keeps totals in sync, and draws a quick steps timeline. Click **Refresh** anytime for an immediate fetch.

## Data format

Collector ➜ API payload example:

```json
{
  "device": {
    "deviceId": "C00FFEE-1234",
    "model": "Siddhant’s iPhone",
    "osVersion": "17.5"
  },
  "sample": {
    "steps": 850,
    "distance": 612.3,
    "calories": 42.1,
    "start": "2024-05-30T10:12:00Z",
    "end": "2024-05-30T10:22:00Z"
  }
}
```

## Next ideas

- Persist to a managed datastore (SQLite, DynamoDB, or Timescale) instead of flat JSON.
- Add authentication (API key or token) so only your device can post metrics.
- Enable background delivery via HealthKit for 24/7 tracking.
- Improve dashboard visualizations (daily aggregates, goals, export, etc.).

This scaffold keeps each piece minimal so you can iterate quickly without diving deep into Swift or backend plumbing. Let me know if you want automated tests, deployment scripts, or HealthKit integration next.
