import { upsertAd, hasThumb, putThumb, getAd } from './lib/db.js';
import { getSettings } from './lib/settings.js';

const THUMB_MAX_WIDTH = 480;

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({ settings: await getSettings() });
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#welcome') });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'ad:capture' || msg?.type === 'ad:refresh') {
    handleCapture(msg.ad, sender.tab, msg.type === 'ad:refresh')
      .then(sendResponse)
      .catch((err) => sendResponse({ error: String(err) }));
    return true; // async response
  }
  if (msg?.type === 'ads:has' && Array.isArray(msg.ids)) {
    Promise.all(msg.ids.slice(0, 500).map((id) => getAd(String(id))))
      .then((ads) => sendResponse({ ids: ads.filter(Boolean).map((a) => a.id) }))
      .catch(() => sendResponse({ ids: [] }));
    return true;
  }
  return false;
});

async function handleCapture(ad, tab, isRefresh = false) {
  if (!ad?.id || !ad.platform) return { error: 'invalid ad' };
  const { ad: saved, isNew } = await upsertAd(sanitize(ad), Date.now(), { countSighting: !isRefresh });
  if (tab?.id != null && !isRefresh) await bumpTabCount(tab.id);
  chrome.runtime.sendMessage({ type: 'ads:changed', isNew }).catch(() => {}); // no dashboard open

  const settings = await getSettings();
  if (settings.thumbnails && saved.mediaUrls?.length && !(await hasThumb(saved.id))) {
    makeThumb(saved.mediaUrls[0])
      .then((blob) => putThumb(saved.id, blob))
      .catch(() => {}); // CDN URL may be expired or blocked; dashboard falls back to the raw URL
  }
  return { ok: true, isNew };
}

// Content scripts run on hostile pages; only keep expected, size-bounded fields.
function sanitize(ad) {
  const str = (v, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const url = (v) => (/^https?:\/\//i.test(v || '') ? str(v, 2000) : '');
  return {
    id: str(ad.id, 120),
    platform: str(ad.platform, 30),
    source: str(ad.source, 20) || 'feed',
    advertiser: str(ad.advertiser, 200),
    advertiserUrl: url(ad.advertiserUrl),
    headline: str(ad.headline, 500),
    text: str(ad.text, 8000),
    cta: str(ad.cta, 60),
    landingUrl: url(ad.landingUrl),
    landingDomain: str(ad.landingDomain, 200),
    mediaType: str(ad.mediaType, 20) || 'text',
    mediaUrls: Array.isArray(ad.mediaUrls) ? ad.mediaUrls.map(url).filter(Boolean).slice(0, 10) : [],
    postUrl: url(ad.postUrl),
    pageUrl: url(ad.pageUrl),
    startedRunning: str(ad.startedRunning, 40),
    active: typeof ad.active === 'boolean' ? ad.active : undefined,
    extra: boundedObject(ad.extra),
  };
}

function boundedObject(v) {
  if (!v || typeof v !== 'object') return {};
  const json = JSON.stringify(v);
  return json.length <= 4000 ? JSON.parse(json) : {};
}

async function bumpTabCount(tabId) {
  const key = `tab:${tabId}`;
  const { [key]: n = 0 } = await chrome.storage.session.get(key);
  await chrome.storage.session.set({ [key]: n + 1 });
  chrome.action.setBadgeBackgroundColor({ color: '#6d4aff', tabId });
  chrome.action.setBadgeText({ text: String(n + 1), tabId });
}

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(`tab:${tabId}`));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') chrome.storage.session.remove(`tab:${tabId}`);
});

async function makeThumb(src) {
  const res = await fetch(src, { credentials: 'omit' });
  if (!res.ok) throw new Error(`thumb ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const scale = Math.min(1, THUMB_MAX_WIDTH / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
}
