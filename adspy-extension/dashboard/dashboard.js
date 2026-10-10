import * as db from '../src/lib/db.js';
import { PLATFORMS, getSettings, saveSettings } from '../src/lib/settings.js';
import { analyzeLanding } from './analyze.js';

const DAY = 86400000;
const PAGE = 60;
const $ = (sel) => document.querySelector(sel);

/** Tiny DOM builder: h('div', { class: 'x', onclick }, child, 'text'). Never uses innerHTML. */
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

// replaceChildren() would render null/false/'' as text; skip them like h() does.
const setChildren = (node, ...children) => node.replaceChildren(...children.flat().filter((c) => c != null && c !== false && c !== ''));

const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : null);

function runningDays(ad) {
  if (ad.startedRunning) {
    const end = ad.active === false ? ad.lastSeen : Date.now();
    return Math.max(1, Math.round((end - Date.parse(ad.startedRunning)) / DAY));
  }
  return Math.max(1, Math.round((ad.lastSeen - ad.firstSeen) / DAY) + 1);
}

function runningLabel(ad) {
  const d = runningDays(ad);
  if (ad.startedRunning) return { text: `${d >= 30 ? '🔥 ' : ''}Running ${d}d`, hot: d >= 30 };
  return d > 1 ? { text: `Seen over ${d}d`, hot: d >= 14 } : null;
}

// ======================= state =======================
let ADS = [];
let filtered = [];
let shown = 0;
const thumbUrls = new Map(); // ad id -> object URL

async function loadAds() {
  ADS = await db.allAds();
  $('#nav-count').textContent = ADS.length ? ADS.length.toLocaleString() : '';
}

// ======================= library view =======================
function readFilters() {
  return {
    q: $('#f-q').value.trim().toLowerCase(),
    platform: $('#f-platform').value,
    media: $('#f-media').value,
    cta: $('#f-cta').value,
    sort: $('#f-sort').value,
    from: $('#f-from').valueAsNumber || null,
    to: $('#f-to').valueAsNumber ? $('#f-to').valueAsNumber + DAY : null,
    minDays: Number($('#f-days').value) || 0,
    minSeen: Number($('#f-seen').value) || 0,
    tag: $('#f-tag').value.trim().toLowerCase(),
    fav: $('#f-fav').checked,
    active: $('#f-active').checked,
  };
}

const haystack = (ad) =>
  [ad.advertiser, ad.headline, ad.text, ad.landingDomain, ad.landingUrl, ad.cta, ad.notes, ad.extra?.keyword, ...(ad.tags || [])]
    .join(' ')
    .toLowerCase();

function applyFilters() {
  const f = readFilters();
  const terms = f.q.split(/\s+/).filter(Boolean);
  filtered = ADS.filter((ad) => {
    if (f.platform && ad.platform !== f.platform) return false;
    if (f.media && ad.mediaType !== f.media) return false;
    if (f.cta && ad.cta !== f.cta) return false;
    if (f.fav && !ad.favorite) return false;
    if (f.active && ad.active !== true) return false;
    if (f.from && ad.lastSeen < f.from) return false;
    if (f.to && ad.firstSeen >= f.to) return false;
    if (f.minSeen && (ad.seenCount || 1) < f.minSeen) return false;
    if (f.minDays && runningDays(ad) < f.minDays) return false;
    if (f.tag && !(ad.tags || []).some((t) => t.toLowerCase().includes(f.tag))) return false;
    if (terms.length) {
      const hs = haystack(ad);
      if (!terms.every((t) => hs.includes(t))) return false;
    }
    return true;
  });
  const sorters = {
    lastSeen: (a, b) => b.lastSeen - a.lastSeen,
    firstSeen: (a, b) => b.firstSeen - a.firstSeen,
    oldest: (a, b) => a.firstSeen - b.firstSeen,
    seenCount: (a, b) => (b.seenCount || 1) - (a.seenCount || 1),
    running: (a, b) => runningDays(b) - runningDays(a),
    advertiser: (a, b) => (a.advertiser || '').localeCompare(b.advertiser || ''),
  };
  filtered.sort(sorters[f.sort] || sorters.lastSeen);
  shown = 0;
  $('#grid').replaceChildren();
  renderMore();
}

