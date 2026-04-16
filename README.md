# 🎵 Vinyl Hunter

YouTube → Tracklist → Discogs · Find the best EU vinyl for every track.

**Features:**
- Paste any YouTube URL → Claude AI extracts the tracklist
- Searches Discogs for vinyl releases with **M / NM / VG+ / VG** grades only
- Filters to **European sellers only** (excludes UK)
- Ranks sellers by **proximity to Czech Republic**, then by price
- Shows average price, total playlist cost
- **Add to Wantlist** via Discogs API (single or bulk)
- Works on mobile + desktop

---

## Deploy in 5 minutes (Railway — free tier)

### 1. Fork / clone this repo
```bash
git clone https://github.com/YOUR_USERNAME/vinyl-hunter
cd vinyl-hunter
```

### 2. Create a `.env` file
```bash
cp .env.example .env
```
Edit `.env` and fill in:
```
ANTHROPIC_API_KEY=sk-ant-...   # from console.anthropic.com
DISCOGS_TOKEN=your_token       # from discogs.com → Settings → Developers
DISCOGS_USER=LeeCZ
```

### 3. Deploy to Railway
1. Go to [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo**
2. Connect your GitHub account and select this repo
3. Go to **Variables** tab → add your env vars from `.env`
4. Railway auto-detects Node.js and deploys — you'll get a URL like `vinyl-hunter.up.railway.app`

Done. Open the URL on any device.

---

## Run locally
```bash
npm install
npm run dev          # uses nodemon for auto-reload
# or
npm start
```
Open http://localhost:3000

---

## How it works

```
Browser ──POST /api/extract-tracks──► Server ──► Anthropic API (Claude)
                                                        │
Browser ──POST /api/search-discogs──► Server ──► Discogs API
                                                        │ filter EU, sort by proximity
Browser ──POST /api/wantlist-add───► Server ──► PUT discogs.com/users/LeeCZ/wants/{id}
```

All API keys stay server-side — never exposed to the browser.

---

## Accepted vinyl grades

| Grade | Status |
|-------|--------|
| Mint (M) | ✅ |
| Near Mint (NM or M-) | ✅ |
| Very Good Plus (VG+) | ✅ |
| Very Good (VG) | ✅ |
| Good Plus (G+) | ❌ filtered out |
| Good (G) | ❌ filtered out |
| Poor (P) | ❌ filtered out |

## Seller proximity order (from Czech Republic outward)
CZ → SK → AT → DE → PL → HU → SI → HR → IT → CH → NL → BE → FR → ES → PT → DK → SE → NO → FI → EE → LV → LT → RO → BG → GR → RS → IS → IE → TR → CY → MT → ME → MD → BY → UA

UK is always excluded.
