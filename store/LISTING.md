# Adlumi: Chrome Web Store submission pack

Copy each block into the matching field of the Chrome Web Store Developer Dashboard
(https://chrome.google.com/webstore/devconsole). All placeholders are filled in.

---

## 1. Store listing tab

### Name (from manifest, max 75)
```
Adlumi – Competitor Ad Research
```

### Summary / short description (from manifest, max 132)
```
Research competitor ads: save ads from the Ad Library and your feeds, see how long they run, estimates and market insights.
```

### Detailed description (max 16,000)
```
Find the ads your competitors keep paying for, and learn why they work.

Adlumi turns ad research from endless scrolling into a searchable library with clear answers: which ads have run the longest, which messages and offers keep showing up in winning ads, and how competitors compare.

★ DAYS RUNNING, AT A GLANCE
Every ad card in the Meta Ad Library gets a "Running N days" badge and a variation count. Long-running ads are usually the profitable ones, so you can see the winners immediately. Save one ad, or every ad on the page, with one click.

★ ONE LIBRARY FOR EVERY AD
Save ads from the Ad Library, or let Adlumi capture sponsored posts automatically while you browse Facebook, Instagram, YouTube, LinkedIn, Reddit, X and Google Search. Each saved ad includes its copy, creative, call to action, landing page and visible engagement.

★ WINNING SCORE
Every ad gets a 0–100 score that combines how long it has been running, how many variations the advertiser made, engagement growth and reach, so the best ideas rise to the top.

★ PERFORMANCE ESTIMATES (WITH HONEST RANGES)
See modelled ranges for impressions, spend, CPM, CPC, cost per purchase and ROAS, with a confidence level and a plain explanation of how each number was estimated.

★ MARKET INTELLIGENCE
• Share of voice: who dominates your niche
• The messaging angles, phrases, offers, price points, formats and hooks that over-index in winning ads
• Launch cadence and creative survival curves
• Audience age, gender and country data where Meta publishes it
• Competitor deep dives with funnel maps of every landing page

★ LANDING PAGE INSIGHTS
Detect the store platform (Shopify, WooCommerce and others), tracking pixels, apps, prices and offers on a competitor's landing page. For Shopify stores, also see product count, price range and newest products.

★ WORKS IN ENGLISH AND ARABIC
Reads Facebook in English or Arabic and understands prices in USD, EUR, GBP, EGP, SAR and AED.

★ PRIVATE BY DESIGN
Your research stays in your browser. No account, no tracking, no data sent to us. Export everything to CSV or JSON whenever you want.

HOW TO USE
1. Search a competitor or keyword in the Meta Ad Library and click "Save all visible", or simply browse your feeds.
2. Open the Adlumi dashboard to filter, sort by winning score, and explore Market Intelligence.
3. Export your findings to CSV.

Note: spend and cost figures are estimates built from public signals and industry benchmarks, shown as ranges. Use them to compare competitors, not as exact numbers.

Adlumi is an independent product and is not affiliated with, endorsed by or sponsored by Meta Platforms, Inc., Google, LinkedIn, Reddit or X Corp.

Privacy policy: https://baydon-create.github.io/Adlumi/privacy.html
Support: dr.mohamedbaydon@gmail.com
```

### Category
`Productivity` (alternative: `Tools`)

### Language
`English`

### Graphic assets (all in `store/assets/`)
| Field | File | Size |
|---|---|---|
| Store icon | `icon-128.png` | 128×128 (96×96 artwork + 16 px padding) |
| Screenshots (upload in this order) | `screenshot-1-adlibrary.png` … `screenshot-5-settings.png` | 1280×800 |
| Small promo tile | `promo-small-440x280.png` | 440×280 |
| Marquee promo tile | `promo-marquee-1400x560.png` | 1400×560 |

### Additional fields
- **Official URL / Homepage:** `https://baydon-create.github.io/Adlumi/`
- **Support URL:** `https://baydon-create.github.io/Adlumi/` (or a `mailto:` link)
- **Mature content:** No

---

## 2. Privacy practices tab

### Single purpose description
```
Adlumi helps marketers research competitor advertising. It detects and saves ads the user views (mainly in the Meta Ad Library and in the user's own feeds and search results) into a local library, and analyzes them with filters, scores, estimates and reports.
```

### Permission justifications

**storage**
```
Stores the user's settings (enabled sites, display options, optional Meta API token) locally in the browser.
```

**unlimitedStorage**
```
The user's ad library (ad text, thumbnails, notes) is stored locally in IndexedDB and can grow to thousands of ads with images, which exceeds the default storage quota. No data leaves the device.
```

**Host permission: facebook.com, instagram.com, youtube.com, linkedin.com, reddit.com, x.com, twitter.com, google.com**
```
Content scripts on these sites detect advertisements on pages the user is viewing (sponsored posts, Meta Ad Library cards, search ads) and save the ad's public details (advertiser, text, creative, call to action, landing page, engagement counts) to the user's local library. On the Meta Ad Library, the extension adds "days running" badges and Save buttons. No other page content is read. On facebook.com, access also covers graph.facebook.com, used only when the user runs a search in the optional "Meta Ad Search" feature with their own access token.
```

**Host permission: fbcdn.net, cdninstagram.com, ytimg.com, ggpht.com, googleusercontent.com, gstatic.com, licdn.com, redd.it, redditmedia.com, twimg.com**
```
These are the image servers that host ad creatives. The extension downloads each saved ad's image once to create a small local thumbnail, because these image links expire after a few days. Users can turn thumbnails off in Settings.
```

**Optional host permissions: https://*/* and http://*/***
```
Used only by the "Analyze landing page" button. When the user clicks it, Chrome asks for permission for that single website only (requested at click time with chrome.permissions.request). The extension then loads that page to detect its store platform, tracking pixels, prices and offers. Nothing is granted or fetched without the user's explicit action.
```

### Remote code
```
No, I am not using remote code.
```
(All JavaScript ships inside the package. No eval, no remotely hosted scripts.)

### Data usage: tick these boxes
- [x] **Website content** (text, images and links of ads on pages the user views)
- [x] **Web history** (the pages where ads were seen are stored with each ad in the user's local library)
- [ ] Personally identifiable information: **No**
- [ ] Health information: **No**
- [ ] Financial and payment information: **No**
- [ ] Authentication information: **No**. The optional Meta token is stored only locally and sent only to Meta. If a reviewer considers it authentication information, tick this box; the certifications below still hold.
- [ ] Personal communications: **No**
- [ ] Location: **No**
- [ ] User activity (clicks, keystrokes): **No**

### Certifications (tick all three; all are true)
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL
```
https://baydon-create.github.io/Adlumi/privacy.html
```

---

## 3. Distribution tab
- **Visibility:** Public (choose *Unlisted* first if you want to test with a few people before launch)
- **Regions:** All regions
- **Pricing:** Free (Pro upgrades will be sold through Lemon Squeezy license keys, not through the store)

---

## 4. Notes for the reviewer (Test instructions field)
```
No account or login is required.
1. Open https://www.facebook.com/ads/library/ (logged in to Facebook), choose a country and "All ads", and search any brand (e.g. "Nike").
2. Each ad card shows a "Running N days" badge and a "Save to Adlumi" button; a floating "Save all visible" button appears bottom-right.
3. Click the Adlumi toolbar icon → "Open dashboard" to see saved ads, Market Intelligence and Settings.
Optional features ("Meta Ad Search" with the user's own Meta token, and "Analyze landing page", which requests per-site permission at click time) are not required for testing.
```
