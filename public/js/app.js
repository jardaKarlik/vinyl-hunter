/* ── Vinyl Hunter — Frontend App ─────────────────────────────────────── */

const App = (() => {

  const STATE = {
    tracks: [],
    selected: new Set(),
    results: [],
    wantlisted: new Set(),
  };

  // ── Utils ───────────────────────────────────────────────────────────────
  function esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function toast(msg, dur = 3000) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), dur);
  }

  function vinyl(spinning) {
    document.getElementById('vinylDisc').classList.toggle('spinning', spinning);
  }

  function content() { return document.getElementById('content'); }

  function log(el, msg, type = '') {
    const d = document.createElement('div');
    d.className = 'log-line' + (type ? ' ' + type : '');
    const prefix = { info:'→ ', success:'✓ ', warn:'⚠ ', error:'✗ ' }[type] || '  ';
    d.textContent = prefix + msg;
    el.appendChild(d);
    d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ── API helpers ─────────────────────────────────────────────────────────
  async function api(endpoint, body) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  // ── STEP 1: Extract tracks ───────────────────────────────────────────────
  async function start() {
    const url = document.getElementById('urlInput').value.trim();
    if (!url) { document.getElementById('urlInput').focus(); return; }

    document.getElementById('searchBtn').disabled = true;
    vinyl(true);
    STATE.tracks = [];
    STATE.selected.clear();
    STATE.results = [];
    STATE.wantlisted.clear();

    content().innerHTML = `
      <div class="card">
        <div class="status-row">
          <div class="step-dot active">1</div>
          <div class="step-label active">Extracting tracks from YouTube</div>
          <div class="spinner" style="margin-left:auto"></div>
        </div>
        <div id="extractLog"></div>
        <div class="progress-bar" style="margin-top:10px">
          <div class="progress-fill indeterminate"></div>
        </div>
      </div>`;

    const logEl = document.getElementById('extractLog');
    log(logEl, 'Sending to Claude AI…', 'info');

    try {
      const data = await api('/api/extract-tracks', { url });
      if (!data.tracks?.length) throw new Error('No tracks found in video');

      log(logEl, `Found ${data.tracks.length} track${data.tracks.length !== 1 ? 's' : ''}`, 'success');
      STATE.tracks = data.tracks;
      data.tracks.forEach((_, i) => STATE.selected.add(i));

      vinyl(false);
      renderSelectStep();
    } catch (err) {
      log(logEl, err.message, 'error');
      log(logEl, 'Try pasting the video description manually below', 'warn');
      renderManualFallback(logEl);
      document.getElementById('searchBtn').disabled = false;
      vinyl(false);
    }
  }

  function renderManualFallback(logEl) {
    const div = document.createElement('div');
    div.style.marginTop = '10px';
    div.innerHTML = `
      <label class="field-label">Paste video description or tracklist</label>
      <textarea id="manualText" style="
        width:100%; min-height:80px; resize:vertical;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:6px; color:var(--text); font-family:var(--mono);
        font-size:12px; padding:9px 12px; outline:none; margin-top:4px;
      " placeholder="00:00 Artist - Track&#10;03:45 Artist - Track&#10;..."></textarea>
      <div style="margin-top:8px">
        <button class="btn btn-primary" onclick="App.parseManual()">Parse Tracklist</button>
      </div>`;
    logEl.appendChild(div);
  }

  async function parseManual() {
    const text = document.getElementById('manualText')?.value || '';
    if (!text.trim()) return;
    const logEl = document.getElementById('extractLog');
    log(logEl, 'Parsing manually…', 'info');
    try {
      const data = await api('/api/extract-tracks', { description: text });
      if (!data.tracks?.length) throw new Error('Could not parse any tracks');
      log(logEl, `Parsed ${data.tracks.length} tracks`, 'success');
      STATE.tracks = data.tracks;
      data.tracks.forEach((_, i) => STATE.selected.add(i));
      vinyl(false);
      renderSelectStep();
    } catch (err) {
      log(logEl, 'Failed: ' + err.message, 'error');
    }
  }

  // ── STEP 2: Select tracks ────────────────────────────────────────────────
  function renderSelectStep() {
    const items = STATE.tracks.map((t, i) => `
      <div class="track-item selected" id="ti${i}" onclick="App.toggleTrack(${i})">
        <span class="track-num">${String(i+1).padStart(2,'0')}</span>
        <div class="track-info">
          <div class="track-title">${esc(t.title)}</div>
          ${t.artist ? `<div class="track-artist">${esc(t.artist)}${t.album ? ' · ' + esc(t.album) : ''}</div>` : ''}
        </div>
        <div class="track-check"></div>
      </div>`).join('');

    content().innerHTML = `
      <div class="card card-accent">
        <div class="status-row" style="margin-bottom:.75rem">
          <div class="step-dot done">✓</div>
          <div class="step-label active">${STATE.tracks.length} tracks found</div>
        </div>
        <div class="select-controls">
          <button class="btn btn-ghost btn-sm" onclick="App.selAll()">All</button>
          <button class="btn btn-ghost btn-sm" onclick="App.selNone()">None</button>
          <span class="select-count" id="selCount">${STATE.tracks.length} selected</span>
        </div>
        <div class="track-list">${items}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:.9rem">
          <button class="btn btn-primary" onclick="App.searchDiscogs()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Search Discogs
          </button>
          <button class="btn btn-ghost btn-sm" onclick="App.reset()">↩ Start over</button>
        </div>
      </div>`;
  }

  function toggleTrack(i) {
    if (STATE.selected.has(i)) STATE.selected.delete(i);
    else STATE.selected.add(i);
    document.getElementById('ti' + i)?.classList.toggle('selected', STATE.selected.has(i));
    document.getElementById('selCount').textContent = STATE.selected.size + ' selected';
  }

  function selAll() {
    STATE.tracks.forEach((_, i) => { STATE.selected.add(i); document.getElementById('ti' + i)?.classList.add('selected'); });
    document.getElementById('selCount').textContent = STATE.selected.size + ' selected';
  }

  function selNone() {
    STATE.tracks.forEach((_, i) => { STATE.selected.delete(i); document.getElementById('ti' + i)?.classList.remove('selected'); });
    document.getElementById('selCount').textContent = '0 selected';
  }

  // ── STEP 3: Discogs search ───────────────────────────────────────────────
  async function searchDiscogs() {
    if (!STATE.selected.size) return;

    const selected = [...STATE.selected].map(i => STATE.tracks[i]);
    vinyl(true);

    content().innerHTML = `
      <div class="card">
        <div class="status-row">
          <div class="step-dot active">2</div>
          <div class="step-label active">Searching Discogs marketplace…</div>
          <div class="spinner" style="margin-left:auto"></div>
        </div>
        <div id="searchLog"></div>
        <div class="progress-bar" style="margin-top:10px">
          <div class="progress-fill indeterminate"></div>
        </div>
        <p style="font-size:10px;color:var(--muted);margin-top:8px">
          Fetching releases + EU listings for ${selected.length} tracks — may take ~${Math.ceil(selected.length * 1.5)}s…
        </p>
      </div>`;

    const logEl = document.getElementById('searchLog');
    log(logEl, `Searching ${selected.length} track${selected.length!==1?'s':''}…`, 'info');
    log(logEl, 'EU sellers only (excl. UK) · M / NM / VG+ / VG grades', 'info');

    try {
      const data = await api('/api/search-discogs', { tracks: selected });
      log(logEl, `Done — ${data.results.filter(r=>r.sellers?.length).length} tracks with EU sellers found`, 'success');
      STATE.results = data.results;
      vinyl(false);
      renderResults();
    } catch (err) {
      log(logEl, 'Search failed: ' + err.message, 'error');
      vinyl(false);
      content().innerHTML += `
        <div style="margin-top:.75rem;display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" onclick="App.searchDiscogs()">↺ Retry</button>
          <button class="btn btn-ghost btn-sm" onclick="App.reset()">↩ Start over</button>
        </div>`;
    }
  }

  // ── STEP 4: Render results ───────────────────────────────────────────────
  function renderResults() {
    const results = STATE.results;
    let totalBest = 0, countBest = 0, withSeller = 0;
    results.forEach(r => {
      if (r.bestPrice) { totalBest += r.bestPrice; countBest++; withSeller++; }
    });

    const GRADE_SHORT = {
      'Mint (M)': 'M',
      'Near Mint (NM or M-)': 'NM',
      'Very Good Plus (VG+)': 'VG+',
      'Very Good (VG)': 'VG'
    };

    const cards = results.map((r, ri) => {
      const thumb = r.thumb
        ? `<img class="result-thumb" src="${esc(r.thumb)}" loading="lazy" onerror="this.outerHTML='<div class=result-thumb-ph>♪</div>'">`
        : `<div class="result-thumb-ph">♪</div>`;

      const badges = [
        r.sellers?.length
          ? `<span class="badge badge-green">EU seller found</span>`
          : `<span class="badge badge-red">no EU seller</span>`,
        r.numForSale ? `<span class="badge badge-muted">${r.numForSale} for sale</span>` : '',
        r.lowestPrice ? `<span class="badge badge-blue">from €${(+r.lowestPrice).toFixed(2)}</span>` : '',
        r.bestPrice   ? `<span class="badge badge-accent">best €${(+r.bestPrice).toFixed(2)}</span>` : '',
        STATE.wantlisted.has(ri) ? `<span class="badge badge-green">♥ wantlisted</span>` : '',
      ].filter(Boolean).join('');

      const fallUrl = `https://www.discogs.com/sell/list?q=${encodeURIComponent((r.artist||'')+' '+(r.title||''))}&format=Vinyl`;

      const sellersHtml = r.sellers?.length
        ? r.sellers.map((s, si) => `
            <div class="seller-row">
              <span class="seller-rank${si===0?' star':''}">
                ${si===0 ? '★' : si+1}
              </span>
              <div class="seller-info">
                <div class="seller-name">${esc(s.seller)}</div>
                <div class="seller-meta">${esc(s.country||'')}${s.rating ? ' · ' + s.rating + '%' : ''}</div>
              </div>
              <span class="seller-grade">${esc(GRADE_SHORT[s.grade] || s.grade)}</span>
              <span class="seller-price">€${(+s.price).toFixed(2)}</span>
              <a class="view-link" href="${esc(s.listingUrl)}" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                View
              </a>
            </div>`)
          .join('')
        : `<div class="no-sellers">No EU sellers with M–VG grade — <a href="${fallUrl}" target="_blank" rel="noopener">browse manually ↗</a></div>`;

      const wantBtn = r.releaseId ? `
        <button
          class="want-btn-inline"
          id="wb${ri}"
          onclick="App.addWantlist(${ri}, ${r.releaseId})"
          title="Add to Wantlist"
        >♥</button>` : '';

      return `
        <div class="result-card${r.sellers?.length ? ' has-seller' : ''}" id="rc${ri}">
          <div class="result-head">
            ${thumb}
            <div class="result-meta">
              <div class="result-title">${esc(r.releaseTitle || r.title)}</div>
              <div class="result-sub">${[r.artist, r.year, r.format].filter(Boolean).map(esc).join(' · ')}</div>
              <div class="badge-row">${badges}</div>
            </div>
            ${wantBtn}
          </div>
          <div class="sellers-body">
            <div class="sellers-head">EU sellers · closest to CZ + cheapest first</div>
            ${sellersHtml}
          </div>
        </div>`;
    }).join('');

    const hasAnySeller = results.some(r => r.sellers?.length);

    content().innerHTML = `
      <div class="card card-green" style="margin-bottom:.9rem">
        <div class="status-row">
          <div class="step-dot done-g">✓</div>
          <div class="step-label active">Search complete</div>
          <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="App.searchDiscogs()">↺ Re-search</button>
        </div>
      </div>

      <div class="stats-bar">
        <div class="stat">
          <div class="stat-label">Tracks</div>
          <div class="stat-value">${results.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">EU sellers</div>
          <div class="stat-value">${withSeller}</div>
          <div class="stat-sub">${results.length - withSeller} unavailable</div>
        </div>
        <div class="stat">
          <div class="stat-label">Best total</div>
          <div class="stat-value">€${totalBest.toFixed(2)}</div>
          <div class="stat-sub">sum of ★ listings</div>
        </div>
        <div class="stat">
          <div class="stat-label">Avg/track</div>
          <div class="stat-value">${countBest ? '€' + (totalBest/countBest).toFixed(2) : '—'}</div>
        </div>
      </div>

      ${hasAnySeller ? `
      <div class="action-panel">
        <div class="action-label">Bulk actions</div>
        <div class="action-btns">
          <button class="btn btn-green" id="wantAllBtn" onclick="App.addAllWantlist()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            Add All to Wantlist
          </button>
        </div>
        <div id="bulkProg"></div>
      </div>` : ''}

      ${cards}

      <div style="text-align:center;margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border)">
        <p style="font-size:10px;color:var(--muted);line-height:1.9;margin-bottom:.75rem">
          ★ = best EU listing (closest to CZ + lowest price)<br>
          ♥ adds release to your Discogs wantlist as LeeCZ<br>
          Grades accepted: M · NM · VG+ · VG only
        </p>
        <button class="btn btn-ghost btn-sm" onclick="App.reset()">↩ Search a new URL</button>
      </div>`;
  }

  // ── Wantlist ─────────────────────────────────────────────────────────────
  async function addWantlist(ri, releaseId) {
    const btn = document.getElementById('wb' + ri);
    if (!btn || STATE.wantlisted.has(ri)) return;
    btn.disabled = true;
    btn.textContent = '…';

    try {
      const data = await api('/api/wantlist-add', { releaseId });
      if (data.ok) {
        STATE.wantlisted.add(ri);
        btn.textContent = '✓';
        btn.classList.add('done');
        document.getElementById('rc' + ri)?.classList.add('wantlisted');
        toast('♥ Added to wantlist: ' + (STATE.results[ri]?.title || 'release'));
      } else {
        btn.textContent = '✗';
        btn.style.color = 'var(--red)';
        toast('Failed to add to wantlist');
      }
    } catch (err) {
      btn.textContent = '✗';
      btn.style.color = 'var(--red)';
      toast('Error: ' + err.message);
    }
  }

  async function addAllWantlist() {
    const btn = document.getElementById('wantAllBtn');
    const prog = document.getElementById('bulkProg');
    if (btn) btn.disabled = true;

    const toAdd = STATE.results
      .map((r, i) => ({ r, i }))
      .filter(({ r, i }) => r.releaseId && r.sellers?.length && !STATE.wantlisted.has(i));

    if (!toAdd.length) {
      toast('Nothing new to add');
      if (btn) btn.disabled = false;
      return;
    }

    for (let j = 0; j < toAdd.length; j++) {
      const { r, i } = toAdd[j];
      if (prog) prog.innerHTML = `
        <div class="bulk-progress">
          <div class="spinner green"></div>
          Adding ${j+1}/${toAdd.length}: ${esc(r.title)}…
        </div>`;
      await addWantlist(i, r.releaseId);
      await new Promise(res => setTimeout(res, 350));
    }

    if (prog) prog.innerHTML = `
      <div class="bulk-progress">
        <span style="color:var(--green)">✓</span>
        All ${toAdd.length} releases added to wantlist as LeeCZ
      </div>`;
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function reset() {
    STATE.tracks = [];
    STATE.selected.clear();
    STATE.results = [];
    STATE.wantlisted.clear();
    content().innerHTML = '';
    document.getElementById('urlInput').value = '';
    document.getElementById('searchBtn').disabled = false;
    vinyl(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Enter key on input ────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('urlInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') start();
    });

    // Health check on load
    fetch('/api/health')
      .then(r => r.json())
      .then(d => {
        const chip = document.getElementById('userChip');
        if (chip && d.ok) {
          chip.textContent = `⬤ ${d.user} connected`;
        }
      })
      .catch(() => {});
  });

  return { start, parseManual, toggleTrack, selAll, selNone, searchDiscogs, addWantlist, addAllWantlist, reset };

})();
