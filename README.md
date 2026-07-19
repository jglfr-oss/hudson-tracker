# Hudson's Insulin Tracker

A personal insulin dose calculator for Hudson, styled after the Omnipod app, with live Dexcom G7 BG integration.

## Features

- 💉 **Dose calculator** — carbs + BG → recommended insulin (rounds to 0.5u)
- 📡 **Live Dexcom G7** — pulls current BG with trend arrow every 5 min
- 📋 **Daily log** — history of every logged dose
- ⚙️ **Custom ratios** — adjustable per-meal insulin-to-carb ratio
- ✨ **Daily inspiration** — rotating motivational quote
- 💓 **T1D Pulse** — recent Type 1 diabetes news + trending community posts (see below)
- 📱 **Mobile-first** — add to home screen for app-like experience

---

## T1D Pulse

A home-screen tab (between **Trends** and **Ask**) that surfaces recent, credible
Type 1 diabetes **news** and recent/trending **community** posts, so the family can
quickly see what's happening in the T1D world.

- **Two tabs:** News and Community.
- **Filters:** All · Research · Technology · Treatment · Devices · Community.
- Each item shows headline/post, source/account, a platform badge, friendly time
  ("2h ago"), an excerpt, engagement metrics (when available), a thumbnail (when
  available), and an external-link indicator. Tapping opens the original source in a
  new browser tab.
- Shows "Updated X ago", a refresh button, loading skeletons, an empty state, and a
  partial-data warning when a source fails.
- 10 items per tab initially, with **Show more**.

### Supported sources

All retrieval happens **server-side** in `api/t1d-pulse.js` via per-source adapters
under `lib/t1d-pulse/sources/`. Results are normalized to a common shape, safety-
filtered, deduplicated, scored, and cached.

| Source | Works without credentials? | Env vars |
|---|---|---|
| **News** — curated RSS/Atom (FDA, NIH, Breakthrough T1D), Google News topic feeds, PubMed E-utilities | ✅ Yes | — (optional `T1D_NEWS_API_KEY` adds a commercial provider) |
| **Bluesky** — public AppView search API | ✅ Yes | — |
| **YouTube** — Data API v3 | ❌ No | `YOUTUBE_API_KEY` |
| **X** — recent-search API | ❌ No | `X_BEARER_TOKEN` |
| **Reddit** — official OAuth API (r/diabetes_t1, r/Type1Diabetes, r/dexcom, r/Omnipod) | ❌ No | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` |

The feature works out of the box with **News + Bluesky** and gracefully adds the other
platforms as their credentials are configured. One failing source never breaks the tab —
its status is reported in the response's `sourceStatus` and shown as a partial-data
warning in the UI.

### Environment variables (all optional)

Set these in **Vercel → Settings → Environment Variables** to enable extra sources. The
app runs fine without any of them.

| Name | Enables | Required for that source? |
|---|---|---|
| `T1D_NEWS_API_KEY` | Commercial news provider (in addition to free feeds) | No |
| `YOUTUBE_API_KEY` | YouTube videos | Yes (source disabled without it) |
| `X_BEARER_TOKEN` | X / Twitter posts | Yes |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT` | Reddit posts | Yes (all three) |

### To disable a source

- **News / Bluesky:** remove or edit entries in `lib/t1d-pulse/config.js` (`NEWS_FEEDS`)
  or delete the relevant `fetch*` call in `api/t1d-pulse.js`.
- **YouTube / X / Reddit:** simply leave their env vars unset — each adapter reports
  `not_configured` and is skipped.

### New-article push alerts

An hourly Vercel cron (`/api/t1d-pulse-news-alert`) diffs the current News list
against a seen-set in KV and sends a push notification to all registered family
devices for genuinely new articles (max 3 per run; only articles published in the
last 48 h). Tapping the notification opens the app directly on the T1D Pulse tab.

- Toggle it with the **🔔 Alerts** button in the Pulse header (family-wide setting,
  on by default). Delivery still requires the device to have notifications enabled
  in Settings, exactly like the existing device-change alerts.
- The first cron run only seeds the seen-set — it never blasts a push for every
  article already on the tab.
- Uses the existing web-push setup (`VAPID_*` keys, `hudson-push-subs`) and the
  same `CRON_SECRET` protection as the other cron endpoints. No new env vars.

### Cache behavior

Aggregate results are cached for **~15 minutes**. The cache uses the repo's existing
Vercel KV when configured (`KV_REST_API_URL` etc.) and transparently falls back to an
in-memory cache for local development. Append `?refresh=1` (or tap **Refresh**) to bypass
the cache.

### Recency & trending score

- Content from the **last 7 days** is preferred; items older than **30 days** are rejected
  unless nothing newer exists.
- News items are *selected* by **relevance to Type 1 → source credibility → recency**
  (that score also decides which duplicate survives), then *displayed* newest-first.
- Community posts get a transparent trending score (documented in
  `lib/t1d-pulse/scoring.js`):

  ```
  engagement  = Σ (count_i × per-platform weight_i)          // likes/comments/shares/views
  engScore    = log10(1 + engagement) / log10(1 + reference) // log-scaled, platform-normalized → 0..1
  recency     = 0.5 ^ (ageHours / 36)                        // exponential decay, ~36h half-life
  trending    = 0.6 × engScore + 0.4 × recency               // → 0..1
  ```

  Log scaling stops one viral post from dwarfing everything, and engagement is
  **normalized per platform** before combining (a YouTube view ≠ a Bluesky like).

