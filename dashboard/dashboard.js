import * as db from '../src/lib/db.js';
import { PLATFORMS, getSettings, saveSettings } from '../src/lib/settings.js';
import { analyzeLanding } from './analyze.js';
import * as E from '../src/lib/estimates.js';
import { renderMarket } from './insights.js';

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

const runningDays = (ad) => E.runningDays(ad);

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const money = (v) => (v == null || !Number.isFinite(v) ? '—' : `$${v < 10 ? v.toFixed(2) : compact.format(v)}`);
const num = (v) => (v == null || !Number.isFinite(v) ? '—' : v < 10 ? (Math.round(v * 10) / 10).toString() : compact.format(Math.round(v)));
const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(d)}%`);

// ---- estimates (cached per ad version + settings version)
let SETTINGS = {};
let settingsVersion = 0;
const estCache = new Map();
function cached(kind, ad, fn) {
  const key = `${kind}|${ad.id}|${ad.lastSeen}|${ad.extra?.landing?.analyzedAt || ''}|${ad.extra?.industry || ''}|${settingsVersion}`;
  if (!estCache.has(key)) estCache.set(key, fn());
  return estCache.get(key);
}
const est = (ad) => cached('e', ad, () => E.estimate(ad, SETTINGS));
const scoreOf = (ad) => cached('s', ad, () => E.winningScore(ad));
async function loadSettings() {
  SETTINGS = await getSettings();
  settingsVersion++;
  estCache.clear();
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
    industry: $('#f-industry').value,
    minScore: Number($('#f-score').value) || 0,
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
    if (f.industry && est(ad).industry.key !== f.industry) return false;
    if (f.minScore && scoreOf(ad).score < f.minScore) return false;
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
    score: (a, b) => scoreOf(b).score - scoreOf(a).score,
    spend: (a, b) => (est(b).spend?.mid || 0) - (est(a).spend?.mid || 0),
    engagement: (a, b) => (E.engagementStats(b).perDay ?? -1) - (E.engagementStats(a).perDay ?? -1),
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
      await db.saveUserFields(ad);
    });
    thumb.append(star);
  }

  const running = runningLabel(ad);
  const score = scoreOf(ad).score;
  const e = est(ad);
  const eng = E.engagementStats(ad);
  const meta = h('div', { class: 'meta' },
    h('span', { class: `score s${score >= 70 ? 'hi' : score >= 45 ? 'mid' : 'lo'}`, title: 'Winning score (0–100)' }, `⚡ ${score}`),
    e.spend && h('span', { class: `pill${e.confidenceScore < 0.25 ? ' weak' : ''}`, title: `Est. spend ${money(e.spend.lo)}–${money(e.spend.hi)} · ${e.confidence} confidence` }, `~${money(e.spend.mid)} spent`),
    eng.hasData && h('span', { class: 'pill', title: 'Visible engagements' }, `💬 ${num(eng.total)}`),
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
  const indSel = $('#f-industry');
  if (indSel.options.length <= 1) {
    indSel.append(...Object.values(E.INDUSTRY_BY_KEY).map((i) => h('option', { value: i.key }, i.label)));
  }
  const platformSel = $('#f-platform');
  const curPlatform = platformSel.value;
  const present = new Set(ADS.map((a) => a.platform));
  platformSel.replaceChildren(h('option', { value: '' }, 'All platforms'),
    ...Object.entries(PLATFORMS).filter(([k]) => present.has(k)).map(([k, p]) => h('option', { value: k }, p.label)));
  platformSel.value = present.has(curPlatform) ? curPlatform : '';
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
  const save = () => db.saveUserFields(ad);

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
      openDrawer(ad.id); // landing prices feed the order-value estimate
      return;
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

  const onIndustry = async (key) => {
    ad.extra = { ...(ad.extra || {}), industry: key || undefined };
    await save();
    openDrawer(ad.id);
  };

  setChildren(drawer,
    h('header', {},
      h('span', { class: 'pill', style: { background: platform.color, color: '#fff' } }, platform.label),
      h('h2', {}, ad.advertiser || ad.landingDomain || 'Unknown advertiser'),
      h('button', { class: 'close', title: 'Close', onclick: closeDrawer }, '✕')
    ),
    urls.length ? gallery : null,
    ad.headline && h('h3', { style: { textTransform: 'none', fontSize: '15px', color: 'var(--text)' } }, ad.headline),
    ad.text && h('div', { class: 'adtext' }, ad.text),
    performanceSection(ad, onIndustry),
    engagementSection(ad),
    audienceSection(ad),
    messagingSection(ad),
    h('h3', { class: 'sec' }, 'Details'),
    h('dl', { class: 'facts' },
      fact('Advertiser', link(ad.advertiserUrl, ad.advertiser) || ad.advertiser),
      fact('Call to action', ad.cta),
      fact('Landing page', ad.extra?.landingDomainOnly
        ? h('span', {}, link(ad.landingUrl), h('span', { class: 'sub' }, ' (domain only: Meta\'s API doesn\'t give the exact page. Open the ad in the Ad Library and click Save to get it.)'))
        : link(ad.landingUrl)),
      fact('Format', ad.mediaType),
      fact('Placement', ad.extra?.placement?.replace(/_/g, ' ')),
      fact('Search keyword', ad.extra?.keyword),
      fact('Started running', ad.startedRunning && `${fmtDate(Date.parse(ad.startedRunning))} (${runningDays(ad)} days)`),
      fact('Status', ad.active === true ? 'Active' : ad.active === false ? 'Inactive' : null),
      fact('Ad variations', ad.extra?.adsUsingCreative),
      fact('Reach (EU)', ad.extra?.euReach?.toLocaleString?.()),
      fact('First seen', fmtDate(ad.firstSeen)),
      fact('Last seen', fmtDate(ad.lastSeen)),
      fact('Times seen', ad.seenCount),
      fact('Library ID', ad.extra?.libraryId)
    ),
    h('div', { class: 'actions' },
      safeUrl(ad.postUrl) && h('a', { class: 'ghost', href: ad.postUrl, target: '_blank', rel: 'noopener' }, 'Open ad ↗'),
      safeUrl(ad.landingUrl) && h('a', { class: 'ghost', href: ad.landingUrl, target: '_blank', rel: 'noopener noreferrer' }, ad.extra?.landingDomainOnly ? 'Website (domain only) ↗' : 'Landing page ↗'),
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

function rangeRow(label, r, fmt, hint) {
  return h('tr', { title: hint || '' },
    h('th', {}, label),
    h('td', { class: 'num' }, r ? fmt(r.lo) : '—'),
    h('td', { class: 'num likely' }, r ? fmt(r.mid) : '—'),
    h('td', { class: 'num' }, r ? fmt(r.hi) : '—'));
}

function performanceSection(ad, onIndustry) {
  const e = est(ad);
  const s = scoreOf(ad);
  const industrySel = h('select', { title: 'Correct the industry to use the right benchmarks' },
    ...Object.values(E.INDUSTRY_BY_KEY).map((i) => h('option', { value: i.key }, i.label)));
  industrySel.value = e.industry.key;
  industrySel.addEventListener('change', () => onIndustry(industrySel.value));
  const goal = e.goal;
  const tier = (v) => (v >= 70 ? 'hi' : v >= 45 ? 'mid' : 'lo');
  return h('section', { class: 'perf' },
    h('h3', { class: 'sec' }, 'Performance estimate'),
    h('div', { class: 'perf-head' },
      h('div', { class: `ring s${tier(s.score)}`, style: { '--p': s.score } }, h('b', {}, s.score)),
      h('div', { class: 'factors' },
        h('b', {}, 'Winning score'),
        ...s.factors.map((f) => h('div', { class: 'factor', title: `${f.label}: ${f.detail} (weight ${f.weight})` },
          h('span', {}, f.label), h('i', {}, h('u', { style: { width: `${f.value * 100}%` } })), h('em', {}, f.detail))))),
    h('div', { class: 'perf-meta' },
      h('span', { class: `conf c-${e.confidence.toLowerCase().replace(' ', '-')}` }, `${e.confidence} confidence`),
      h('span', { class: 'pill' }, `Signal: ${e.method}`),
      h('span', { class: 'pill' }, `Market: ${e.country}`),
      h('label', { class: 'pill ind' }, 'Industry ', industrySel)),
    h('table', { class: 'est' },
      h('thead', {}, h('tr', {}, h('th'), h('th', { class: 'num' }, 'Low'), h('th', { class: 'num' }, 'Likely'), h('th', { class: 'num' }, 'High'))),
      h('tbody', {},
        rangeRow('Impressions', e.impressions, num),
        rangeRow('Spend to date', e.spend, money),
        rangeRow('Daily spend', e.dailySpend, money, `Spend to date ÷ ${e.days} days`),
        rangeRow('CPM', e.cpm, money),
        rangeRow('CTR', e.ctr, (v) => pct(v, 2)),
        rangeRow('Clicks', e.clicks, num),
        rangeRow('CPC', e.cpc, money),
        rangeRow(`Conv. rate (${goal})`, e.cvr, (v) => pct(v, 1)),
        rangeRow(`${goal[0].toUpperCase()}${goal.slice(1)}s`, e.conversions, num),
        rangeRow(`Cost per ${goal}`, e.cpa, money),
        e.aov && rangeRow('Order value', e.aov, money),
        e.revenue && rangeRow('Revenue', e.revenue, money),
        e.roas && rangeRow(e.roas.survivalAdjusted ? 'ROAS (survival-adjusted)' : 'ROAS', e.roas, (v) => `${v.toFixed(2)}×`))),
    h('details', { class: 'basis' }, h('summary', {}, 'How this was estimated'),
      h('ul', {}, e.basis.map((b) => h('li', {}, b))),
      h('p', { class: 'sub' }, 'Ranges are ~90% intervals. To sharpen them: correct the industry, set your market and benchmarks in Settings, analyze the landing page (real prices), or save the ad via Meta Ad Search (EU reach).')));
}

function sparkline(points, w = 220, hgt = 44) {
  if (points.length < 2) return null;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const vmin = Math.min(...points.map((p) => p.total));
  const vmax = Math.max(...points.map((p) => p.total), vmin + 1);
  const xy = points.map((p) => [((p.t - t0) / (t1 - t0 || 1)) * (w - 4) + 2, hgt - 2 - ((p.total - vmin) / (vmax - vmin)) * (hgt - 4)]);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('class', 'spark');
  const line = document.createElementNS(svg.namespaceURI, 'polyline');
  line.setAttribute('points', xy.map((p) => p.join(',')).join(' '));
  svg.append(line);
  return svg;
}

function engagementSection(ad) {
  const s = E.engagementStats(ad);
  if (!s.hasData && s.views == null) return null;
  const e = ad.extra?.engagement || {};
  const stat = (label, v, fmt = num) => (v == null ? null : h('div', { class: 'kpi' }, h('b', {}, fmt(v)), h('span', {}, label)));
  return h('section', {},
    h('h3', { class: 'sec' }, 'Engagement'),
    h('div', { class: 'kpis mini' },
      stat('Reactions', e.reactions), stat('Likes', e.reactions == null ? e.likes : null), stat('Comments', e.comments),
      stat('Shares', e.shares), stat('Views', e.views), stat('Bookmarks', e.bookmarks),
      stat('Per day (avg)', s.perDay), stat('Per day (measured)', s.velocity),
      stat('Comment share', s.commentShare, (v) => pct(v, 0)), stat('Share rate', s.shareShare, (v) => pct(v, 0))),
    s.history.length >= 2 && h('div', { class: 'spark-wrap' }, sparkline(s.history), h('span', { class: 'sub' }, `${s.history.length} snapshots since ${fmtDate(s.history[0].t)}`)),
    s.commentShare > 0.3 && h('p', { class: 'sub' }, 'A high comment share often signals purchase questions, objections, or controversy. Read the comments for objections you can address in your own ads.'),
    s.shareShare > 0.15 && h('p', { class: 'sub' }, 'A high share rate means people pass this one on. It is a strong sign the angle resonates.'));
}

function audienceSection(ad) {
  const a = ad.extra?.audience;
  const t = ad.extra?.targeting;
  if (!a && !t) return null;
  const sum = (o) => Object.values(o || {}).reduce((x, y) => x + y, 0) || 1;
  const list = (o) => Object.entries(o || {}).sort((x, y) => y[1] - x[1]);
  return h('section', {},
    h('h3', { class: 'sec' }, 'Audience (reported by Meta)'),
    t && h('div', { class: 'tags' },
      t.ages && h('span', { class: 'pill' }, `Targeted ages: ${t.ages}`),
      t.gender && h('span', { class: 'pill' }, `Gender: ${t.gender}`),
      ...(t.locations || []).slice(0, 8).map((l) => h('span', { class: 'pill' }, `📍 ${l}`)),
      t.payer && h('span', { class: 'pill' }, `Paid by: ${t.payer}`)),
    a?.ages && h('div', { class: 'bars' }, list(a.ages).map(([k, v]) =>
      h('div', { class: 'bar' }, h('div', { class: 'label' }, h('i', { style: { width: `${(v / sum(a.ages)) * 100}%` } }), h('span', {}, k)), h('b', {}, pct(v / sum(a.ages), 0))))),
    a?.genders && h('p', { class: 'sub' }, list(a.genders).map(([k, v]) => `${k} ${pct(v / sum(a.genders), 0)}`).join(' · ')),
    a?.countries && h('p', { class: 'sub' }, `Top countries: ${list(a.countries).slice(0, 6).map(([k, v]) => `${k} (${num(v)})`).join(', ')}`));
}

function messagingSection(ad) {
  const angles = E.anglesOf(ad);
  const offers = E.offersOf(ad);
  const hook = E.hookOf(ad);
  if (!angles.length && !offers.length && !hook) return null;
  return h('section', {},
    h('h3', { class: 'sec' }, 'Messaging breakdown'),
    hook && h('p', {}, h('b', {}, 'Hook: '), hook),
    angles.length && h('div', { class: 'tags' }, angles.map((a) => h('span', { class: 'pill cta' }, a))),
    offers.length && h('div', { class: 'tags', style: { marginTop: '6px' } }, offers.map((o) => h('span', { class: 'pill hot' }, o))));
}

/** Generic drawer for other modules (competitor deep dive). */
function showDrawer(...children) {
  setChildren($('#drawer'), ...children);
  $('#drawer').scrollTop = 0;
  $('#drawer').hidden = false;
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
      r.shopify.minPrice != null && h('div', { class: 'sub' }, `Price range ${r.shopify.minPrice} – ${r.shopify.maxPrice}${r.shopify.currency ? ` ${r.shopify.currency}` : ''}`),
      r.shopify.newest?.length && h('div', { class: 'sub' }, 'Newest products: ',
        ...r.shopify.newest.flatMap((p, i) => [i ? ', ' : '', h('a', { href: p.url, target: '_blank', rel: 'noopener noreferrer' }, p.title)]))
    ),
    h('div', { class: 'sub', style: { marginTop: '6px' } }, `Analyzed ${new Date(r.analyzedAt).toLocaleString()}`)
  );
}

let refreshPending = false;
async function liveRefresh() {
  refreshPending = false;
  const before = shown;
  const scrollY = window.scrollY;
  await refresh();
  while (shown < before && shown < filtered.length) renderMore();
  window.scrollTo(0, scrollY);
}

function closeDrawer() {
  $('#drawer').hidden = true;
  $('#drawer-backdrop').hidden = true;
  if (location.hash.startsWith('#ad=')) history.replaceState(null, '', location.pathname);
  if (refreshPending) liveRefresh();
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
  'ad_snapshot_url', 'publisher_platforms', 'languages',
].join(',');
// EU transparency + political disclosure fields; not available to every token/ad type.
const API_EXTRA_FIELDS = [
  'eu_total_reach', 'target_ages', 'target_gender', 'target_locations', 'age_country_gender_reach_breakdown',
  'beneficiary_payers', 'spend', 'impressions', 'currency', 'demographic_distribution', 'delivery_by_region', 'estimated_audience_size',
].join(',');

/** Collapses Meta's per-country age/gender breakdowns into compact totals. */
function compactAudience(a) {
  const ages = {};
  const genders = {};
  const countries = {};
  for (const c of a.age_country_gender_reach_breakdown || []) {
    for (const b of c.age_gender_breakdowns || []) {
      const total = (b.male || 0) + (b.female || 0) + (b.unknown || 0);
      ages[b.age_range] = (ages[b.age_range] || 0) + total;
      genders.male = (genders.male || 0) + (b.male || 0);
      genders.female = (genders.female || 0) + (b.female || 0);
      if (b.unknown) genders.unknown = (genders.unknown || 0) + b.unknown;
      countries[c.country] = (countries[c.country] || 0) + total;
    }
  }
  for (const d of a.demographic_distribution || []) {
    const share = parseFloat(d.percentage) || 0;
    ages[d.age] = (ages[d.age] || 0) + share;
    genders[d.gender] = (genders[d.gender] || 0) + share;
  }
  for (const r of a.delivery_by_region || []) countries[r.region] = (countries[r.region] || 0) + (parseFloat(r.percentage) || 0);
  return Object.keys(ages).length || Object.keys(countries).length ? { ages, genders, countries } : undefined;
}
let apiNext = null;
let COUNTRIES_SEARCHED = [];

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
      landingDomainOnly: true, // the API exposes the display domain, never the full destination URL
      publisherPlatforms: a.publisher_platforms,
      languages: a.languages,
      euReach: a.eu_total_reach,
      description: a.ad_creative_link_descriptions?.[0],
      countries: COUNTRIES_SEARCHED,
      spend: a.spend,
      impressions: a.impressions,
      currency: a.currency,
      audienceSize: a.estimated_audience_size,
      audience: compactAudience(a),
      targeting: a.target_ages || a.target_gender || a.target_locations || a.beneficiary_payers
        ? {
            ages: Array.isArray(a.target_ages) ? a.target_ages.join('–') : a.target_ages,
            gender: a.target_gender,
            locations: (a.target_locations || []).map((l) => l.name).filter(Boolean),
            payer: a.beneficiary_payers?.[0]?.payer,
          }
        : undefined,
    },
  };
}

const EU_UK = new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE GB UK IS LI NO'.split(' '));

/** Turns Meta's API errors into what they mean for the user. */
function explainApiError(err) {
  const msg = err?.message || String(err);
  const code = err?.code;
  if (code === 190 || /access token|session has expired|OAuthException.*expired/i.test(msg))
    return 'Your Meta access token is invalid or has expired. Generate a new one in the Graph API Explorer (and extend it in the Access Token Debugger), then paste it in Settings.';
  if (code === 10 || code === 200 || /does not have permission|not authorized|permission/i.test(msg))
    return 'Meta hasn\'t approved this account for the Ad Library API yet. Go to facebook.com/ads/library/api, click "Get started" and complete identity confirmation (it can take 1–2 days), then generate a new token.';
  if (code === 4 || code === 17 || code === 613 || /rate limit|too many calls/i.test(msg))
    return 'Meta\'s rate limit was reached. Wait a few minutes and try again.';
  return `Meta API error: ${msg}`;
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
    COUNTRIES_SEARCHED = countries.length ? countries : ['DE'];
    if ($('#api-type').value === 'ALL' && !COUNTRIES_SEARCHED.some((c) => EU_UK.has(c))) {
      status.replaceChildren(
        `Meta's API only returns commercial ads delivered in the EU/UK, so a search in ${COUNTRIES_SEARCHED.join(', ')} returns political/issue ads only. `,
        h('a', { href: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${encodeURIComponent(COUNTRIES_SEARCHED[0])}&q=${encodeURIComponent($('#api-q').value.trim())}&search_type=keyword_unordered`, target: '_blank', rel: 'noopener' }, 'Open this search on the Ad Library website'),
        ' and use "Save all visible" instead. It has every ad for that country.'
      );
      return;
    }
    const p = new URLSearchParams({
      search_terms: $('#api-q').value.trim(),
      ad_reached_countries: JSON.stringify(countries.length ? countries : ['DE']),
      ad_active_status: $('#api-status').value,
      ad_type: $('#api-type').value,
      fields: `${API_FIELDS},${API_EXTRA_FIELDS}`,
      limit: '30',
      access_token: settings.graphToken,
    });
    if ($('#api-platform').value) p.set('publisher_platforms', JSON.stringify([$('#api-platform').value]));
    url = `https://graph.facebook.com/${encodeURIComponent(settings.graphVersion || 'v23.0')}/ads_archive?${p}`;
    $('#api-results').replaceChildren();
  }
  status.textContent = 'Searching…';
  try {
    let json = await (await fetch(url)).json();
    if (json.error && !more && /field|permission/i.test(json.error.message)) {
      // Some tokens/ad types reject the transparency fields; retry with the core set.
      const retry = new URL(url);
      retry.searchParams.set('fields', API_FIELDS);
      json = await (await fetch(retry)).json();
    }
    if (json.error) throw Object.assign(new Error(json.error.message), { code: json.error.code });
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
    status.textContent = explainApiError(err);
  }
}

