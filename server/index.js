require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN;
const DISCOGS_USER  = process.env.DISCOGS_USER || 'LeeCZ';
const PORT = process.env.PORT || 3000;

const EU_PRIORITY = [
  'Czech Republic','Czechia','Slovakia','Austria','Germany','Poland','Hungary',
  'Slovenia','Croatia','Italy','Switzerland','Netherlands','Belgium',
  'France','Spain','Portugal','Denmark','Sweden','Norway','Finland',
  'Estonia','Latvia','Lithuania','Romania','Bulgaria','Greece','Serbia',
  'Iceland','Ireland','Turkey','Cyprus','Malta','Montenegro','Moldova',
  'Belarus','Ukraine','Europe'
];
const ACCEPTED_CONDITIONS = [
  'Mint (M)', 'Near Mint (NM or M-)', 'Very Good Plus (VG+)', 'Very Good (VG)'
];

function isEU(country) {
  if (!country) return false;
  const c = country.toLowerCase();
  if (c.includes('united kingdom') || c === 'uk' || c === 'gb') return false;
  return EU_PRIORITY.some(x => c.includes(x.toLowerCase()));
}

function euScore(country) {
  if (!country) return 999;
  const c = country.toLowerCase();
  if (c.includes('united kingdom') || c === 'uk') return 1000;
  const i = EU_PRIORITY.findIndex(x => c.includes(x.toLowerCase()));
  return i >= 0 ? i : 500;
}

function isAccepted(cond) {
  return ACCEPTED_CONDITIONS.includes(cond);
}

async function discogsGet(path) {
  const res = await fetch(`https://api.discogs.com${path}`, {
    headers: {
      'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
      'User-Agent': 'VinylHunterApp/1.0 +https://github.com/LeeCZ/vinyl-hunter'
    }
  });
  if (!res.ok) throw new Error(`Discogs ${res.status}: ${path}`);
  return res.json();
}