### Deduplication

Items are deduped by canonical URL, platform post id, normalized title, and strongly
similar headline text — so the same article syndicated across publishers appears once.

### Known API limitations

- Google News / PubMed / Bluesky public endpoints are unauthenticated and rate-limited;
  the 15-minute cache keeps request volume low.
- X's recent-search API only covers the last ~7 days and requires a paid tier for higher
  volume.
- Reddit app-only OAuth is rate-limited per client id.
- Feed URLs occasionally change; a failing feed is skipped and reported, never fatal.

### Medical-information disclaimer

> Community posts are unverified and may contain incorrect medical information.
>
> Never change insulin, pump, CGM, or treatment settings based only on a news article or
> social post. Confirm treatment decisions with Hudson's endocrinology team.

Content that promotes stopping insulin, miracle cures, or dangerous dosing is filtered out
at the server, and community posts are never labeled as medically verified.

### Tests

```bash
npm test        # node --test — unit tests for normalization, scoring, dedup,
                # safety, source parsers, and aggregation (fixtures, no live calls)
```

---

## Setup — Run it locally first (optional)

```bash
npm install
cp .env.example .env.local
# Edit .env.local and add Hudson's Dexcom credentials
npm run dev
```

Note: The `/api/dexcom` endpoint requires Vercel's runtime to work. Local `npm run dev` shows the UI but the Dexcom banner will show "Connection issue" until deployed. For full local testing with the API, use `vercel dev` (install Vercel CLI first).

---

## Deployment (the easy way)

### 1. Enable Dexcom Share
On Hudson's phone:
- Open Dexcom G7 app
- Menu → **Share** → turn on
- Settings → Account → note his **username** (not email)

### 2. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
# Create a new empty repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/hudson-tracker.git
git push -u origin main
```

### 3. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New → Project**
2. Import the `hudson-tracker` repo from GitHub
3. **Before clicking Deploy**, expand **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DEXCOM_USERNAME` | Hudson's Dexcom username |
   | `DEXCOM_PASSWORD` | Hudson's Dexcom password |
   | `DEXCOM_REGION` | `us` (or `ous` outside the US) |

4. Click **Deploy**

Done! Vercel gives you a URL like `hudson-tracker.vercel.app`.

### 4. Add to home screen (iOS)

On Hudson's iPhone:
- Open the Vercel URL in **Safari**
- Tap Share → **Add to Home Screen**
- Now it launches full-screen like a native app

---

## Project structure

```
hudson-tracker/
├── api/
│   ├── dexcom.js       ← Vercel serverless Dexcom proxy
│   └── t1d-pulse.js    ← T1D Pulse aggregation endpoint
├── lib/
│   └── t1d-pulse/      ← Server-side news/social library (never bundled to client)
│       ├── config.js       ← feeds, search terms, categories, safety patterns
│       ├── normalize.js    ← common item shape + text/URL sanitization
│       ├── scoring.js      ← trending score, news ranking, recency cutoff, dedup
│       ├── safety.js       ← unsafe-content filtering
│       ├── cache.js        ← KV + in-memory fallback
│       ├── feed.js         ← minimal RSS/Atom parser
│       ├── http.js         ← fetch with per-request timeouts
│       ├── aggregate.js    ← pure aggregation pipeline
│       └── sources/        ← news, youtube, bluesky, x, reddit adapters
├── public/
│   └── favicon.svg
├── src/
│   ├── App.jsx         ← Main app
│   ├── components/
│   │   └── T1DPulse.jsx ← T1D Pulse tab UI
│   ├── theme.js        ← shared visual tokens
│   └── main.jsx        ← React entry
├── test/
│   └── t1d-pulse/      ← unit tests (fixtures, no live API calls)
├── .env.example        ← Template for credentials
├── .gitignore
├── index.html
├── package.json
├── README.md
├── vercel.json
└── vite.config.js
```

---

## Adjusting dose parameters

Open `src/App.jsx` and look near the top under `// ═══ Config ═══`:

```js
const TARGET_LOW        = 80;    // Below = "Low" badge
const TARGET_HIGH       = 180;   // Above = "High" badge
const CORRECTION_FACTOR = 50;    // 1u drops BG by this mg/dL
const TARGET_BG         = 120;   // BG we correct down to
```

Default insulin-to-carb ratios (editable in-app via ⚙️):
- Breakfast: 1:10
- Lunch: 1:12
- Dinner: 1:12
- Snack: 1:15

**⚠️ Update these to match Hudson's actual numbers from his endocrinologist.**

---

## Security notes

- Dexcom credentials **only live in Vercel environment variables** — never in the code or GitHub
- The app uses an unofficial Dexcom Share endpoint (same one used by xDrip+, Sugarmate, Nightscout)
- All dose history is stored **in the browser** via localStorage — nothing is sent anywhere

---

## Disclaimer

This is a personal tool. Always verify doses with Hudson's diabetes care team. Never rely solely on software for medical decisions.
