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
const USER_FIELDS = new Set(['favorite', 'tags', 'notes', 'firstSeen', 'seenCount', 'lastSeen']);

export function mergeAd(prev, incoming, now) {
  const out = { ...prev };
  for (const [key, value] of Object.entries(incoming)) {
    if (USER_FIELDS.has(key) || isEmpty(value)) continue;
    if (key === 'mediaUrls' || key === 'pageUrl' || key === 'extra') {
      // Fresh CDN URLs replace expired signed ones; extra is merged shallowly.
      out[key] = key === 'extra' ? { ...(prev.extra || {}), ...value } : value;
    } else if (key === 'startedRunning' && prev.startedRunning) {
      out[key] = prev.startedRunning < value ? prev.startedRunning : value;
    } else if (isEmpty(prev[key]) || key === 'active') {
      out[key] = value;
    }
  }
  out.lastSeen = now;
  out.seenCount = (prev.seenCount || 1) + 1;
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
    firstSeen: incoming.firstSeen || now,
    lastSeen: now,
    seenCount: 1,
  };
}

/** Insert or merge a captured ad in one transaction. Resolves { ad, isNew }. */
export async function upsertAd(incoming, now = Date.now()) {
  const db = await openDb();
  const t = db.transaction('ads', 'readwrite');
  const s = t.objectStore('ads');
  let result;
  s.get(incoming.id).onsuccess = (e) => {
    const prev = e.target.result;
    const ad = prev ? mergeAd(prev, incoming, now) : newAd(incoming, now);
    result = { ad, isNew: !prev };
    s.put(ad);
  };
  await txDone(t);
  return result;
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
