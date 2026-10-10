import { engagementTotal } from './estimates.js';

// IndexedDB storage shared by the service worker, popup and dashboard
// (all extension pages share one origin, so they see the same database).

const DB_NAME = 'adspy';
const DB_VERSION = 1;
let dbPromise;

export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const ads = db.createObjectStore('ads', { keyPath: 'id' });
        for (const key of ['platform', 'advertiser', 'firstSeen', 'lastSeen', 'seenCount']) {
          ads.createIndex(key, key);
        }
        db.createObjectStore('thumbs'); // id -> Blob
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

const asPromise = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txDone = (t) =>
  new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = t.onabort = () => reject(t.error);
  });

async function store(name, mode = 'readonly') {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

// Fields owned by the user; captures never overwrite them.
const USER_FIELDS = new Set(['favorite', 'tags', 'notes', 'firstSeen', 'seenCount', 'lastSeen', 'history']);
const HISTORY_MAX = 60;
const HISTORY_MIN_GAP = 30 * 60 * 1000;

/** Appends an engagement snapshot so growth (velocity) can be measured across sightings. */
function withHistory(ad, engagement, now) {
  const counts = Object.fromEntries(Object.entries(engagement || {}).filter(([, v]) => Number.isFinite(v)));
  if (!Object.keys(counts).length) return ad.history || [];
  const snap = { t: now, total: engagementTotal(counts), ...counts };
  const history = [...(ad.history || [])];
  const last = history[history.length - 1];
  if (last && now - last.t < HISTORY_MIN_GAP) history[history.length - 1] = { ...snap, t: last.t < now ? now : last.t };
  else history.push(snap);
  return history.slice(-HISTORY_MAX);
}

/** True when `next` points deeper into the same site than `prev` (e.g. a product page vs. the homepage). */
function moreSpecificUrl(next, prev) {
  try {
    const a = new URL(next);
    const b = new URL(prev);
    const depth = (u) => (u.pathname.replace(/\/$/, '') + u.search).length;
    return a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '') && depth(a) > depth(b);
  } catch {
    return false;
  }
}

export function mergeAd(prev, incoming, now, { countSighting = true } = {}) {
  const out = { ...prev };
  for (const [key, value] of Object.entries(incoming)) {
    if (USER_FIELDS.has(key) || isEmpty(value)) continue;
    if (key === 'mediaUrls' || key === 'pageUrl' || key === 'extra') {
      // Fresh CDN URLs replace expired signed ones; extra is merged shallowly.
      out[key] = key === 'extra' ? { ...(prev.extra || {}), ...value } : value;
    } else if (key === 'startedRunning' && prev.startedRunning) {
      out[key] = prev.startedRunning < value ? prev.startedRunning : value;
    } else if (isEmpty(prev[key]) || key === 'active' || (key === 'landingUrl' && moreSpecificUrl(value, prev.landingUrl))) {
      out[key] = value;
    }
  }
  // A real destination URL from a page capture supersedes the API's domain-only value.
  if (out.landingUrl !== prev.landingUrl && out.extra?.landingDomainOnly && !incoming.extra?.landingDomainOnly) {
    out.extra = { ...out.extra, landingDomainOnly: false };
  }
  if (incoming.extra?.engagement) {
    // Counters only grow; keep the max so a half-rendered read can't lower them.
    const merged = { ...(prev.extra?.engagement || {}) };
    for (const [k, v] of Object.entries(incoming.extra.engagement)) if (Number.isFinite(v)) merged[k] = Math.max(v, merged[k] || 0);
    out.extra = { ...out.extra, engagement: merged };
    out.history = withHistory(prev, merged, now);
  }
  out.lastSeen = now;
  if (countSighting) out.seenCount = (prev.seenCount || 1) + 1;
  return out;
}

export function newAd(incoming, now) {
  return {
    favorite: false,
    tags: [],
    notes: '',
    mediaUrls: [],
    extra: {},
    ...incoming,
    history: withHistory({}, incoming.extra?.engagement, now),
    firstSeen: incoming.firstSeen || now,
    lastSeen: now,
    seenCount: 1,
  };
}

/** Insert or merge a captured ad in one transaction. Resolves { ad, isNew }. */
export async function upsertAd(incoming, now = Date.now(), opts = {}) {
  const db = await openDb();
  const t = db.transaction('ads', 'readwrite');
  const s = t.objectStore('ads');
  let result;
  s.get(incoming.id).onsuccess = (e) => {
    const prev = e.target.result;
    const ad = prev ? mergeAd(prev, incoming, now, opts) : newAd(incoming, now);
    result = { ad, isNew: !prev };
    s.put(ad);
  };
  await txDone(t);
  return result;
}

/**
 * Applies the user's own fields (favorite, tags, notes, industry correction, landing analysis)
 * onto the latest stored copy in one transaction, so edits never overwrite newer capture data
 * (sightings, engagement history) that arrived while the dashboard had an older copy.
 */
export async function saveUserFields(ad) {
  const db = await openDb();
  const t = db.transaction('ads', 'readwrite');
  const s = t.objectStore('ads');
  let saved;
  s.get(ad.id).onsuccess = (e) => {
    const cur = e.target.result;
    if (!cur) return;
    saved = {
      ...cur,
      favorite: !!ad.favorite,
      tags: ad.tags || [],
      notes: ad.notes || '',
      extra: { ...(cur.extra || {}), industry: ad.extra?.industry, landing: ad.extra?.landing ?? cur.extra?.landing },
    };
    s.put(saved);
  };
  await txDone(t);
  return saved;
}

export const getAd = async (id) => asPromise((await store('ads')).get(id));
export const putAd = async (ad) => asPromise((await store('ads', 'readwrite')).put(ad));
export const allAds = async () => asPromise((await store('ads')).getAll());
export const countAds = async () => asPromise((await store('ads')).count());

export async function countSince(ts) {
  const index = (await store('ads')).index('firstSeen');
  return asPromise(index.count(IDBKeyRange.lowerBound(ts)));
}

export async function recentAds(limit = 5) {
  const index = (await store('ads')).index('lastSeen');
  return new Promise((resolve, reject) => {
    const out = [];
    const req = index.openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || out.length >= limit) return resolve(out);
      out.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAd(id) {
  const db = await openDb();
  const t = db.transaction(['ads', 'thumbs'], 'readwrite');
  t.objectStore('ads').delete(id);
  t.objectStore('thumbs').delete(id);
  return txDone(t);
}

export async function bulkPut(ads) {
  const db = await openDb();
  const t = db.transaction('ads', 'readwrite');
  const s = t.objectStore('ads');
  for (const ad of ads) s.put(ad);
  return txDone(t);
}

export async function clearAll() {
  const db = await openDb();
  const t = db.transaction(['ads', 'thumbs'], 'readwrite');
  t.objectStore('ads').clear();
  t.objectStore('thumbs').clear();
  return txDone(t);
}

export const getThumb = async (id) => asPromise((await store('thumbs')).get(id));
export const putThumb = async (id, blob) => asPromise((await store('thumbs', 'readwrite')).put(blob, id));
export const hasThumb = async (id) => (await asPromise((await store('thumbs')).count(id))) > 0;
