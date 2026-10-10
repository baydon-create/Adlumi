# AdSpy Lens — ad intelligence Chrome extension

A PowerAdSpy-style ad spy tool that runs entirely in your browser. As you browse, it saves every ad you scroll past into a searchable library. It also adds research tools to the Meta Ad Library.

## Features

| Area | What it does |
|---|---|
| **Automatic ad capture** | Detects sponsored posts on **Facebook, Instagram, YouTube** (in-feed, search, sidebar and in-stream video ads), **LinkedIn, Reddit, X/Twitter** and **Google Search**. For each ad it saves the advertiser, copy, headline, CTA, media, landing page (tracking redirects removed, UTMs kept), post link and engagement counts. |
| **Frequency tracking** | Each ad gets an ID from its copy and destination, so seeing it again bumps *Times seen* and *Last seen* instead of creating a duplicate. |
| **Meta Ad Library enhancer** | Puts a 🔥 **"Running N days"** badge on every card, shows the variation count, and adds a **Save** button to each card plus a floating **Save all visible** button. |
| **Meta Ad Library API search** | Searches Meta's official API with your own token, from inside the dashboard. |
| **Landing page analyzer** | Detects the store platform (Shopify, WooCommerce, ClickFunnels…), tracking pixels (Meta, TikTok, Google Ads, GA4…), apps (Klaviyo, Judge.me, Recharge…), prices and offers. For Shopify stores it also shows the product count, price range and newest products. |
| **Dashboard** | Full-text search, filters (platform, format, CTA, date range, minimum days running, minimum times seen, tags, favorites, active only), sorting (longest running, most seen…), favorites, tags, notes, plus CSV/JSON export and JSON import. |
| **Insights** | Ads per day, top advertisers and landing domains, CTA and format breakdowns, the Google keywords that triggered ads, and the longest-running ads. |
| **Local thumbnails** | Saves a downscaled copy of each creative, so previews still work after Facebook's signed CDN links expire. |

## Install (developer mode)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this `adspy-extension/` folder.
3. Pin the extension. The dashboard opens on first install, and you can always reach it from the popup.
4. Browse your feeds. Captured ads get a purple **AdSpy ✓** badge, and the toolbar icon shows a count for the current tab.

No build step is needed. It's plain JavaScript on Manifest V3.

## How it's built

```
manifest.json
src/background.js        service worker: validates captures, upserts into IndexedDB, makes thumbnails
src/lib/db.js            IndexedDB layer (ads + thumbnails), shared by worker, popup and dashboard
src/lib/settings.js      settings stored in chrome.storage.local
src/content/common.js    capture engine: scan loop, de-dup, redirect unwrapping, CTA/media/engagement helpers
src/content/<site>.js    per-platform ad detection + extraction
popup/                   quick stats, per-site toggle, recent ads
dashboard/               library, Meta API search, insights, settings, landing-page analyzer
```

To add a platform, write a `src/content/<site>.js` that calls `__adspy.register({ platform, selector, isAd, extract })` and add it to `content_scripts` in the manifest.

## Limitations

- **Capture depends on each site's HTML.** Facebook in particular obfuscates its "Sponsored" label and changes its markup often, so the detector checks several independent signals. When a site changes its markup, update its file in `src/content/`.
- **You can only spy on ads you are shown.** Services like PowerAdSpy run crawler farms with thousands of profiles to build databases of millions of ads. A single extension sees your feed, plus whatever you browse in the Ad Library. To grow coverage, browse with different interests, or have a team use the extension and merge JSON exports.
- **Limits of the Meta Ad Library API:** for commercial ads it only returns ads delivered in the EU/UK. It does not return images or videos (cards link to the Ad Library page). You need a token from the Graph API Explorer after verifying your identity at facebook.com/ID.
- **Landing page analysis asks permission for each site** (Chrome's optional host permissions), so the extension never reads arbitrary sites in the background.
- **Terms of service:** automated scraping is restricted by Meta and other platforms. This extension only records pages you load yourself, at human speed. Check the terms that apply to you before using it commercially.

## Privacy

Everything is stored locally in IndexedDB and `chrome.storage`. Nothing is sent to any server except Meta's Graph API (only when you search it) and landing pages you choose to analyze.