function renderMore() {
  const grid = $('#grid');
  const next = filtered.slice(shown, shown + PAGE);
  if (!filtered.length) {
    grid.replaceChildren(
      h('div', { class: 'empty-state' },
        ADS.length
          ? 'No ads match these filters.'
          : 'No ads yet. Scroll your Facebook, Instagram, YouTube, LinkedIn, Reddit or X feed — or run a Google search — and captured ads show up here.')
    );
  }
  next.forEach((ad) => grid.append(card(ad)));
  shown += next.length;
  $('#more').hidden = shown >= filtered.length;
  $('#result-count').textContent = `${filtered.length.toLocaleString()} of ${ADS.length.toLocaleString()} ads`;
}

async function thumbFor(ad) {
  if (thumbUrls.has(ad.id)) return thumbUrls.get(ad.id);
  const blob = await db.getThumb(ad.id).catch(() => null);
  const url = blob ? URL.createObjectURL(blob) : safeUrl(ad.mediaUrls?.[0]);
  thumbUrls.set(ad.id, url);
  return url;
}

function placeholder(ad) {
  return h('div', { class: 'ph' }, ad.headline || ad.text || ad.landingDomain || 'No preview');
}

function card(ad, { onSave } = {}) {
  const platform = PLATFORMS[ad.platform] || { label: ad.platform, color: '#666' };
  const thumb = h('div', { class: 'thumb' }, placeholder(ad));
  thumbFor(ad).then((src) => {
    if (!src) return;
    const img = h('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.onerror = () => img.remove();
    img.onload = () => thumb.querySelector('.ph')?.remove();
    thumb.prepend(img);
  });
  thumb.append(h('span', { class: 'chip', style: { background: platform.color } }, platform.label));
  if (ad.mediaType && ad.mediaType !== 'text') thumb.append(h('span', { class: 'fmt' }, ad.mediaType));

  if (onSave) {
    thumb.append(h('button', { class: 'star', title: 'Save to library', onclick: (e) => (e.stopPropagation(), onSave(e.currentTarget)) }, '＋'));
  } else {
    const star = h('button', { class: `star${ad.favorite ? ' on' : ''}`, title: 'Favorite' }, '★');
    star.addEventListener('click', async (e) => {
      e.stopPropagation();
      ad.favorite = !ad.favorite;
      star.classList.toggle('on', ad.favorite);
      await db.putAd(ad);
    });
    thumb.append(star);
  }

  const running = runningLabel(ad);
  const meta = h('div', { class: 'meta' },
    running && h('span', { class: `pill${running.hot ? ' hot' : ''}` }, running.text),
    !onSave && (ad.seenCount || 1) > 1 && h('span', { class: 'pill', title: 'Times you were shown this ad' }, `Seen ×${ad.seenCount}`),
    ad.cta && h('span', { class: 'pill cta' }, ad.cta),
    ad.landingDomain && h('span', { class: 'pill' }, ad.landingDomain),
    ad.extra?.keyword && h('span', { class: 'pill', title: 'Search keyword' }, `🔑 ${ad.extra.keyword}`),
    ad.active === false && h('span', { class: 'pill' }, 'Inactive')
  );

  return h('article', { class: 'card', onclick: () => (onSave ? window.open(ad.postUrl, '_blank', 'noopener') : openDrawer(ad.id)) },
    thumb,
    h('div', { class: 'card-body' },
      h('div', { class: 'adv' }, ad.advertiser || ad.landingDomain || 'Unknown advertiser'),
      h('div', { class: 'copy' }, ad.headline ? `${ad.headline} — ${ad.text || ''}` : ad.text || ''),
      meta,
      !onSave && h('div', { class: 'pill', style: { justifySelf: 'start', background: 'none', padding: 0 } }, `Found ${fmtDate(ad.firstSeen)}`)
    )
  );
}

function fillFilterOptions() {
  const platformSel = $('#f-platform');
  const present = new Set(ADS.map((a) => a.platform));
  platformSel.replaceChildren(h('option', { value: '' }, 'All platforms'),
    ...Object.entries(PLATFORMS).filter(([k]) => present.has(k)).map(([k, p]) => h('option', { value: k }, p.label)));
  const ctas = [...new Set(ADS.map((a) => a.cta).filter(Boolean))].sort();
  const ctaSel = $('#f-cta');
  const cur = ctaSel.value;
  ctaSel.replaceChildren(h('option', { value: '' }, 'Any CTA'), ...ctas.map((c) => h('option', { value: c }, c)));
  ctaSel.value = cur;
}

// ======================= detail drawer =======================
async function openDrawer(id) {
  const ad = ADS.find((a) => a.id === id) || (await db.getAd(id));
  if (!ad) return;
  history.replaceState(null, '', `#ad=${encodeURIComponent(id)}`);
  const drawer = $('#drawer');
  const platform = PLATFORMS[ad.platform] || { label: ad.platform, color: '#666' };
  const save = () => db.putAd(ad);

  const gallery = h('div', { class: 'gallery' });
  const thumb = await thumbFor(ad);
  const urls = [...new Set([thumb, ...(ad.mediaUrls || []).map(safeUrl)].filter(Boolean))];
  urls.forEach((src) => {
    const img = h('img', { src, alt: '', referrerpolicy: 'no-referrer' });
    img.onerror = () => img.remove();
    gallery.append(img);
  });

  const fact = (label, value) => (value || value === 0 ? [h('dt', {}, label), h('dd', {}, value)] : []);
  const link = (u, text) => (safeUrl(u) ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, text || u) : null);
  const eng = ad.extra?.engagement && Object.entries(ad.extra.engagement).map(([k, v]) => `${v} ${k}`).join(' · ');

  const analysisBox = h('div', { class: 'analysis', hidden: !ad.extra?.landing });
  if (ad.extra?.landing) renderAnalysis(analysisBox, ad.extra.landing);

  const analyzeBtn = h('button', { class: 'ghost', disabled: !safeUrl(ad.landingUrl) }, '🔬 Analyze landing page');
  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Analyzing…';
    analysisBox.hidden = false;
    analysisBox.replaceChildren('Fetching landing page…');
    try {
      ad.extra = { ...(ad.extra || {}), landing: await analyzeLanding(ad.landingUrl) };
      await save();
      renderAnalysis(analysisBox, ad.extra.landing);
    } catch (err) {
      analysisBox.replaceChildren(`Could not analyze: ${err.message}`);
    }
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = '🔬 Re-analyze landing page';
  });

  const adLibSearch = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=keyword_unordered&q=${encodeURIComponent(ad.advertiser || ad.landingDomain || '')}`;

  const tags = h('input', { type: 'text', value: (ad.tags || []).join(', '), placeholder: 'competitor, ugc, black-friday' });
  tags.addEventListener('change', () => {
    ad.tags = tags.value.split(',').map((t) => t.trim()).filter(Boolean);
    save();
  });
  const notes = h('textarea', { placeholder: 'Why is this ad interesting? Hook, angle, offer…' });
  notes.value = ad.notes || '';
  notes.addEventListener('change', () => ((ad.notes = notes.value), save()));

  const fav = h('button', { class: 'ghost' }, ad.favorite ? '★ Favorited' : '☆ Favorite');
  fav.addEventListener('click', () => {
    ad.favorite = !ad.favorite;
    fav.textContent = ad.favorite ? '★ Favorited' : '☆ Favorite';
    save();
  });

  setChildren(drawer,
    h('header', {},
      h('span', { class: 'pill', style: { background: platform.color, color: '#fff' } }, platform.label),
      h('h2', {}, ad.advertiser || ad.landingDomain || 'Unknown advertiser'),
      h('button', { class: 'close', title: 'Close', onclick: closeDrawer }, '✕')
    ),
    urls.length ? gallery : null,
    ad.headline && h('h3', { style: { textTransform: 'none', fontSize: '15px', color: 'var(--text)' } }, ad.headline),
    ad.text && h('div', { class: 'adtext' }, ad.text),
    h('dl', { class: 'facts' },
      fact('Advertiser', link(ad.advertiserUrl, ad.advertiser) || ad.advertiser),
      fact('Call to action', ad.cta),
      fact('Landing page', link(ad.landingUrl)),
      fact('Format', ad.mediaType),
      fact('Placement', ad.extra?.placement?.replace(/_/g, ' ')),
      fact('Search keyword', ad.extra?.keyword),
      fact('Started running', ad.startedRunning && `${fmtDate(Date.parse(ad.startedRunning))} (${runningDays(ad)} days)`),
      fact('Status', ad.active === true ? 'Active' : ad.active === false ? 'Inactive' : null),
      fact('Ad variations', ad.extra?.adsUsingCreative),
      fact('Reach (EU)', ad.extra?.euReach?.toLocaleString?.()),
      fact('Engagement', eng),
      fact('First seen', fmtDate(ad.firstSeen)),
      fact('Last seen', fmtDate(ad.lastSeen)),
      fact('Times seen', ad.seenCount),
      fact('Library ID', ad.extra?.libraryId)
    ),
    h('div', { class: 'actions' },
      safeUrl(ad.postUrl) && h('a', { class: 'ghost', href: ad.postUrl, target: '_blank', rel: 'noopener' }, 'Open ad ↗'),
      safeUrl(ad.landingUrl) && h('a', { class: 'ghost', href: ad.landingUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Landing page ↗'),
      h('a', { class: 'ghost', href: adLibSearch, target: '_blank', rel: 'noopener' }, 'All their ads in Meta Ad Library ↗'),
      h('button', { class: 'ghost', onclick: (e) => copyText(e.currentTarget, [ad.headline, ad.text].filter(Boolean).join('\n\n')) }, 'Copy ad copy'),
      fav,
      analyzeBtn
    ),
    analysisBox,
    h('label', { class: 'field' }, 'Tags (comma separated)', tags),
    h('label', { class: 'field' }, 'Notes', notes),
    h('div', { class: 'actions' },
      h('button', {
        class: 'danger',
        onclick: async () => {
          if (!confirm('Delete this ad from your library?')) return;
          await db.deleteAd(ad.id);
          ADS = ADS.filter((a) => a.id !== ad.id);
          closeDrawer();
          applyFilters();
        },
      }, 'Delete ad')
    )
  );
  drawer.querySelectorAll('a.ghost').forEach((a) => (a.style.textDecoration = 'none'));
  drawer.hidden = false;
  $('#drawer-backdrop').hidden = false;
}

function renderAnalysis(box, r) {
  const tagRow = (label, items) =>
    items?.length ? h('div', {}, h('b', {}, label), h('div', { class: 'tags' }, items.map((t) => h('span', { class: 'pill' }, t)))) : null;
  setChildren(box,
    h('b', {}, r.title || r.finalUrl),
    r.description && h('div', { class: 'sub' }, r.description),
    tagRow('Built with', r.platform),
    tagRow('Tracking & pixels', r.tracking),
    tagRow('Apps & tools', r.apps),
    tagRow('Prices on page', r.prices),
    tagRow('Offers', r.offers),
    r.shopify && h('div', { style: { marginTop: '8px' } },
      h('b', {}, `Shopify store: ${r.shopify.products}${r.shopify.products === 250 ? '+' : ''} products`),
      r.shopify.minPrice != null && h('div', { class: 'sub' }, `Price range ${r.shopify.minPrice} – ${r.shopify.maxPrice}`),
      r.shopify.newest?.length && h('div', { class: 'sub' }, 'Newest products: ',
        ...r.shopify.newest.flatMap((p, i) => [i ? ', ' : '', h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, p.title)]))
    ),
    h('div', { class: 'sub', style: { marginTop: '6px' } }, `Analyzed ${new Date(r.analyzedAt).toLocaleString()}`)
  );
}

function closeDrawer() {
  $('#drawer').hidden = true;
  $('#drawer-backdrop').hidden = true;
  if (location.hash.startsWith('#ad=')) history.replaceState(null, '', location.pathname);
}

async function copyText(btn, text) {
  await navigator.clipboard.writeText(text);
  const prev = btn.textContent;
  btn.textContent = 'Copied ✓';
  setTimeout(() => (btn.textContent = prev), 1200);
}

// ======================= Meta Ad Library API =======================
const API_FIELDS = [
  'id', 'page_id', 'page_name', 'ad_creation_time', 'ad_delivery_start_time', 'ad_delivery_stop_time',
  'ad_creative_bodies', 'ad_creative_link_titles', 'ad_creative_link_descriptions', 'ad_creative_link_captions',
  'ad_snapshot_url', 'publisher_platforms', 'languages', 'eu_total_reach',
].join(',');
let apiNext = null;

function fromApi(a) {
  const caption = a.ad_creative_link_captions?.[0] || '';
  return {
    id: `fb-lib-${a.id}`,
    platform: 'adlibrary',
    source: 'api',
    advertiser: a.page_name || '',
    advertiserUrl: a.page_id ? `https://www.facebook.com/${a.page_id}` : '',
    text: a.ad_creative_bodies?.[0] || '',
    headline: a.ad_creative_link_titles?.[0] || '',
    cta: '',
    landingUrl: /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(caption) ? `https://${caption.toLowerCase()}` : '',
    landingDomain: /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(caption) ? caption.toLowerCase().replace(/^www\./, '') : '',
    postUrl: `https://www.facebook.com/ads/library/?id=${a.id}`,
    startedRunning: (a.ad_delivery_start_time || '').slice(0, 10),
    active: !a.ad_delivery_stop_time,
    mediaType: 'text',
    mediaUrls: [],
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    extra: {
      libraryId: a.id,
      publisherPlatforms: a.publisher_platforms,
      languages: a.languages,
      euReach: a.eu_total_reach,
      description: a.ad_creative_link_descriptions?.[0],
    },
  };
}

