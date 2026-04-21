# Hudson's Insulin Tracker

A personal insulin dose calculator for Hudson, styled after the Omnipod app, with live Dexcom G7 BG integration.

## Features

- 💉 **Dose calculator** — carbs + BG → recommended insulin (rounds to 0.5u)
- 📡 **Live Dexcom G7** — pulls current BG with trend arrow every 5 min
- 📋 **Daily log** — history of every logged dose
- ⚙️ **Custom ratios** — adjustable per-meal insulin-to-carb ratio
- ✨ **Daily inspiration** — rotating motivational quote
- 📱 **Mobile-first** — add to home screen for app-like experience

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
│   └── dexcom.js       ← Vercel serverless Dexcom proxy
├── public/
│   └── favicon.svg
├── src/
│   ├── App.jsx         ← Main app
│   └── main.jsx        ← React entry
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