// ── POST /api/extract-tracks ───────────────────────────────────────────────
app.post('/api/extract-tracks', async (req, res) => {
  const { url, description } = req.body;
  if (!url && !description) return res.status(400).json({ error: 'url or description required' });

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    let prompt;

    if (description) {
      prompt = `Extract all tracks from this YouTube video description/tracklist:\n\n${description}`;
    } else {
      // Fetch the YouTube page and extract description + chapter markers from ytInitialData
      let ytContext = null;
      try {
        const ytRes = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        if (ytRes.ok) {
          const html = await ytRes.text();

          // Extract video description embedded in ytInitialData
          const descMatch = html.match(/"attributedDescriptionBodyText":\{"content":"((?:[^"\\]|\\.)*)"/s);
          const descText = descMatch
            ? descMatch[1]
                .replace(/\\n/g, '\n')
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, '\\')
                .slice(0, 4000)
            : null;

          // Extract chapter titles (e.g. "0:00 Artist – Track")
          const chapters = [...html.matchAll(/"chapterRenderer":\{"title":\{"runs":\[\{"text":"([^"]+)"/g)]
            .map(m => m[1]);

          const parts = [];
          if (descText) parts.push(descText);
          if (chapters.length) parts.push('Chapters:\n' + chapters.join('\n'));
          if (parts.length) ytContext = parts.join('\n\n');
          console.log(`[yt-fetch] desc=${!!descText} chapters=${chapters.length} context_len=${ytContext?.length || 0}`);
        }
      } catch (ytErr) {
        console.warn('[yt-fetch] failed, falling back to URL-only:', ytErr.message);
      }

      prompt = ytContext
        ? `Extract all tracks from this YouTube video. Here is the page description and chapter markers:\n\n${ytContext}`
        : `Extract all tracks from this YouTube video: ${url}\n\nAnalyze the URL, video ID, and any context to identify the tracklist. If it appears to be a DJ mix or reggae/funk/soul compilation, use your music knowledge to identify likely tracks.`;
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: `You are a music expert. Extract all tracks from a YouTube video URL or description.
Return ONLY a valid JSON array with no markdown:
[{"artist":"Artist Name","title":"Track Title","album":"Album if known or empty"}]`,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await anthropicRes.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    let tracks = [];
    const text = data.content[0].text;
    try {
      tracks = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) tracks = JSON.parse(match[0]);
    }

    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/search-discogs ───────────────────────────────────────────────
app.post('/api/search-discogs', async (req, res) => {
  const { tracks } = req.body;
  if (!Array.isArray(tracks)) return res.status(400).json({ error: 'tracks array required' });

  const results = [];

  for (const track of tracks) {
    try {
      const q = encodeURIComponent(`${track.artist ? track.artist + ' ' : ''}${track.title}`);

      // 1. Find release
      const dbRes = await discogsGet(`/database/search?q=${q}&format=Vinyl&type=release&per_page=5`);
      const releases = (dbRes.results || []).slice(0, 3);

      if (!releases.length) {
        results.push({ title: track.title, artist: track.artist, noRelease: true });
        await sleep(600);
        continue;
      }

      const rel = releases[0];

      // 2. Stats + listings in parallel
      const [stats, listingsData] = await Promise.all([
        discogsGet(`/marketplace/stats/${rel.id}?curr_abbr=EUR`).catch(() => null),
        discogsGet(`/marketplace/listings?release_id=${rel.id}&status=For+Sale&sort=price&sort_order=asc&per_page=50&curr_abbr=EUR`).catch(() => ({ listings: [] }))
      ]);

      // 3. Filter + rank EU sellers
      console.log('ships_from sample:', (listingsData.listings||[]).slice(0,8).map(l => l.ships_from));
      const validListings = (listingsData.listings || []).filter(l =>
        isEU(l.ships_from) && isAccepted(l.condition)
      );
      validListings.sort((a, b) => {
        const sd = euScore(a.ships_from) - euScore(b.ships_from);
        return sd !== 0 ? sd : (a.price?.value || 999) - (b.price?.value || 999);
      });
      const topSellers = validListings.slice(0, 4).map(s => ({
        seller: s.seller?.username || 'Unknown',
        country: s.ships_from,
        rating: s.seller?.stats?.rating ? Math.round(s.seller.stats.rating * 100) : null,
        grade: s.condition,
        price: s.price?.value,
        listingId: s.id,
        listingUrl: s.uri || `https://www.discogs.com/sell/item/${s.id}`
      }));

      results.push({
        title: track.title,
        artist: track.artist,
        releaseId: rel.id,
        releaseTitle: rel.title,
        year: rel.year || '',
        format: (rel.format || []).slice(0, 2).join(', '),
        thumb: rel.thumb || rel.cover_image || '',
        lowestPrice: stats?.lowest_price?.value || null,
        numForSale: stats?.num_for_sale || null,
        sellers: topSellers,
        bestPrice: topSellers[0]?.price || null,
        discogsUrl: `https://www.discogs.com${rel.uri || '/release/' + rel.id}`
      });
    } catch (err) {
      results.push({ title: track.title, artist: track.artist, error: err.message });
    }

    await sleep(700); // stay within Discogs rate limit
  }

  res.json({ results });
});

// ── POST /api/wantlist-add ─────────────────────────────────────────────────
app.post('/api/wantlist-add', async (req, res) => {
  const { releaseId } = req.body;
  if (!releaseId) return res.status(400).json({ error: 'releaseId required' });

  try {
    const response = await fetch(`https://api.discogs.com/users/${DISCOGS_USER}/wants/${releaseId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Discogs token=${DISCOGS_TOKEN}`,
        'User-Agent': 'VinylHunterApp/1.0',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ notes: 'Added by Vinyl Hunter', rating: 0 })
    });

    // 409 = already in wantlist, treat as success
    if (response.ok || response.status === 409 || response.status === 201) {
      res.json({ ok: true, status: response.status });
    } else {
      const body = await response.text();
      res.status(response.status).json({ ok: false, error: body });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── GET /api/health ────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    user: DISCOGS_USER,
    hasAnthropicKey: !!ANTHROPIC_KEY,
    hasDiscogsToken: !!DISCOGS_TOKEN
  });
});

// ── Catch-all → serve frontend ─────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.listen(PORT, () => {
  console.log(`🎵 Vinyl Hunter running on http://localhost:${PORT}`);
  console.log(`   User: ${DISCOGS_USER} | Discogs token: ${DISCOGS_TOKEN ? '✓' : '✗'} | Anthropic: ${ANTHROPIC_KEY ? '✓' : '✗'}`);
});
