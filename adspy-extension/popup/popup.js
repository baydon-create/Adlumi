import { countAds, countSince, recentAds } from '../src/lib/db.js';
import { getSettings, saveSettings, PLATFORMS } from '../src/lib/settings.js';

const $ = (id) => document.getElementById(id);
const dashboard = (hash = '') => chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard/dashboard.html${hash}`) });

const SITE_PLATFORM = [
  [/facebook\.com\/ads\/library/, 'adlibrary'],
  [/facebook\.com/, 'facebook'],
  [/instagram\.com/, 'instagram'],
  [/youtube\.com/, 'youtube'],
  [/linkedin\.com/, 'linkedin'],
  [/reddit\.com/, 'reddit'],
  [/(x|twitter)\.com/, 'x'],
  [/google\.com\/search/, 'google'],
];

async function init() {
  const settings = await getSettings();
  $('enabled').checked = !settings.paused;
  $('enabled').addEventListener('change', (e) => saveSettings({ paused: !e.target.checked }));

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [total, today] = await Promise.all([countAds(), countSince(startOfDay.getTime())]);
  $('total').textContent = total.toLocaleString();
  $('today').textContent = today.toLocaleString();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    const key = `tab:${tab.id}`;
    const { [key]: n = 0 } = await chrome.storage.session.get(key);
    $('tab').textContent = n;
    const platform = SITE_PLATFORM.find(([re]) => re.test(tab.url || ''))?.[1];
    if (platform) {
      $('site').hidden = false;
      $('site-label').textContent = `Capture on ${PLATFORMS[platform].label}`;
      $('site-enabled').checked = settings.platforms[platform] !== false;
      $('site-enabled').addEventListener('change', async (e) => {
        const s = await getSettings();
        saveSettings({ platforms: { ...s.platforms, [platform]: e.target.checked } });
      });
    }
  }

  const recent = await recentAds(6);
  const list = $('recent');
  if (!recent.length) {
    list.innerHTML = '<li class="empty">No ads yet — scroll Facebook, Instagram, YouTube, LinkedIn, Reddit, X or Google and they will appear here.</li>';
  }
  for (const ad of recent) {
    const li = document.createElement('li');
    const dot = document.createElement('i');
    dot.style.background = PLATFORMS[ad.platform]?.color || '#888';
    const body = document.createElement('div');
    const name = document.createElement('b');
    name.textContent = ad.advertiser || ad.landingDomain || 'Unknown advertiser';
    const copy = document.createElement('span');
    copy.textContent = ad.headline || ad.text || ad.landingDomain || '';
    body.append(name, copy);
    li.append(dot, body);
    li.addEventListener('click', () => dashboard(`#ad=${encodeURIComponent(ad.id)}`));
    list.appendChild(li);
  }

  $('search').addEventListener('submit', (e) => {
    e.preventDefault();
    dashboard(`#q=${encodeURIComponent($('q').value.trim())}`);
  });
  $('open').addEventListener('click', () => dashboard());
  $('library').addEventListener('click', () =>
    chrome.tabs.create({ url: 'https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&media_type=all' })
  );
}

init();