async function apiSearch(more = false) {
  const status = $('#api-status-line');
  const settings = await getSettings();
  if (!settings.graphToken) {
    status.replaceChildren('Add your Meta access token in ', h('a', { href: '#', onclick: (e) => (e.preventDefault(), show('settings')) }, 'Settings'), ' first.');
    return;
  }
  let url = apiNext;
  if (!more) {
    const countries = $('#api-country').value.toUpperCase().split(/[\s,]+/).filter(Boolean);
    const p = new URLSearchParams({
      search_terms: $('#api-q').value.trim(),
      ad_reached_countries: JSON.stringify(countries.length ? countries : ['DE']),
      ad_active_status: $('#api-status').value,
      ad_type: $('#api-type').value,
      fields: API_FIELDS,
      limit: '30',
      access_token: settings.graphToken,
    });
    if ($('#api-platform').value) p.set('publisher_platforms', JSON.stringify([$('#api-platform').value]));
    url = `https://graph.facebook.com/${encodeURIComponent(settings.graphVersion || 'v23.0')}/ads_archive?${p}`;
    $('#api-results').replaceChildren();
  }
  status.textContent = 'Searching…';
  try {
    const json = await (await fetch(url)).json();
    if (json.error) throw new Error(json.error.message);
    const ads = (json.data || []).map(fromApi);
    const savedIds = new Set((await Promise.all(ads.map((a) => db.getAd(a.id)))).filter(Boolean).map((a) => a.id));
    for (const ad of ads) {
      $('#api-results').append(
        card(ad, {
          onSave: async (btn) => {
            await db.upsertAd(ad);
            btn.textContent = '✓';
            btn.classList.add('on');
            await loadAds();
          },
        })
      );
      if (savedIds.has(ad.id)) $('#api-results').lastChild.querySelector('.star').classList.add('on');
    }
    apiNext = json.paging?.next || null;
    $('#api-more').hidden = !apiNext;
    status.textContent = `${$('#api-results').children.length} ads loaded. Click a card to open it in the Ad Library, ＋ to save it.`;
  } catch (err) {
    status.textContent = `Meta API error: ${err.message}`;
  }
}

