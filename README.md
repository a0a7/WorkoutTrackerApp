# Logbook

A beautiful, offline-first Progressive Web App (PWA) for tracking weightlifting workouts. Works perfectly on iOS when added to the home screen, syncs data to the cloud when online.

## Features

- **Offline-first** — All data stored locally via IndexedDB. Service worker caches the app shell for instant load, even without internet.
- **PWA / iOS home screen** — Installable as a standalone app on iPhone/iPad. Add to Home Screen from Safari for the best experience.
- **Workout tracking** — Log sets as you go. Sets are automatically grouped into workouts. No need to "create" a workout first.
- **Smart grouping** — Sets are grouped if they fall within 2 hours of each other. Start/end times auto-calculated (10 min before first set).
- **Multi-select** — Tap select circles to multi-select sets. Editing one field updates all selected sets simultaneously.
- **Drag to reorder** — Grab the six-dot handle on any row to reorder sets.
- **Undo/Redo** — Full undo/redo history for every action.
- **Exercise library** — 80+ exercises with muscle activation data (primary, secondary, tertiary).
- **Muscle map visualization** — Per-workout SVG muscle map showing which muscles were worked.
- **History & filtering** — Browse past workouts, filter by exercise name or date range.
- **Light & dark mode** — Automatic system detection + manual toggle.
- **Cloud sync** — Optional account sign-in syncs data across devices via Cloudflare D1 & KV.

## Tech Stack

- **Frontend**: SvelteKit 2 + Svelte 5 Runes, Tailwind CSS v4
- **Offline**: Service Worker + IndexedDB (`idb` library)
- **Backend**: Cloudflare Workers, D1 (SQLite), KV (sessions)
- **Deployment**: Cloudflare (Workers + D1 + KV)

---

## Deployment Guide (Cloudflare Dashboard — No CLI Required)

### Step 1: Create a Cloudflare Account

Sign up at [cloudflare.com](https://cloudflare.com) if you don't have one.

### Step 2: Create the D1 Database

1. Go to **Workers & Pages** → **D1** in the Cloudflare dashboard.
2. Click **Create database**.
3. Name it `workout-tracker-db`. Click **Create**.
4. Note the **Database ID** shown on the database page.
5. Click on the database → **Console** tab.
6. Paste and run the contents of `migrations/001_init.sql` in the SQL console. This creates the tables.
7. Run `migrations/002_workouts_updated_at.sql` and `migrations/003_strava_sync.sql`.

### Step 3: Create the KV Namespace

1. Go to **Workers & Pages** → **KV** in the Cloudflare dashboard.
2. Click **Create namespace**.
3. Name it `workout-tracker-sessions`. Click **Add**.
4. Note the **Namespace ID**.

### Step 4: Deploy via Cloudflare Pages (No CLI needed)

1. Push this repository to GitHub (or fork it).
2. Go to **Workers & Pages** in the Cloudflare dashboard.
3. Click **Create application** → **Pages** → **Connect to Git**.
4. Authorize GitHub and select your repository.
5. Configure the build settings:
   - **Framework preset**: SvelteKit
   - **Build command**: `npm run build`
   - **Build output directory**: `.svelte-kit/cloudflare`
6. Click **Save and Deploy** and wait for the first build to complete.
7. After deployment, go to **Settings** → **Functions**:
   - Under **D1 database bindings**: Add binding with variable name `DB`, select `workout-tracker-db`.
   - Under **KV namespace bindings**: Add binding with variable name `SESSIONS`, select `workout-tracker-sessions`.
8. Go to **Deployments** and click **Retry deploy** (or push a new commit) to apply the bindings.
9. Add these **Environment Variables** in Pages/Workers settings:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `STRAVA_REDIRECT_URI` (example: `https://<your-project>.pages.dev/api/strava/callback`)

Your app will be live at `https://<your-project>.pages.dev`.

### Step 4 (Alternative): Deploy via Wrangler CLI

```bash
# 1. Install dependencies
npm install

# 2. Edit wrangler.toml — replace the placeholder IDs:
#    database_id = "your-actual-d1-database-id"
#    id = "your-actual-kv-namespace-id"

# 3. Build the app
npm run build

# 4. Deploy
npx wrangler deploy
```

### Step 5: Install as PWA on iOS

1. Open your deployed URL in **Safari** on iPhone/iPad.
2. Tap the **Share** button (box with arrow).
3. Tap **Add to Home Screen**.
4. Name it "Logbook" and tap **Add**.
5. Launch from your home screen — it opens as a standalone full-screen app.

---

## Local Development

```bash
npm install
npm run dev
```

The app works fully offline locally without any backend. Cloud sync features require a real Cloudflare deployment.

For local testing with the full Cloudflare Workers environment:

```bash
# Apply migrations to local D1
npx wrangler d1 execute workout-tracker-db --local --file=migrations/001_init.sql
npx wrangler d1 execute workout-tracker-db --local --file=migrations/002_workouts_updated_at.sql
npx wrangler d1 execute workout-tracker-db --local --file=migrations/003_strava_sync.sql

# Build and run with wrangler (simulates the production environment)
npm run build
npx wrangler dev --local
```

---

## Project Structure

```
src/
├── routes/
│   ├── +layout.svelte              # App shell, bottom nav, service worker init
│   ├── +page.svelte                # Today / workout logging
│   ├── history/+page.svelte        # Workout history with filters
│   ├── workout/[id]/+page.svelte   # Workout detail with muscle map
│   ├── settings/+page.svelte       # Account, theme, units
│   ├── login/+page.svelte          # Auth (login / register / offline)
│   └── api/
│       ├── auth/login/+server.ts   # POST — authenticate user
│       ├── auth/register/+server.ts  # POST — create account
│       ├── sets/+server.ts         # GET/POST — sync sets
│       └── workouts/+server.ts     # GET/POST — sync workouts
├── lib/
│   ├── components/
│   │   ├── SetRow.svelte           # Individual set row with inline editing
│   │   ├── ExerciseAutocomplete.svelte
│   │   ├── MuscleMap.svelte        # SVG front/back body diagram
│   │   ├── WorkoutCard.svelte      # Workout list card
│   │   └── ThemeToggle.svelte
│   ├── server/
│   │   └── auth.ts                 # Token validation for API routes
│   ├── exercises.ts                # Exercise library (80+ exercises)
│   ├── db.ts                       # IndexedDB helpers (idb)
│   ├── sync.ts                     # Cloud sync logic
│   ├── stores/                     # Svelte stores (user, workout, undo)
│   └── types.ts
├── service-worker.ts               # PWA service worker (cache-first)
└── worker/
    └── index.ts                    # Cloudflare Worker entry point
```

---

## How Sync Works

1. **All writes** go to IndexedDB immediately (offline-first).
2. Writes are also queued in a `pendingSync` IndexedDB store.
3. When the device comes online, pending changes are pushed to the Cloudflare API (`/api/sets`, `/api/workouts`).
4. Remote changes are pulled and merged locally.
5. Sessions are persisted in KV with a 1-year TTL — users stay logged in indefinitely.
6. The app works completely offline — sync is purely additive.

---

## License

MIT
