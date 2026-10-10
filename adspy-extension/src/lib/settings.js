export const PLATFORMS = {
  facebook: { label: 'Facebook', color: '#1877f2' },
  adlibrary: { label: 'Meta Ad Library', color: '#0866ff' },
  instagram: { label: 'Instagram', color: '#d62976' },
  youtube: { label: 'YouTube', color: '#ff0033' },
  linkedin: { label: 'LinkedIn', color: '#0a66c2' },
  reddit: { label: 'Reddit', color: '#ff4500' },
  x: { label: 'X / Twitter', color: '#71767b' },
  google: { label: 'Google Search', color: '#34a853' },
};

export const DEFAULT_SETTINGS = {
  paused: false,
  badges: true,
  thumbnails: true,
  platforms: Object.fromEntries(Object.keys(PLATFORMS).map((k) => [k, true])),
  graphVersion: 'v23.0',
  graphToken: '',
};

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    platforms: { ...DEFAULT_SETTINGS.platforms, ...(settings?.platforms || {}) },
  };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}
