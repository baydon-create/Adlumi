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
| **Engagement tracking** | Reads reactions, likes, comments, shares, views and bookmarks on each platform, using X's action-bar labels and Reddit's built-in scores where available. It re-reads counters after they render and keeps a history of snapshots, so **engagement velocity** (growth per day) is measured across your sightings. |
| **Performance estimates** | For every ad: impressions, spend to date, daily spend, CPM, CTR, CPC, conversion rate, cost per purchase/lead, order value, revenue and ROAS. Each is a ~90% **range** with a confidence level and a plain-language explanation of how it was estimated (see below). |
| **Winning score (0–100)** | A composite of longevity, active status, scaling (number of ad variations), engagement velocity, EU reach, placements and how often you see the ad. |
| **Market Intelligence** | Scope by keyword, platform, industry, time period or score. Shows **share of voice** by estimated spend, monthly run-rate per competitor, winning ads, and which **messaging angles, phrases, offers, price bands, formats, CTAs, copy lengths and hook styles over-index in winners** ("winner lift"). Also launch cadence, creative survival curve, Meta-reported audience (age, gender, country), landing domains, tech stack and Google keywords. |
| **Competitor deep dive** | Click any competitor for their spend and run-rate, launch cadence, platforms, formats, angles, offers, **funnel map** (which landing pages their ads point to), audience and best ads. |
| **Languages & currencies** | Works with Facebook in English or Arabic (labels, dates, buttons, Arabic numerals such as "١٫٢ ألف"). Prices in USD, EUR, GBP, EGP (LE, E£, جنيه), SAR and AED are recognised and converted to approximate USD for comparisons. |
| **Local thumbnails** | Saves a downscaled copy of each creative, so previews still work after Facebook's signed CDN links expire. |

## How the estimates work (and how accurate they are)

Competitors' spend, CPM, CTR, CPA and revenue are private, and no tool can see them. AdSpy Lens models them from the **strongest public signal available for each ad**, in this order:

1. **Meta-disclosed spend and impressions ranges** (political and issue ads): high confidence, and the advertiser's actual CPM.
2. **X view counts** (these are impressions): medium.
3. **EU reach** from Meta's Ad Library API × typical frequency: medium.
4. **Video views** ÷ typical view rate: low to medium.
5. **Visible engagement** ÷ typical engagement rate: low.
6. **Longevity prior** (days running × typical budget): very low; shown with a dashed pill.

Those are combined with CPM/CTR/conversion benchmarks by platform, country tier and auto-detected industry. Uncertainties are combined log-normally, so the ranges stay realistic instead of multiplying every worst case together. ROAS is **survival-adjusted**: an ad still running after 30+ days is assumed to be at least break-even.

To make the estimates sharper:
- Correct an ad's industry in its details.
- Set your market and any known CPM, conversion rate or order value in Settings.
- Analyze the landing page (real prices feed the order value).
- Save ads through **Meta Ad Search**, which adds EU reach, targeting and demographics.

Use the dollar figures to **compare competitors with each other**. Treat them as estimates, not as each advertiser's actual numbers.

## Install (developer mode)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Download the repo (`git clone https://github.com/baydon-create/adspy-lens.git`, or **Code → Download ZIP** and unzip it), then click **Load unpacked** and select the repo folder (the one containing `manifest.json`).
3. Pin the extension. The dashboard opens on first install, and you can always reach it from the popup.
4. Browse your feeds. Captured ads get a purple **AdSpy ✓** badge, and the toolbar icon shows a count for the current tab.

No build step is needed. It's plain JavaScript on Manifest V3.

## How it's built

```
manifest.json
src/background.js        service worker: validates captures, upserts into IndexedDB, makes thumbnails
src/lib/db.js            IndexedDB layer (ads + thumbnails), shared by worker, popup and dashboard
src/lib/settings.js      settings stored in chrome.storage.local
src/lib/estimates.js     performance model, winning score, angle/offer/phrase analysis
src/content/common.js    capture engine: scan loop, de-dup, redirect unwrapping, CTA/media/engagement helpers
src/content/<site>.js    per-platform ad detection + extraction
popup/                   quick stats, per-site toggle, recent ads
dashboard/               library, Meta API search, market intelligence (insights.js), settings, landing-page analyzer
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
