// Market intelligence: share of voice, competitor deep dives, and what messaging,
// offers and creative formats correlate with winning (long-running, scaling) ads.
import * as E from '../src/lib/estimates.js';
import { PLATFORMS } from '../src/lib/settings.js';

const DAY = E.DAY;
let C; // context from dashboard.js: { h, setChildren, openDrawer, showDrawer, est, scoreOf, fmtDate, money, num, pct, download, toCsvRows }
const scope = { q: '', platform: '', industry: '', period: '0', minScore: 0 };
let latestAds = [];

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const top = (counts, n = 1) => [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
const tally = (items) => items.reduce((m, k) => (k ? m.set(k, (m.get(k) || 0) + 1) : m), new Map());
const hasEmoji = (s) => /\p{Extended_Pictographic}/u.test(s || '');

// ---------------------------------------------------------------- enrichment
function enrich(ads) {
  return ads.map((ad) => {
    const e = C.est(ad);
    const s = C.scoreOf(ad);
    const eng = E.engagementStats(ad);
    return {
      ad, e, score: s.score, eng,
      days: E.runningDays(ad),
      angles: E.anglesOf(ad),
      offers: E.offersOf(ad),
      prices: E.pricePoints(ad),
      spendMid: e.spend?.mid || 0,
      spendLo: e.spend?.lo || 0,
      spendHi: e.spend?.hi || 0,
      dailyMid: e.dailySpend?.mid || 0,
      launched: ad.startedRunning ? Date.parse(ad.startedRunning) : ad.firstSeen,
    };
  });
}

function inScope(row) {
  const { ad } = row;
  if (scope.platform && ad.platform !== scope.platform) return false;
  if (scope.industry && row.e.industry.key !== scope.industry) return false;
  if (scope.period !== '0' && ad.lastSeen < Date.now() - Number(scope.period) * DAY) return false;
  if (scope.minScore && row.score < scope.minScore) return false;
  if (scope.q) {
    const hs = [ad.advertiser, ad.headline, ad.text, ad.landingDomain, ad.extra?.keyword].join(' ').toLowerCase();
    if (!scope.q.split(/\s+/).every((t) => hs.includes(t))) return false;
  }
  return true;
}

// ---------------------------------------------------------------- UI helpers
function section(title, subtitle, ...body) {
  const { h } = C;
  return h('div', { class: 'panel' }, h('h3', {}, title), subtitle && h('p', { class: 'sub hint' }, subtitle), ...body);
}

/** Sortable table. cols: [{ label, value(row), render?(row), num? }] */
function table(cols, rows, { onRow, limit = 50, sortIndex = null } = {}) {
  const { h, setChildren } = C;
  let sortBy = sortIndex;
  let dir = -1;
  const tbody = h('tbody');
  const draw = () => {
    const sorted = sortBy == null ? rows : [...rows].sort((a, b) => {
      const va = cols[sortBy].value(a);
      const vb = cols[sortBy].value(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
    setChildren(tbody, sorted.slice(0, limit).map((r) =>
      h('tr', { class: onRow ? 'link' : '', onclick: onRow && (() => onRow(r)) },
        cols.map((c) => h('td', { class: c.num ? 'num' : '' }, c.render ? c.render(r) : c.value(r))))));
  };
  const head = h('tr', {}, cols.map((c, i) =>
    h('th', { class: c.num ? 'num' : '', title: 'Sort', onclick: () => { dir = sortBy === i ? -dir : -1; sortBy = i; draw(); } }, c.label)));
  draw();
  return rows.length
    ? h('div', { class: 'table-wrap' }, h('table', { class: 'data' }, h('thead', {}, head), tbody))
    : h('div', { class: 'sub' }, 'Not enough data in this scope yet.');
}

function barList(entries, { format = (v) => v.toLocaleString(), label = (k) => k, onClick, limit = 10 } = {}) {
  const { h } = C;
  const list = entries.slice(0, limit);
  const max = Math.max(1e-9, ...list.map(([, v]) => v));
  if (!list.length) return h('div', { class: 'sub' }, 'No data yet');
  return h('div', { class: 'bars' }, list.map(([k, v]) =>
    h('div', { class: `bar${onClick ? ' link' : ''}`, onclick: onClick && (() => onClick(k)), title: label(k) },
      h('div', { class: 'label' }, h('i', { style: { width: `${(v / max) * 100}%` } }), h('span', {}, label(k))),
      h('b', {}, format(v)))));
}

function columns(values, { labels, format = (v) => v, height = 120 } = {}) {
  const { h } = C;
  const max = Math.max(1e-9, ...values);
  const step = Math.ceil(values.length / 8); // keep axis labels from overlapping
  return h('div', { class: 'cols', style: { height: `${height}px` } },
    values.map((v, i) => h('div', { class: 'col', title: `${labels?.[i] ?? i}: ${format(v)}` },
      h('div', { class: 'col-bar', style: { height: `${(v / max) * 100}%` } }),
      labels && i % step === 0 && h('span', {}, labels[i]))));
}

const scorePill = (score) => C.h('span', { class: `score s${score >= 70 ? 'hi' : score >= 45 ? 'mid' : 'lo'}` }, score);

// "What wins" analysis: share of ads with a trait and how much the trait over-indexes among winners.
function traitTable(rows, traitsOf, isWinner, label) {
  const winners = rows.filter(isWinner).length;
  const baseRate = winners / Math.max(1, rows.length);
  const stats = new Map();
  for (const r of rows) for (const t of traitsOf(r)) {
    const s = stats.get(t) || { trait: t, n: 0, w: 0, scores: [], days: [] };
    s.n++;
    if (isWinner(r)) s.w++;
    s.scores.push(r.score);
    s.days.push(r.days);
    stats.set(t, s);
  }
  const list = [...stats.values()].map((s) => ({ ...s, share: s.n / rows.length, avgScore: avg(s.scores), medDays: median(s.days), lift: baseRate ? s.w / s.n / baseRate : 0 }));
  return table([
    { label, value: (s) => s.trait },
    { label: 'Ads', value: (s) => s.n, num: true },
    { label: 'Share', value: (s) => s.share, render: (s) => C.pct(s.share), num: true },
    { label: 'Avg score', value: (s) => s.avgScore, render: (s) => scorePill(Math.round(s.avgScore)), num: true },
    { label: 'Median days', value: (s) => s.medDays, num: true },
    { label: 'Winner lift', value: (s) => s.lift, render: (s) => liftCell(s.lift, s.n), num: true },
  ], list, { sortIndex: 1 });
}

function liftCell(lift, n) {
  const cls = n < 3 ? 'lift weak' : lift >= 1.25 ? 'lift up' : lift <= 0.8 ? 'lift down' : 'lift';
  return C.h('span', { class: cls, title: n < 3 ? 'Small sample' : 'How much more often this appears among top-quartile ads than overall' }, `${lift.toFixed(2)}×`);
}

// ---------------------------------------------------------------- competitor rollup
function competitors(rows) {
  const by = new Map();
  for (const r of rows) {
    const name = r.ad.advertiser || r.ad.landingDomain || 'Unknown';
    const c = by.get(name) || { name, rows: [] };
    c.rows.push(r);
    by.set(name, c);
  }
  const total = rows.reduce((s, r) => s + r.spendMid, 0) || 1;
  return [...by.values()].map((c) => {
    const rs = c.rows;
    const activeRows = rs.filter((r) => r.ad.active !== false);
    return {
      ...c,
      ads: rs.length,
      active: rs.filter((r) => r.ad.active === true).length,
      spend: rs.reduce((s, r) => s + r.spendMid, 0),
      spendLo: rs.reduce((s, r) => s + r.spendLo, 0),
      spendHi: rs.reduce((s, r) => s + r.spendHi, 0),
      runRate: activeRows.reduce((s, r) => s + r.dailyMid, 0) * 30,
      sov: rs.reduce((s, r) => s + r.spendMid, 0) / total,
      avgDays: avg(rs.map((r) => r.days)),
      maxDays: Math.max(...rs.map((r) => r.days)),
      avgScore: avg(rs.map((r) => r.score)),
      formats: tally(rs.map((r) => r.ad.mediaType)),
      angles: tally(rs.flatMap((r) => r.angles)),
      offers: tally(rs.flatMap((r) => r.offers)),
      platforms: tally(rs.map((r) => PLATFORMS[r.ad.platform]?.label || r.ad.platform)),
      lastLaunch: Math.max(...rs.map((r) => r.launched || 0)),
    };
  });
}

// ---------------------------------------------------------------- audience rollup (Meta EU / political data)
function audience(rows) {
  const ages = new Map();
  const genders = new Map();
  const countries = new Map();
  let n = 0;
  for (const { ad } of rows) {
    const a = ad.extra?.audience;
    if (!a) continue;
    n++;
    for (const [k, v] of Object.entries(a.ages || {})) ages.set(k, (ages.get(k) || 0) + v);
    for (const [k, v] of Object.entries(a.genders || {})) genders.set(k, (genders.get(k) || 0) + v);
    for (const [k, v] of Object.entries(a.countries || {})) countries.set(k, (countries.get(k) || 0) + v);
  }
  return { n, ages, genders, countries };
}

function audienceView(rows) {
  const { h } = C;
  const a = audience(rows);
  if (!a.n) return h('div', { class: 'sub' }, 'Audience data comes from Meta Ad Library API results for ads delivered in the EU (search them in "Meta Ad Search" and save them). No such ads in this scope yet.');
  const sum = (m) => [...m.values()].reduce((x, y) => x + y, 0) || 1;
  const ageOrder = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const ageEntries = [...a.ages.entries()].sort((x, y) => ageOrder.indexOf(x[0]) - ageOrder.indexOf(y[0]));
  const totalAge = sum(a.ages);
  const totalG = sum(a.genders);
  return h('div', { class: 'aud' },
    h('div', {}, h('b', {}, 'Reach by age'), columns(ageEntries.map(([, v]) => v / totalAge), { labels: ageEntries.map(([k]) => k), format: C.pct })),
    h('div', {}, h('b', {}, 'Gender'), barList([...a.genders.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, v / totalG]), { format: C.pct })),
    h('div', {}, h('b', {}, 'Top countries'), barList([...a.countries.entries()].sort((x, y) => y[1] - x[1]), { format: C.num, limit: 8 })),
    h('p', { class: 'sub' }, `Aggregated from ${a.n} ad${a.n > 1 ? 's' : ''} with Meta-reported delivery data.`));
}

// ---------------------------------------------------------------- weekly launches
function weekly(rows, weeks = 16) {
  const now = Date.now();
  const start = now - weeks * 7 * DAY;
  const buckets = Array(weeks).fill(0);
  for (const r of rows) {
    if (!r.launched || r.launched < start) continue;
    buckets[Math.min(weeks - 1, Math.floor((r.launched - start) / (7 * DAY)))]++;
  }
  const labels = buckets.map((_, i) => new Date(start + i * 7 * DAY).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  return columns(buckets, { labels, format: (v) => `${v} ads launched` });
}

// ---------------------------------------------------------------- main render
export function renderMarket(root, ctx, ads = latestAds) {
  C = ctx;
  latestAds = ads;
  const { h, setChildren } = C;

  if (!root.querySelector('.scope')) {
    const input = (id, attrs) => h('input', { id, ...attrs });
    const q = input('m-q', { type: 'search', placeholder: 'Scope: keyword, niche, brand…' });
    const platform = h('select', { id: 'm-platform' }, h('option', { value: '' }, 'All platforms'),
      ...Object.entries(PLATFORMS).map(([k, p]) => h('option', { value: k }, p.label)));
    const industry = h('select', { id: 'm-industry' }, h('option', { value: '' }, 'All industries'),
      ...Object.values(E.INDUSTRY_BY_KEY).map((i) => h('option', { value: i.key }, i.label)));
    const period = h('select', { id: 'm-period' },
      ...[['0', 'All time'], ['7', 'Seen in last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']].map(([v, l]) => h('option', { value: v }, l)));
    const minScore = h('select', { id: 'm-score' },
      ...[[0, 'Any score'], [45, 'Score 45+'], [70, 'Score 70+ (winners)']].map(([v, l]) => h('option', { value: v }, l)));
    const update = () => {
      Object.assign(scope, { q: q.value.trim().toLowerCase(), platform: platform.value, industry: industry.value, period: period.value, minScore: Number(minScore.value) });
      renderMarket(root, C);
    };
    let t;
    q.addEventListener('input', () => (clearTimeout(t), (t = setTimeout(update, 250))));
    [platform, industry, period, minScore].forEach((s) => s.addEventListener('change', update));
    root.append(h('div', { class: 'filters scope' }, q, platform, industry, period, minScore), h('div', { class: 'market-body' }));
  }
  const body = root.querySelector('.market-body');

  const all = enrich(ads);
  const rows = all.filter(inScope);
  const scores = rows.map((r) => r.score).sort((a, b) => a - b);
  const q75 = scores[Math.floor(scores.length * 0.75)] ?? 100;
  const isWinner = (r) => r.score >= Math.max(q75, 1);
  const comps = competitors(rows).sort((a, b) => b.spend - a.spend);
  const totalSpend = rows.reduce((s, r) => s + r.spendMid, 0);
  const totalLo = rows.reduce((s, r) => s + r.spendLo, 0);
  const totalHi = rows.reduce((s, r) => s + r.spendHi, 0);
  const withActive = rows.filter((r) => typeof r.ad.active === 'boolean');

  const kpis = h('div', { class: 'kpis' }, [
    [rows.length.toLocaleString(), 'Ads in scope'],
    [comps.length.toLocaleString(), 'Advertisers'],
    [withActive.length ? C.pct(withActive.filter((r) => r.ad.active).length / withActive.length) : '—', 'Still active'],
    [C.money(totalSpend), `Est. spend to date (${C.money(totalLo)}–${C.money(totalHi)})`],
    [`${Math.round(median(rows.map((r) => r.days)))}d`, 'Median days running'],
    [Math.round(avg(rows.map((r) => r.score))), 'Avg winning score'],
  ].map(([v, l]) => h('div', { class: 'kpi' }, h('b', {}, v), h('span', {}, l))));

  if (!rows.length) {
    setChildren(body, kpis, h('div', { class: 'panel sub' }, ads.length ? 'Nothing matches this scope.' : 'No ads yet — browse your feeds or the Meta Ad Library to build your market dataset.'));
    return;
  }

  const sovTable = table([
    { label: 'Advertiser', value: (c) => c.name },
    { label: 'Ads', value: (c) => c.ads, num: true },
    { label: 'Active', value: (c) => c.active, num: true },
    { label: 'Est. spend', value: (c) => c.spend, render: (c) => h('span', { title: `${C.money(c.spendLo)} – ${C.money(c.spendHi)}` }, C.money(c.spend)), num: true },
    { label: 'Share of voice', value: (c) => c.sov, render: (c) => h('span', { class: 'sov' }, h('i', { style: { width: `${c.sov * 100}%` } }), C.pct(c.sov)), num: true },
    { label: 'Run-rate /mo', value: (c) => c.runRate, render: (c) => C.money(c.runRate), num: true },
    { label: 'Avg days', value: (c) => c.avgDays, render: (c) => Math.round(c.avgDays), num: true },
    { label: 'Max days', value: (c) => c.maxDays, num: true },
    { label: 'Avg score', value: (c) => c.avgScore, render: (c) => scorePill(Math.round(c.avgScore)), num: true },
    { label: 'Main angle', value: (c) => top(c.angles)[0] || '—' },
    { label: 'Main offer', value: (c) => top(c.offers)[0] || '—' },
    { label: 'Formats', value: (c) => top(c.formats, 2).join(', ') },
  ], comps, { onRow: (c) => openCompetitor(c, all), limit: 40 });

  const winners = [...rows].sort((a, b) => b.score - a.score).slice(0, 15);
  const winnersTable = table([
    { label: 'Score', value: (r) => r.score, render: (r) => scorePill(r.score), num: true },
    { label: 'Advertiser', value: (r) => r.ad.advertiser || r.ad.landingDomain || '?' },
    { label: 'Hook', value: (r) => E.hookOf(r.ad), render: (r) => h('span', { class: 'clip' }, E.hookOf(r.ad)) },
    { label: 'Days', value: (r) => r.days, num: true },
    { label: 'Est. spend', value: (r) => r.spendMid, render: (r) => C.money(r.spendMid), num: true },
    { label: 'Eng./day', value: (r) => r.eng.velocity ?? r.eng.perDay ?? -1, render: (r) => (r.eng.hasData ? C.num(r.eng.velocity ?? r.eng.perDay) : '—'), num: true },
    { label: 'Format', value: (r) => r.ad.mediaType || '' },
  ], winners, { onRow: (r) => C.openDrawer(r.ad.id) });

  const rowByAd = new Map(rows.map((r) => [r.ad, r]));
  const phrases = E.phraseStats(rows.map((r) => r.ad), (ad) => isWinner(rowByAd.get(ad)), { min: Math.max(2, Math.round(rows.length * 0.02)) });
  const phraseTable = table([
    { label: 'Phrase', value: (p) => p.phrase },
    { label: 'Ads', value: (p) => p.ads, num: true },
    { label: 'In winners', value: (p) => p.winners, num: true },
    { label: 'Winner lift', value: (p) => p.lift, render: (p) => liftCell(p.lift, p.ads), num: true },
  ], phrases, { limit: 25 });

  const lenBucket = (r) => {
    const n = (r.ad.text || '').length + (r.ad.headline || '').length;
    return n < 80 ? 'Short (<80 chars)' : n < 200 ? 'Medium (80–200)' : n < 500 ? 'Long (200–500)' : 'Very long (500+)';
  };
  const priceBucket = (p) => (p < 20 ? 'Under $20' : p < 50 ? '$20–50' : p < 100 ? '$50–100' : p < 200 ? '$100–200' : '$200+');

  const survival = (() => {
    const lib = rows.filter((r) => r.ad.startedRunning);
    if (lib.length < 3) return h('div', { class: 'sub' }, 'Needs Ad Library ads (with start dates) in scope.');
    const at = [7, 14, 30, 60, 90, 180];
    const vals = at.map((d) => lib.filter((r) => r.days >= d).length / lib.length);
    return h('div', {}, columns(vals, { labels: at.map((d) => `${d}d+`), format: C.pct }),
      h('p', { class: 'sub' }, `Share of ${lib.length} ads that ran at least N days. A steep drop-off means the niche tests heavily and kills most creatives fast.`));
  })();

  const domains = [...tally(rows.map((r) => r.ad.landingDomain)).entries()].sort((a, b) => b[1] - a[1]);
  const tech = tally(rows.flatMap((r) => [...(r.ad.extra?.landing?.platform || []), ...(r.ad.extra?.landing?.tracking || []), ...(r.ad.extra?.landing?.apps || [])]));
  const keywords = new Map();
  for (const r of rows) {
    const k = r.ad.extra?.keyword;
    if (!k) continue;
    const v = keywords.get(k) || { k, ads: 0, advertisers: new Set() };
    v.ads++;
    v.advertisers.add(r.ad.advertiser || r.ad.landingDomain);
    keywords.set(k, v);
  }

  const engLeaders = rows.filter((r) => r.eng.hasData).sort((a, b) => (b.eng.velocity ?? b.eng.perDay) - (a.eng.velocity ?? a.eng.perDay)).slice(0, 10);

  setChildren(body,
    kpis,
    section('Share of voice', 'Competitors ranked by estimated spend in this scope. Click a row for a full competitor breakdown. Spend is modelled — compare advertisers relative to each other rather than reading absolute dollars literally.',
      sovTable,
      h('div', { class: 'actions' }, h('button', { class: 'ghost small', onclick: () => exportCompetitors(comps) }, 'Export competitor table (CSV)'))),
    section('Winning ads', 'Highest composite score: longevity, active status, scaling (variations), engagement velocity, reach and how often you see it.', winnersTable),
    h('div', { class: 'panels' },
      section('Messaging angles that win', '"Winner lift" > 1 means the angle is over-represented among top-quartile ads.', traitTable(rows, (r) => r.angles, isWinner, 'Angle')),
      section('Phrases that win', 'Recurring 2–3 word phrases across ad copy, with how strongly each over-indexes in winning ads.', phraseTable)),
    h('div', { class: 'panels' },
      section('Offers', null, traitTable(rows, (r) => r.offers, isWinner, 'Offer')),
      section('Price points in copy', 'Prices mentioned in ad copy, converted to approximate USD.', traitTable(rows.filter((r) => r.prices.length), (r) => [...new Set(r.prices.map(priceBucket))], isWinner, 'Price band'))),
    h('div', { class: 'panels' },
      section('Creative format', null, traitTable(rows, (r) => [r.ad.mediaType || 'unknown'], isWinner, 'Format')),
      section('Call to action', null, traitTable(rows.filter((r) => r.ad.cta), (r) => [r.ad.cta], isWinner, 'CTA'))),
    h('div', { class: 'panels' },
      section('Copy length', null, traitTable(rows, (r) => [lenBucket(r)], isWinner, 'Length')),
      section('Hook style', null, traitTable(rows, (r) => {
        const hook = E.hookOf(r.ad);
        return [hook.includes('?') ? 'Question hook' : 'Statement hook', hasEmoji(`${r.ad.text}${r.ad.headline}`) ? 'Uses emoji' : 'No emoji', /^\s*\d/.test(hook) ? 'Starts with a number' : null].filter(Boolean);
      }, isWinner, 'Style'))),
    h('div', { class: 'panels' },
      section('Launch cadence (new ads per week)', 'How aggressively the market is testing creatives. Spikes often line up with promotions or product launches.', weekly(rows)),
      section('Creative survival', null, survival)),
    section('Audience (Meta-reported)', null, audienceView(rows)),
    h('div', { class: 'panels' },
      section('Landing domains', null, barList(domains, { onClick: (d) => ((scope.q = d), (root.querySelector('#m-q').value = d), renderMarket(root, C)) })),
      section('Tech stack & pixels', 'From landing pages you analyzed (🔬 in an ad\'s details).', barList([...tech.entries()].sort((a, b) => b[1] - a[1]), { limit: 15 }))),
    h('div', { class: 'panels' },
      section('Engagement leaders', 'Fastest-growing engagement, measured between your sightings when possible.', table([
        { label: 'Advertiser', value: (r) => r.ad.advertiser || '?' },
        { label: 'Hook', value: (r) => E.hookOf(r.ad), render: (r) => h('span', { class: 'clip' }, E.hookOf(r.ad)) },
        { label: 'Eng./day', value: (r) => r.eng.velocity ?? r.eng.perDay, render: (r) => C.num(r.eng.velocity ?? r.eng.perDay), num: true },
        { label: 'Total', value: (r) => r.eng.total, render: (r) => C.num(r.eng.total), num: true },
        { label: 'Comments %', value: (r) => r.eng.commentShare ?? 0, render: (r) => (r.eng.commentShare != null ? C.pct(r.eng.commentShare) : '—'), num: true },
      ], engLeaders, { onRow: (r) => C.openDrawer(r.ad.id) })),
      section('Google keywords with ads', null, table([
        { label: 'Keyword', value: (k) => k.k },
        { label: 'Ads', value: (k) => k.ads, num: true },
        { label: 'Advertisers', value: (k) => k.advertisers.size, num: true },
      ], [...keywords.values()], { sortIndex: 1 })))
  );
}

function exportCompetitors(comps) {
  const header = ['advertiser', 'ads', 'active', 'est_spend_mid', 'est_spend_low', 'est_spend_high', 'share_of_voice', 'run_rate_month', 'avg_days', 'max_days', 'avg_score', 'main_angle', 'main_offer', 'formats', 'platforms'];
  const rows = comps.map((c) => [c.name, c.ads, c.active, Math.round(c.spend), Math.round(c.spendLo), Math.round(c.spendHi), c.sov.toFixed(4), Math.round(c.runRate),
    Math.round(c.avgDays), c.maxDays, Math.round(c.avgScore), top(c.angles)[0] || '', top(c.offers)[0] || '', top(c.formats, 3).join('; '), top(c.platforms, 5).join('; ')]);
  C.download('adlumi-competitors.csv', C.toCsvRows([header, ...rows]), 'text/csv');
}

// ---------------------------------------------------------------- competitor deep dive
function openCompetitor(comp, allRows) {
  const { h } = C;
  const rs = allRows.filter((r) => (r.ad.advertiser || r.ad.landingDomain || 'Unknown') === comp.name);
  const c = competitors(rs)[0];
  const winners = [...rs].sort((a, b) => b.score - a.score);
  const pills = (m) => h('div', { class: 'tags' }, [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => h('span', { class: 'pill' }, `${k} · ${v}`)));

  // Funnel map: which landing pages the ads point at
  const funnel = new Map();
  for (const r of rs) {
    let key = r.ad.landingUrl;
    try {
      const u = new URL(key);
      key = `${u.hostname.replace(/^www\./, '')}${u.pathname}`;
    } catch {}
    if (!key) continue;
    const f = funnel.get(key) || { key, url: r.ad.landingUrl, ads: 0, scores: [], tech: r.ad.extra?.landing };
    f.ads++;
    f.scores.push(r.score);
    funnel.set(key, f);
  }
  const libSearch = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=keyword_unordered&q=${encodeURIComponent(comp.name)}`;

  C.showDrawer(
    h('header', {}, h('span', { class: 'pill' }, 'Competitor'), h('h2', {}, comp.name), h('button', { class: 'close', title: 'Close', onclick: C.closeDrawer }, '✕')),
    h('div', { class: 'kpis mini' }, [
      [c.ads, 'Ads saved'],
      [c.active, 'Active'],
      [C.money(c.spend), `Est. spend (${C.money(c.spendLo)}–${C.money(c.spendHi)})`],
      [C.money(c.runRate), 'Est. monthly run-rate'],
      [`${Math.round(c.avgDays)}d / ${c.maxDays}d`, 'Avg / max days running'],
      [Math.round(c.avgScore), 'Avg winning score'],
    ].map(([v, l]) => h('div', { class: 'kpi' }, h('b', {}, v), h('span', {}, l)))),
    h('div', { class: 'actions' }, h('a', { class: 'ghost', href: libSearch, target: '_blank', rel: 'noopener' }, 'Open all their ads in Meta Ad Library ↗')),
    h('h3', {}, 'Launch cadence'), weekly(rs),
    h('h3', {}, 'Platforms'), pills(c.platforms),
    h('h3', {}, 'Formats'), pills(c.formats),
    h('h3', {}, 'Angles'), c.angles.size ? pills(c.angles) : h('div', { class: 'sub' }, 'None detected'),
    h('h3', {}, 'Offers'), c.offers.size ? pills(c.offers) : h('div', { class: 'sub' }, 'None detected'),
    h('h3', {}, 'Funnel — landing pages'),
    table([
      { label: 'Page', value: (f) => f.key, render: (f) => (/^https?:/.test(f.url || '') ? h('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer' }, f.key) : f.key) },
      { label: 'Ads', value: (f) => f.ads, num: true },
      { label: 'Avg score', value: (f) => avg(f.scores), render: (f) => scorePill(Math.round(avg(f.scores))), num: true },
      { label: 'Stack', value: (f) => (f.tech?.platform || []).join(', ') || '—' },
    ], [...funnel.values()], { sortIndex: 1 }),
    h('h3', {}, 'Audience'), audienceView(rs),
    h('h3', {}, 'Their best ads'),
    table([
      { label: 'Score', value: (r) => r.score, render: (r) => scorePill(r.score), num: true },
      { label: 'Hook', value: (r) => E.hookOf(r.ad), render: (r) => h('span', { class: 'clip' }, E.hookOf(r.ad)) },
      { label: 'Days', value: (r) => r.days, num: true },
      { label: 'Est. spend', value: (r) => r.spendMid, render: (r) => C.money(r.spendMid), num: true },
    ], winners, { onRow: (r) => C.openDrawer(r.ad.id), limit: 25 })
  );
}
