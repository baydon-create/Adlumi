// Meta Ad Library (facebook.com/ads/library): adds a "days running" badge and Save
// buttons to every ad card, plus a floating "Save all visible" action.
(() => {
  const A = window.__adspy;
  const OWN = ['facebook.com', 'fb.com', 'fbcdn.net', 'messenger.com', 'fb.me', 'instagram.com'];
  const ID_RE = /Library ID:?\s*(\d{6,})/i;
  const START_RE = /Started running on\s+([A-Z][a-z]{2,8}\.? \d{1,2},? \d{4}|\d{1,2} [A-Z][a-z]{2,8}\.? \d{4})/;
  const DAY = 86400000;

  const cards = new Map(); // libraryId -> { el, ad }
  const saved = new Set();

  const isLibrary = () => location.pathname.startsWith('/ads/library');

  function idLabels() {
    const snap = document.evaluate(
      "//span[contains(text(),'Library ID')] | //div[contains(text(),'Library ID')]",
      document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
    );
    return Array.from({ length: snap.snapshotLength }, (_, i) => snap.snapshotItem(i));
  }

  // The card is the largest ancestor that still contains exactly one "Library ID".
  function cardFor(label) {
    let el = label;
    for (let depth = 0; depth < 14 && el.parentElement; depth++) {
      const parent = el.parentElement;
      if ((parent.textContent.match(/Library ID/g) || []).length !== 1) break;
      if (parent.getBoundingClientRect().height > 1800) break;
      el = parent;
    }
    return el;
  }

  function toIsoDate(s) {
    const t = Date.parse(s.replace('.', ''));
    return Number.isNaN(t) ? '' : new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function extract(card, libraryId) {
    const raw = card.innerText || '';
    const startedRunning = toIsoDate(raw.match(START_RE)?.[1] || '');
    const active = /\bInactive\b/.test(raw) ? false : /\bActive\b/.test(raw) ? true : undefined;
    const advLink = [...card.querySelectorAll('a[href]')].find((a) => {
      const href = a.getAttribute('href') || '';
      const t = A.text(a);
      return t.length > 1 && t.length < 90 && /facebook\.com\/(?!ads\/)|^\/(?!ads\/)[\w.]+\/?/.test(href);
    });
    const creativeUses = raw.match(/(\d+)\s+ads? use this creative/i)?.[1];
    return {
      id: `fb-lib-${libraryId}`,
      platform: 'adlibrary',
      source: 'adlibrary',
      advertiser: A.text(advLink),
      advertiserUrl: advLink ? advLink.href.split('?')[0] : '',
      text: A.longest(card.querySelectorAll('div[style*="pre-wrap"], div[style*="pre-line"]')),
      headline: '',
      cta: A.findCta(card),
      landingUrl: A.findLanding(card, OWN),
      postUrl: `https://www.facebook.com/ads/library/?id=${libraryId}`,
      startedRunning,
      active,
      ...A.collectMedia(card, 120),
      extra: {
        libraryId,
        multipleVersions: /multiple versions/i.test(raw),
        adsUsingCreative: creativeUses ? Number(creativeUses) : undefined,
      },
    };
  }

  function daysRunning(ad) {
    if (!ad.startedRunning) return null;
    return Math.max(1, Math.round((Date.now() - Date.parse(ad.startedRunning)) / DAY));
  }

  let styled = false;
  function injectStyle() {
    if (styled) return;
    styled = true;
    const s = document.createElement('style');
    s.textContent = `
      .adspy-lib-bar{display:flex;gap:6px;align-items:center;padding:6px 8px;margin:0 0 6px;border-radius:8px;background:#f3f0ff;font:600 12px system-ui,sans-serif;color:#2b1d72}
      .adspy-lib-bar .pill{padding:3px 8px;border-radius:999px;background:#fff;border:1px solid #d8d0ff}
      .adspy-lib-bar .pill.hot{background:#ffefe0;border-color:#ffc58f;color:#8a3b00}
      .adspy-lib-bar button{margin-left:auto;cursor:pointer;border:0;border-radius:6px;padding:5px 10px;background:#6d4aff;color:#fff;font:600 12px system-ui}
      .adspy-lib-bar button.saved{background:#e9e4ff;color:#3b2a8f}
      #adspy-save-all[disabled]{opacity:.7;cursor:default}
      #adspy-save-all{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:999px;padding:12px 18px;background:#6d4aff;color:#fff;font:700 13px system-ui;box-shadow:0 6px 20px rgba(60,30,180,.35);cursor:pointer}`;
    document.documentElement.appendChild(s);
  }

  function save(libraryId) {
    const entry = cards.get(libraryId);
    if (!entry) return;
    entry.ad = extract(entry.el, libraryId); // re-extract: media may have lazy-loaded
    // Re-saving an existing ad refreshes its landing page, media and status without counting a new sighting.
    A.send(entry.ad, null, saved.has(libraryId) ? 'ad:refresh' : 'ad:capture');
    saved.add(libraryId);
    markSavedButton(entry.el);
    updateSaveAll();
  }

  function markSavedButton(card) {
    const btn = card.querySelector('.adspy-lib-bar button');
    if (!btn) return;
    btn.textContent = 'Saved ✓ · Update';
    btn.title = 'Already in your library. Click to refresh its landing page, media and status.';
    btn.classList.add('saved');
  }

  function decorate(card, libraryId, ad) {
    if (card.querySelector('.adspy-lib-bar')) return;
    const bar = document.createElement('div');
    bar.className = 'adspy-lib-bar';
    const days = daysRunning(ad);
    if (days != null) {
      const pill = document.createElement('span');
      pill.className = `pill${days >= 30 ? ' hot' : ''}`;
      pill.textContent = `${days >= 30 ? '🔥 ' : '🕒 '}Running ${days} day${days === 1 ? '' : 's'}`;
      pill.title = 'Long-running ads are usually profitable ones';
      bar.appendChild(pill);
    }
    if (ad.extra.adsUsingCreative > 1) {
      const pill = document.createElement('span');
      pill.className = 'pill';
      pill.textContent = `${ad.extra.adsUsingCreative} ad variations`;
      bar.appendChild(pill);
    }
    const btn = document.createElement('button');
    btn.textContent = 'Save to AdSpy';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      save(libraryId);
    });
    bar.appendChild(btn);
    card.prepend(bar);
    if (saved.has(libraryId)) markSavedButton(card);
  }

  function updateSaveAll() {
    let btn = document.getElementById('adspy-save-all');
    const pending = [...cards.keys()].filter((id) => !saved.has(id));
    if (!isLibrary() || !cards.size) return btn?.remove();
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'adspy-save-all';
      btn.addEventListener('click', () => [...cards.keys()].filter((id) => !saved.has(id)).forEach(save));
      document.body.appendChild(btn);
    }
    btn.textContent = pending.length ? `Save all visible (${pending.length})` : `All ${cards.size} saved ✓`;
    btn.disabled = !pending.length;
  }

  function markAlreadySaved(ids) {
    try {
      chrome.runtime.sendMessage({ type: 'ads:has', ids: ids.map((id) => `fb-lib-${id}`) }, (res) => {
        if (chrome.runtime.lastError || !res?.ids) return;
        res.ids.forEach((full) => {
          const id = full.replace('fb-lib-', '');
          saved.add(id);
          const entry = cards.get(id);
          if (!entry) return;
          markSavedButton(entry.el);
          // Keep saved ads current (exact landing page, fresh media, active status) while they're on screen.
          A.send(extract(entry.el, id), null, 'ad:refresh');
        });
        updateSaveAll();
      });
    } catch {}
  }

  function scan() {
    injectStyle();
    const fresh = [];
    for (const label of idLabels()) {
      const libraryId = label.textContent.match(ID_RE)?.[1];
      if (!libraryId) continue;
      const known = cards.get(libraryId);
      if (known && known.el.isConnected && known.el.querySelector('.adspy-lib-bar')) continue;
      const el = cardFor(label);
      const ad = extract(el, libraryId);
      cards.set(libraryId, { el, ad });
      decorate(el, libraryId, ad);
      if (!known) fresh.push(libraryId);
    }
    for (const [id, { el }] of cards) if (!el.isConnected) cards.delete(id);
    if (fresh.length) markAlreadySaved(fresh);
    updateSaveAll();
  }

  A.register({ platform: 'adlibrary', active: isLibrary, scan });
})();