// ======================= insights =======================
function countBy(list, key) {
  const m = new Map();
  for (const item of list) {
    const k = typeof key === 'function' ? key(item) : item[key];
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function bars(target, entries, { limit = 10, label = (k) => k, onClick } = {}) {
  const top = entries.slice(0, limit);
  const max = Math.max(1, ...top.map(([, v]) => v));
  target.replaceChildren(
    ...(top.length
      ? top.map(([k, v]) =>
          h('div', { class: `bar${onClick ? ' link' : ''}`, onclick: onClick && (() => onClick(k)), title: label(k) },
            h('div', { class: 'label' }, h('i', { style: { width: `${(v / max) * 100}%` } }), h('span', {}, label(k))),
            h('b', {}, v.toLocaleString())))
      : [h('div', { class: 'sub' }, 'No data yet')])
  );
}

function searchLibrary(q) {
  $('#f-q').value = q;
  show('library');
  applyFilters();
}

function renderInsights() {
  const now = Date.now();
  const week = ADS.filter((a) => a.firstSeen > now - 7 * DAY).length;
  const advertisers = new Set(ADS.map((a) => a.advertiser).filter(Boolean)).size;
  const long = ADS.filter((a) => runningDays(a) >= 30).length;
  $('#kpis').replaceChildren(
    ...[
      [ADS.length, 'Ads in library'],
      [week, 'New this week'],
      [advertisers, 'Advertisers'],
      [long, 'Running 30+ days'],
      [ADS.filter((a) => a.favorite).length, 'Favorites'],
    ].map(([v, l]) => h('div', { class: 'kpi' }, h('b', {}, v.toLocaleString()), h('span', {}, l)))
  );

  const days = Array.from({ length: 30 }, (_, i) => {
    const start = new Date(now - (29 - i) * DAY);
    start.setHours(0, 0, 0, 0);
    return { start: start.getTime(), n: 0 };
  });
  for (const ad of ADS) {
    const idx = days.findIndex((d) => ad.firstSeen >= d.start && ad.firstSeen < d.start + DAY);
    if (idx >= 0) days[idx].n++;
  }
  const maxDay = Math.max(1, ...days.map((d) => d.n));
  $('#ch-daily').replaceChildren(
    ...days.map((d) => h('div', { style: { height: `${(d.n / maxDay) * 100}%` }, title: `${fmtDate(d.start)}: ${d.n} ads` }))
  );

  bars($('#ch-adv'), countBy(ADS, 'advertiser'), { onClick: searchLibrary });
  bars($('#ch-dom'), countBy(ADS, 'landingDomain'), { onClick: searchLibrary });
  bars($('#ch-plat'), countBy(ADS, 'platform'), {
    label: (k) => PLATFORMS[k]?.label || k,
    onClick: (k) => (($('#f-platform').value = k), show('library'), applyFilters()),
  });
  bars($('#ch-cta'), countBy(ADS, 'cta'));
  bars($('#ch-media'), countBy(ADS, 'mediaType'));
  bars($('#ch-kw'), countBy(ADS, (a) => a.extra?.keyword), { onClick: searchLibrary });
  const longest = [...ADS].sort((a, b) => runningDays(b) - runningDays(a)).slice(0, 10);
  bars($('#ch-long'), longest.map((a) => [a.id, runningDays(a)]), {
    label: (id) => {
      const a = ADS.find((x) => x.id === id);
      return `${a.advertiser || a.landingDomain || '?'} — ${(a.headline || a.text || '').slice(0, 60)}`;
    },
    onClick: openDrawer,
  });
}

// ======================= settings & data =======================
async function renderSettings() {
  const s = await getSettings();
  $('#s-enabled').checked = !s.paused;
  $('#s-badges').checked = s.badges;
  $('#s-thumbs').checked = s.thumbnails;
  $('#s-token').value = s.graphToken;
  $('#s-version').value = s.graphVersion;
  $('#s-platforms').replaceChildren(
    ...Object.entries(PLATFORMS).map(([k, p]) => {
      const input = h('input', { type: 'checkbox' });
      input.checked = s.platforms[k] !== false;
      input.addEventListener('change', async () => {
        const cur = await getSettings();
        saveSettings({ platforms: { ...cur.platforms, [k]: input.checked } });
      });
      return h('label', { class: 'row' }, h('span', {}, `Capture on ${p.label}`), h('span', { class: 'switch' }, input, h('span')));
    })
  );
}

function bindSettings() {
  $('#s-enabled').addEventListener('change', (e) => saveSettings({ paused: !e.target.checked }));
  $('#s-badges').addEventListener('change', (e) => saveSettings({ badges: e.target.checked }));
  $('#s-thumbs').addEventListener('change', (e) => saveSettings({ thumbnails: e.target.checked }));
  $('#s-token').addEventListener('change', (e) => saveSettings({ graphToken: e.target.value.trim() }));
  $('#s-version').addEventListener('change', (e) => saveSettings({ graphVersion: e.target.value.trim() || 'v23.0' }));

  $('#export-json').addEventListener('click', () => download('adspy-ads.json', JSON.stringify(ADS, null, 2), 'application/json'));
  $('#export-csv').addEventListener('click', () => download('adspy-ads.csv', toCsv(ADS), 'text/csv'));
  $('#export-filtered').addEventListener('click', () => download('adspy-results.csv', toCsv(filtered), 'text/csv'));
  $('#import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const valid = (Array.isArray(data) ? data : []).filter((a) => a && typeof a.id === 'string' && typeof a.platform === 'string');
      await db.bulkPut(valid);
      await refresh();
      $('#data-status').textContent = `Imported ${valid.length} ads.`;
    } catch (err) {
      $('#data-status').textContent = `Import failed: ${err.message}`;
    }
    e.target.value = '';
  });
  $('#clear').addEventListener('click', async () => {
    if (!confirm(`Permanently delete all ${ADS.length} saved ads?`)) return;
    await db.clearAll();
    await refresh();
    $('#data-status').textContent = 'All data deleted.';
  });
}

