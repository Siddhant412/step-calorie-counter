# Step & Calorie Counter

End-to-end starter kit for streaming pedometer data from an iPhone to a lightweight Node.js API and a reactive dashboard. It now includes configurable daily goals and streak tracking that stay in sync across the collector app and the web UI.

## Components

- **ios/StepCalorieCounter** – SwiftUI app that reads Core Motion data, estimates calories, uploads metrics, and now surfaces goal progress + streaks with server-synced values.
- **server/** – Express API persisting samples to `server/data/metrics.json`, storing goal preferences in `server/data/goals.json`, aggregating daily totals, and serving summaries.
- **web/** – Static dashboard (vanilla JS + Chart.js replacement) for monitoring live stats, goal progress, streaks, and editing goal targets.

## Running locally

1. **Backend**
   ```bash
   cd server
   npm install
   npm run dev
   ```
   - `POST /api/metrics` – iOS uploads `{ device, sample }` payloads
   - `GET /api/metrics` – dashboard fetches latest samples (`summary` field includes goals/today/streak)
   - `DELETE /api/metrics` – reset samples
   - `GET /api/summary` – compact goal summary plus insights/predictions (used by mobile app)
   - `GET /api/insights` – rolling averages/compliance/best day
   - `GET /api/predictions` – next-day step + calorie forecasts (linear regression)
   - `GET/PUT /api/goals` – read/update daily step & calorie targets

2. **iOS app**
   - Open `ios/StepCalorieCounter/StepCalorieCounter.xcodeproj`
   - Update bundle identifier & signing, run on your device
   - Configure API base URL (LAN IP or tunnel), weight/height, upload cadence, and daily goals. Progress bars + streak count reflect the server summary.

3. **Web dashboard**
   ```bash
   python3 -m http.server --directory web 4173
   # open http://localhost:4173
   ```
   - Enter the API base URL (e.g., ngrok tunnel) and watch totals, goal progress, and streak updates in real time.
   - Use the goal form to adjust step/calorie targets – changes sync back to iOS instantly.

## Daily goals, streaks & insights

- Goals are stored centrally in `server/data/goals.json` and exposed through `/api/summary`, `/api/insights`, `/api/predictions`, and `/api/goals`.
- The server aggregates samples per day (UTC) to compute:
  - **Today** – total steps/calories vs goal with progress ratios
  - **Streak** – consecutive days (up to today) meeting both goals
  - **Insights** – 7-day rolling averages, goal-compliance rate, and the best-performing day
  - **Predictions** – simple linear-regression forecasts for tomorrow’s steps/calories using the last ~two weeks of daily totals
- The iOS app fetches the summary whenever it launches, when the server URL changes, after every successful upload, and after resets. The dashboard refresh uses the embedded summary returned from `/api/metrics` and can also fetch `/api/summary` or `/api/insights` directly.