// ======================= insights =======================
const marketCtx = {
  h, setChildren, openDrawer, showDrawer, closeDrawer, est, scoreOf, fmtDate, money, num, pct, download,
  toCsvRows: (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n'),
};
function renderInsights() {
  renderMarket($('#market'), marketCtx, ADS);
}

// ======================= settings & data =======================
async function renderSettings() {
  const s = await getSettings();
  $('#s-enabled').checked = !s.paused;
  $('#s-badges').checked = s.badges;
  $('#s-thumbs').checked = s.thumbnails;
  $('#s-token').value = s.graphToken;
  $('#s-version').value = s.graphVersion;
  $('#s-country').value = s.marketCountry || '';
  $('#s-cpm').value = s.cpmOverride || '';
  $('#s-cvr').value = s.cvrOverride || '';
  $('#s-aov').value = s.aovOverride || '';
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
  const model = async (patch) => {
    await saveSettings(patch);
    await loadSettings();
    applyFilters();
  };
  $('#s-country').addEventListener('change', (e) => model({ marketCountry: e.target.value.trim().toUpperCase() || 'US' }));
  $('#s-cpm').addEventListener('change', (e) => model({ cpmOverride: e.target.value }));
  $('#s-cvr').addEventListener('change', (e) => model({ cvrOverride: e.target.value }));
  $('#s-aov').addEventListener('change', (e) => model({ aovOverride: e.target.value }));

  $('#export-json').addEventListener('click', () => download('adlumi-ads.json', JSON.stringify(ADS, null, 2), 'application/json'));
  $('#export-csv').addEventListener('click', () => download('adlumi-ads.csv', toCsv(ADS), 'text/csv'));
  $('#export-filtered').addEventListener('click', () => download('adlumi-results.csv', toCsv(filtered), 'text/csv'));
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
  'postUrl', 'startedRunning', 'active', 'firstSeen', 'lastSeen', 'seenCount', 'favorite', 'tags', 'notes', 'keyword', 'mediaUrl',
  'winningScore', 'industry', 'daysRunning', 'reactions', 'comments', 'shares', 'views', 'estImpressions', 'estSpendLow', 'estSpend',
  'estSpendHigh', 'estCpm', 'estCpc', 'estCpa', 'estRoas', 'estConfidence', 'estMethod', 'angles', 'offers'];

function csvCell(v) {
  const s = v == null ? '' : String(v);
  // Leading =,+,-,@ would be evaluated as formulas by spreadsheet apps
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(list) {
  const cell = csvCell;
  const rows = list.map((a) => CSV_COLUMNS.map((c) => {
    if (c === 'firstSeen' || c === 'lastSeen') return cell(a[c] ? new Date(a[c]).toISOString() : '');
    if (c === 'tags') return cell((a.tags || []).join('; '));
    if (c === 'keyword') return cell(a.extra?.keyword);
    if (c === 'mediaUrl') return cell(a.mediaUrls?.[0]);
    const e = est(a);
    const r = (x) => (x ? Math.round(x.mid * 100) / 100 : '');
    const derived = {
      winningScore: scoreOf(a).score, industry: e.industry.label, daysRunning: e.days,
      reactions: a.extra?.engagement?.reactions ?? a.extra?.engagement?.likes, comments: a.extra?.engagement?.comments,
      shares: a.extra?.engagement?.shares, views: a.extra?.engagement?.views,
      estImpressions: e.impressions ? Math.round(e.impressions.mid) : '', estSpendLow: e.spend ? Math.round(e.spend.lo) : '',
      estSpend: r(e.spend), estSpendHigh: e.spend ? Math.round(e.spend.hi) : '', estCpm: r(e.cpm), estCpc: r(e.cpc), estCpa: r(e.cpa),
      estRoas: r(e.roas), estConfidence: e.confidence, estMethod: e.method, angles: E.anglesOf(a).join('; '), offers: E.offersOf(a).join('; '),
    };
    if (c in derived) return cell(derived[c]);
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
  document.querySelectorAll('#view-library .filters select, .more-grid input, .more-grid select').forEach((i) => i.addEventListener('change', applyFilters));
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
    pending = setTimeout(() => {
      // Don't reshuffle the grid under an open drawer; closeDrawer() runs it instead.
      if (!$('#drawer').hidden) refreshPending = true;
      else liveRefresh();
    }, 1500);
  });

  await loadSettings();
  await refresh();
  routeHash();
  addEventListener('hashchange', routeHash);
}

boot();