const CSV_COLUMNS = ['id', 'platform', 'advertiser', 'headline', 'text', 'cta', 'landingUrl', 'landingDomain', 'mediaType',
  'postUrl', 'startedRunning', 'active', 'firstSeen', 'lastSeen', 'seenCount', 'favorite', 'tags', 'notes', 'keyword', 'mediaUrl'];

function toCsv(list) {
  const cell = (v) => {
    const s = v == null ? '' : String(v);
    // Leading =,+,-,@ would be evaluated as formulas by spreadsheet apps
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = list.map((a) => CSV_COLUMNS.map((c) => {
    if (c === 'firstSeen' || c === 'lastSeen') return cell(a[c] ? new Date(a[c]).toISOString() : '');
    if (c === 'tags') return cell((a.tags || []).join('; '));
    if (c === 'keyword') return cell(a.extra?.keyword);
    if (c === 'mediaUrl') return cell(a.mediaUrls?.[0]);
    return cell(a[c]);
  }).join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  h('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ======================= navigation & boot =======================
function show(view) {
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'insights') renderInsights();
  if (view === 'settings') renderSettings();
}

async function refresh() {
  await loadAds();
  fillFilterOptions();
  applyFilters();
  if (!$('#view-insights').hidden) renderInsights();
}

function routeHash() {
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === 'welcome') $('#welcome').hidden = false;
  if (hash.startsWith('q=')) {
    $('#f-q').value = hash.slice(2);
    applyFilters();
  }
  if (hash.startsWith('ad=')) openDrawer(hash.slice(3));
}

async function boot() {
  document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
  let debounce;
  $('#f-q').addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(applyFilters, 150);
  });
  document.querySelectorAll('.filters select, .more-grid input').forEach((i) => i.addEventListener('change', applyFilters));
  $('#more').addEventListener('click', renderMore);
  $('#welcome-close').addEventListener('click', () => ($('#welcome').hidden = true));
  $('#drawer-backdrop').addEventListener('click', closeDrawer);
  addEventListener('keydown', (e) => e.key === 'Escape' && closeDrawer());
  $('#api-form').addEventListener('submit', (e) => {
    e.preventDefault();
    apiSearch(false);
  });
  $('#api-more').addEventListener('click', () => apiSearch(true));
  bindSettings();

  // New captures arrive from the service worker while the dashboard is open.
  let pending;
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'ads:changed') return;
    clearTimeout(pending);
    pending = setTimeout(async () => {
      if (!$('#drawer').hidden) return; // don't reshuffle the grid under an open drawer
      const before = shown;
      await refresh();
      while (shown < before && shown < filtered.length) renderMore();
    }, 1500);
  });

  await refresh();
  routeHash();
  addEventListener('hashchange', routeHash);
}

boot();
