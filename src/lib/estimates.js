// Performance estimation for competitor ads.
//
// Spend, CPM, CTR, CPA and revenue are private to the advertiser, so every number
// here is a modelled RANGE built from the strongest public signal available for the
// ad (Meta's own impression/spend ranges > EU reach > X view counts > video views >
// engagement > longevity), combined with platform/industry/country benchmarks.
// Each estimate carries a confidence level and a plain-language "basis" trail.

export const DAY = 86400000;

// Benchmarks for a tier-1 market (US/UK/CA/AU/Nordics/DE...), USD.
// cpm: cost per 1000 impressions; ctr: link click-through rate;
// er: engagements (reactions+comments+shares) per impression;
// viewRate: share of impressions counted as a "view"/"play" by the platform.
export const PLATFORM_BENCH = {
  facebook: { cpm: [7, 16], ctr: [0.008, 0.016], er: [0.0008, 0.006], viewRate: [0.15, 0.4] },
  instagram: { cpm: [6, 14], ctr: [0.005, 0.012], er: [0.001, 0.008], viewRate: [0.2, 0.45] },
  youtube: { cpm: [6, 15], ctr: [0.003, 0.008], er: [0.0002, 0.002], viewRate: [0.15, 0.35] },
  linkedin: { cpm: [30, 60], ctr: [0.004, 0.008], er: [0.003, 0.01] },
  reddit: { cpm: [3, 8], ctr: [0.002, 0.006], er: [0.0002, 0.002] },
  x: { cpm: [4, 9], ctr: [0.005, 0.012], er: [0.001, 0.006], viewRate: [0.8, 1] }, // X "views" are impressions
  google: { cpm: null, ctr: [0.03, 0.07], cpc: [1, 4] },
};
PLATFORM_BENCH.adlibrary = PLATFORM_BENCH.facebook;

// cvr: landing-page conversion rate; aov: average order value (null = lead/install
// business where revenue per conversion is unknowable); goal names the conversion.
export const INDUSTRIES = [
  { key: 'fashion', label: 'Fashion & accessories', goal: 'purchase', cvr: [0.01, 0.025], aov: [45, 110], cpm: 1,
    re: /\b(dress|shirt|t-shirt|hoodie|sneakers?|shoes|boots|jewel(le)?ry|necklace|rings?|bracelet|apparel|clothing|fashion|leggings|outfit|handbag|wallet|sunglasses|swimwear|lingerie)\b/gi },
  { key: 'beauty', label: 'Beauty & skincare', goal: 'purchase', cvr: [0.015, 0.035], aov: [30, 75], cpm: 1,
    re: /\b(skin|skincare|serum|makeup|beauty|hair|lashes|cosmetics?|moisturi[sz]er|anti-aging|wrinkles?|fragrance|perfume|acne|glow|sunscreen|nails?)\b/gi },
  { key: 'health', label: 'Health & supplements', goal: 'purchase', cvr: [0.015, 0.04], aov: [40, 95], cpm: 1.05,
    re: /\b(supplements?|vitamins?|protein|gut|probiotics?|weight ?loss|keto|collagen|sleep|wellness|health|detox|joints?|immune|bloating|energy|metabolism|gummies)\b/gi },
  { key: 'fitness', label: 'Fitness', goal: 'purchase', cvr: [0.01, 0.03], aov: [40, 120], cpm: 1,
    re: /\b(workouts?|fitness|gym|yoga|pilates|muscle|abs|dumbbells?|training plan|running)\b/gi },
  { key: 'home', label: 'Home & garden', goal: 'purchase', cvr: [0.008, 0.022], aov: [60, 180], cpm: 0.95,
    re: /\b(furniture|sofa|couch|mattress|bedding|pillows?|kitchen|decor|garden|cleaning|vacuum|cookware|rugs?|lamps?|candles?)\b/gi },
  { key: 'food', label: 'Food & beverage', goal: 'purchase', cvr: [0.02, 0.05], aov: [30, 70], cpm: 0.9,
    re: /\b(coffee|snacks?|meals?|recipes?|food|tea|chocolate|restaurant|delivery|drinks?|wine|beer|organic|protein bars?)\b/gi },
  { key: 'pets', label: 'Pets', goal: 'purchase', cvr: [0.015, 0.035], aov: [35, 80], cpm: 0.9,
    re: /\b(dogs?|cats?|pets?|puppy|puppies|kittens?|paws?|leash|litter)\b/gi },
  { key: 'tech', label: 'Consumer tech & gadgets', goal: 'purchase', cvr: [0.008, 0.02], aov: [50, 160], cpm: 1.05,
    re: /\b(gadgets?|headphones|earbuds|chargers?|phone case|laptops?|cameras?|smart home|drones?|speakers?|smartwatch|keyboard)\b/gi },
  { key: 'travel', label: 'Travel', goal: 'booking', cvr: [0.01, 0.03], aov: [150, 600], cpm: 1,
    re: /\b(hotels?|flights?|travel|vacation|resort|booking|tours?|cruise|getaway|holiday)\b/gi },
  { key: 'saas', label: 'Software / SaaS / B2B', goal: 'sign-up', cvr: [0.03, 0.08], aov: null, cpm: 1.25,
    re: /\b(software|saas|crm|platform|automat\w*|workflows?|dashboard|api|free trial|b2b|teams?|productivity|integrations?|ai tool|analytics)\b/gi },
  { key: 'finance', label: 'Finance & insurance', goal: 'lead', cvr: [0.02, 0.06], aov: null, cpm: 1.4,
    re: /\b(loans?|credit|insurance|invest\w*|trading|crypto|bank\w*|mortgage|tax(es)?|savings|budget|forex|stocks?)\b/gi },
  { key: 'education', label: 'Education & coaching', goal: 'lead', cvr: [0.03, 0.1], aov: null, cpm: 1,
    re: /\b(course|masterclass|learn|coaching|coach|webinar|certificat\w*|bootcamp|tutor\w*|training|mentor\w*|workshop)\b/gi },
  { key: 'realestate', label: 'Real estate', goal: 'lead', cvr: [0.02, 0.05], aov: null, cpm: 1.15,
    re: /\b(real estate|apartments?|condos?|realtor|property|properties|homes for sale|villa|rent)\b/gi },
  { key: 'apps', label: 'Apps & games', goal: 'install', cvr: [0.05, 0.15], aov: null, cpm: 0.9,
    re: /\b(download the app|app store|google play|mobile game|play now|install now|get the app|new levels?)\b/gi },
  { key: 'local', label: 'Local services', goal: 'lead', cvr: [0.04, 0.12], aov: null, cpm: 0.9,
    re: /\b(near you|appointment|clinic|dentist|dental|salon|plumb\w*|lawyer|attorney|contractor|roofing|hvac|repair|cleaners?)\b/gi },
];
const OTHER = { key: 'other', label: 'Other / general', goal: 'purchase', cvr: [0.015, 0.04], aov: [40, 100], cpm: 1 };
export const INDUSTRY_BY_KEY = Object.fromEntries([...INDUSTRIES, OTHER].map((i) => [i.key, i]));

const TIERS = [
  [1, 'US CA GB UK AU NZ CH NO DK SE DE NL IE LU IS AT FI BE'],
  [0.65, 'FR IT ES PT JP KR SG HK TW AE SA QA KW IL PL CZ EE SI SK LT LV'],
  [0.3, 'BR MX TR ZA AR CL CO PE MY TH RO HU GR HR BG RS CN UA'],
  [0.15, 'IN PK BD EG ID PH VN NG KE MA DZ TN LK NP GH ET'],
];
export function regionMultiplier(country) {
  const c = String(country || 'US').toUpperCase();
  for (const [m, list] of TIERS) if (list.split(' ').includes(c)) return m;
  return 0.4;
}

/** "1.2K" -> 1200, "3,456" -> 3456, "1,2 M" -> 1200000. */
export function parseCount(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const m = String(s).replace(/\s/g, '').match(/^(\d[\d.,]*)([KkMmBb])?/);
  if (!m) return null;
  let num = m[1];
  if (/^\d{1,3}(,\d{3})+$/.test(num)) num = num.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+$/.test(num) && !m[2]) num = num.replace(/\./g, '');
  else num = num.replace(',', '.');
  const n = parseFloat(num);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1));
}

// ------------------------------------------------------------------ prices & currency
const toAsciiDigits = (s) =>
  String(s ?? '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, ',');

// Approximate USD conversion rates, used only to put prices on a common scale.
export const USD_RATES = { USD: 1, EUR: 1.1, GBP: 1.3, EGP: 0.021, SAR: 0.267, AED: 0.272, KWD: 3.25, QAR: 0.275 };

const CUR = String.raw`(?:US\$|E£|£E|L\.?E\b|EGP|ج\.?\s?م|جنيه|SAR|ر\.?\s?س|ريال|AED|د\.?\s?إ|درهم|KWD|QAR|USD|EUR|GBP|[$€£])`;
const AMOUNT = String.raw`\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
/** Matches "$1,299.00", "1.299,00 €", "499 جنيه", "EGP 1,250", "LE 350" … */
export const PRICE_RE = new RegExp(`${CUR}\\s?(?:${AMOUNT})|(?:${AMOUNT})\\s?${CUR}`, 'gi');

export function currencyOf(s) {
  const t = toAsciiDigits(s);
  if (/E£|£E|L\.?E\b|EGP|ج\.?\s?م|جنيه/i.test(t)) return 'EGP';
  if (/SAR|ر\.?\s?س|ريال/i.test(t)) return 'SAR';
  if (/AED|د\.?\s?إ|درهم/i.test(t)) return 'AED';
  if (/KWD/i.test(t)) return 'KWD';
  if (/QAR/i.test(t)) return 'QAR';
  if (/€|EUR/i.test(t)) return 'EUR';
  if (/£|GBP/i.test(t)) return 'GBP';
  if (/\$|USD/i.test(t)) return 'USD';
  return null;
}

/** "1,299.00" -> 1299, "1.299,50" -> 1299.5, "39,00" -> 39, "٤٩٩" -> 499. The last 1–2 digit group is decimals. */
export function parsePrice(s) {
  const t = toAsciiDigits(s).replace(/[^\d.,]/g, '');
  if (!/\d/.test(t)) return null;
  const m = t.match(/^(.*?)(?:[.,](\d{1,2}))?$/);
  const n = parseFloat(m[1].replace(/[.,]/g, '') + (m[2] ? `.${m[2]}` : ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Price strings -> USD amounts (approximate conversion; unknown currencies are dropped). */
export function pricesInUsd(strings, fallbackCurrency = null) {
  return strings
    .map((p) => {
      const value = parsePrice(p);
      const rate = USD_RATES[currencyOf(p) || fallbackCurrency];
      return value && rate ? value * rate : null;
    })
    .filter((n) => n > 0);
}

// ------------------------------------------------------------------ classification
const adCorpus = (ad) =>
  [ad.headline, ad.text, ad.landingDomain, ad.extra?.landing?.title, ad.extra?.landing?.description, ad.extra?.keyword]
    .filter(Boolean)
    .join(' ');

export function classifyIndustry(ad) {
  if (ad.extra?.industry && INDUSTRY_BY_KEY[ad.extra.industry]) return INDUSTRY_BY_KEY[ad.extra.industry];
  const corpus = adCorpus(ad);
  let best = OTHER;
  let bestScore = 0;
  for (const ind of INDUSTRIES) {
    const hits = corpus.match(ind.re)?.length || 0;
    let score = hits;
    if (ind.key === 'apps' && /install|use app|play game/i.test(ad.cta || '')) score += 3;
    if (ind.goal === 'lead' && /get quote|sign up|book now|contact us|apply now|request/i.test(ad.cta || '')) score += 0.5;
    if (ind.goal === 'purchase' && /shop|buy|order/i.test(ad.cta || '')) score += 0.5;
    if (score > bestScore) {
      best = ind;
      bestScore = score;
    }
  }
  return bestScore >= 1 ? best : OTHER;
}

export function countryOf(ad, settings = {}) {
  return ad.extra?.countries?.[0] || settings.marketCountry || 'US';
}

// ------------------------------------------------------------------ time & engagement
export function runningDays(ad, now = Date.now()) {
  if (ad.startedRunning) {
    const end = ad.active === false ? ad.lastSeen || now : now;
    return Math.max(1, Math.round((end - Date.parse(ad.startedRunning)) / DAY));
  }
  return Math.max(1, Math.round(((ad.lastSeen || now) - (ad.firstSeen || now)) / DAY) + 1);
}

const ENGAGEMENT_KEYS = ['reactions', 'likes', 'comments', 'shares', 'bookmarks'];
export const engagementTotal = (e = {}) =>
  // Facebook "reactions" already include likes; only add likes when reactions are missing.
  (e.reactions ?? e.likes ?? 0) + (e.comments || 0) + (e.shares || 0) + (e.bookmarks || 0);

export function engagementStats(ad, now = Date.now()) {
  const e = ad.extra?.engagement || {};
  const hasData = ENGAGEMENT_KEYS.some((k) => Number.isFinite(e[k]));
  const total = engagementTotal(e);
  const days = runningDays(ad, now);
  const history = (ad.history || []).filter((h) => Number.isFinite(h.total));
  let velocity = null;
  if (history.length >= 2) {
    const first = history[0];
    const last = history[history.length - 1];
    const spanDays = (last.t - first.t) / DAY;
    if (spanDays >= 0.25) velocity = Math.max(0, (last.total - first.total) / spanDays);
  }
  return {
    hasData,
    total,
    views: e.views ?? null,
    perDay: hasData ? total / days : null,
    velocity, // engagements/day measured between your own sightings
    commentShare: total ? (e.comments || 0) / total : null, // high = purchase questions / controversy
    shareShare: total ? (e.shares || 0) / total : null, // high = viral / word-of-mouth potential
    history,
  };
}

// ------------------------------------------------------------------ estimation
// Ranges are treated as ~90% intervals of log-normal quantities. Multiplying
// independent uncertain factors adds their log-variances (not their extremes), which
// keeps intervals honest without compounding every worst case.
const Z90 = 1.645;
const fromMidSigma = (mid, sigma) => ({ mid, sigma, lo: mid * Math.exp(-Z90 * sigma), hi: mid * Math.exp(Z90 * sigma) });
const rng = (lo, hi) => fromMidSigma(Math.sqrt(lo * hi), Math.log(hi / lo) / (2 * Z90));
const mul = (a, b) => fromMidSigma(a.mid * b.mid, Math.hypot(a.sigma, b.sigma));
const div = (a, b) => fromMidSigma(a.mid / b.mid, Math.hypot(a.sigma, b.sigma));
const scale = (a, k) => fromMidSigma(a.mid * k, a.sigma);
const fixed = (v) => fromMidSigma(v, 0);

function rangeFrom(obj) {
  if (!obj) return null;
  const lo = parseCount(obj.lower_bound ?? obj.lo);
  const hi = parseCount(obj.upper_bound ?? obj.hi) ?? lo * 2;
  return lo != null ? rng(Math.max(lo, 1), Math.max(hi, lo, 1)) : null;
}

/**
 * @returns {{ industry, country, confidence, confidenceScore, method, basis: string[],
 *   impressions, spend, dailySpend, cpm, ctr, clicks, cpc, cvr, conversions, cpa, aov, revenue, roas, goal }}
 *   every metric is { lo, mid, hi } or null when it can't be estimated.
 */
export function estimate(ad, settings = {}, now = Date.now()) {
  const bench = PLATFORM_BENCH[ad.platform] || PLATFORM_BENCH.facebook;
  const industry = classifyIndustry(ad);
  const country = countryOf(ad, settings);
  const geo = regionMultiplier(country);
  const days = runningDays(ad, now);
  const eng = engagementStats(ad, now);
  const basis = [];

  let cpm = settings.cpmOverride
    ? fixed(Number(settings.cpmOverride))
    : bench.cpm && scale(rng(...bench.cpm), geo * industry.cpm);
  const ctr = rng(...bench.ctr);
  const cvr = settings.cvrOverride ? fixed(Number(settings.cvrOverride) / 100) : rng(...industry.cvr);
  const landing = ad.extra?.landing;
  const landingPrices = pricesInUsd(landing?.prices || [], landing?.currency);
  let aov = null;
  if (settings.aovOverride) aov = fixed(Number(settings.aovOverride));
  else if (landingPrices.length >= 2) {
    const sorted = landingPrices.sort((a, b) => a - b);
    aov = rng(sorted[Math.floor(sorted.length * 0.25)], sorted[Math.floor(sorted.length * 0.75)] * 1.3);
    const cur = landing?.currency && landing.currency !== 'USD' ? ` (converted from ${landing.currency} at an approximate rate)` : '';
    basis.push(`Order value taken from prices found on the landing page${cur}.`);
  } else if (industry.aov) aov = rng(...industry.aov);

  let impressions = null;
  let spend = null;
  let method = 'none';
  let confidenceScore = 0;
  const x = ad.extra || {};

  // 1. Meta's own disclosed ranges (political/issue ads)
  const apiSpend = rangeFrom(x.spend);
  const apiImpr = rangeFrom(x.impressions);
  if (apiSpend || apiImpr) {
    impressions = apiImpr;
    spend = apiSpend;
    method = 'Meta disclosed ranges';
    confidenceScore = 0.9;
    basis.push(`Meta discloses ${apiSpend ? 'spend' : ''}${apiSpend && apiImpr ? ' and ' : ''}${apiImpr ? 'impressions' : ''} ranges for this ad.`);
  } else if (ad.platform === 'x' && Number.isFinite(eng.views) && eng.views > 0) {
    // 2. X shows impression counts as "views"
    impressions = div(fixed(eng.views), rng(...bench.viewRate));
    method = 'X view count';
    confidenceScore = 0.7;
    basis.push(`X shows ${eng.views.toLocaleString()} views, which are counted impressions.`);
  } else if (Number.isFinite(parseCount(x.euReach)) && parseCount(x.euReach) > 0) {
    // 3. EU transparency reach × typical frequency
    const reach = parseCount(x.euReach);
    impressions = mul(fixed(reach), rng(1.3, 2.5));
    method = 'EU reach × frequency';
    confidenceScore = 0.65;
    basis.push(`Meta reports ${reach.toLocaleString()} people reached in the EU; assumed frequency 1.3–2.5.`);
  } else if (Number.isFinite(eng.views) && eng.views > 0 && bench.viewRate) {
    // 4. Video views ÷ view rate
    impressions = div(fixed(eng.views), rng(...bench.viewRate));
    method = 'Video views ÷ view rate';
    confidenceScore = 0.45;
    basis.push(`${eng.views.toLocaleString()} video views; ${Math.round(bench.viewRate[0] * 100)}–${Math.round(bench.viewRate[1] * 100)}% of impressions usually count as a view.`);
  } else if (eng.hasData && eng.total > 0 && bench.er) {
    // 5. Engagement ÷ engagement rate
    impressions = div(fixed(eng.total), rng(...bench.er));
    method = 'Engagement ÷ engagement rate';
    confidenceScore = 0.3;
    basis.push(`${eng.total.toLocaleString()} visible engagements; ads typically get ${(bench.er[0] * 100).toFixed(2)}–${(bench.er[1] * 100).toFixed(1)}% engagement per impression.`);
  } else if (cpm && (ad.startedRunning || days > 1)) {
    // 6. Longevity prior: an ad kept alive this long is usually funded at a sustained daily budget
    const variants = Math.min(Number(x.adsUsingCreative) || 1, 20);
    spend = scale(rng(15, 250), days * Math.sqrt(variants));
    method = 'Longevity prior';
    confidenceScore = 0.12;
    basis.push(`No reach or engagement signal, so this assumes a $15–250/day budget over ${days} days${variants > 1 ? ` across ~${variants} variations` : ''}.`);
  }

  if (impressions && spend && method === 'Meta disclosed ranges') {
    cpm = scale(div(spend, impressions), 1000); // the advertiser's actual CPM
    basis.push(`Actual CPM from Meta's figures: ~$${cpm.mid.toFixed(2)}.`);
  }
  if (impressions && !spend && cpm) spend = scale(mul(impressions, cpm), 1 / 1000);
  if (spend && !impressions && cpm) impressions = scale(div(spend, cpm), 1000);

  if (cpm && method !== 'Meta disclosed ranges') {
    basis.push(`CPM $${cpm.lo.toFixed(2)}–$${cpm.hi.toFixed(2)} (${ad.platform} benchmark × ${country} market ×${geo} × ${industry.label}).`);
  }

  const clicks = impressions ? mul(impressions, ctr) : null;
  let cpc = cpm ? scale(div(cpm, ctr), 1 / 1000) : null;
  if (ad.platform === 'google') {
    cpc = scale(rng(...bench.cpc), geo * industry.cpm);
    method = method === 'none' ? 'Benchmark only' : method;
    confidenceScore = Math.max(confidenceScore, 0.15);
    basis.push('Google does not disclose reach for search ads; CPC/CPA come from keyword benchmarks only.');
  }
  const conversions = clicks ? mul(clicks, cvr) : null;
  const cpa = cpc ? div(cpc, cvr) : null;
  const revenue = conversions && aov ? mul(conversions, aov) : null;
  // ROAS = CTR × CVR × AOV ÷ CPC-per-click cost; computed directly so the shared
  // impressions uncertainty cancels instead of being counted twice.
  let roas = cpa && aov ? div(aov, cpa) : null;
  if (!aov) basis.push(`${industry.label} usually converts to a ${industry.goal}; revenue per ${industry.goal} isn't public, so revenue/ROAS are omitted.`);
  basis.push(`Conversion rate ${(cvr.lo * 100).toFixed(1)}–${(cvr.hi * 100).toFixed(1)}% to ${industry.goal} (${industry.label} benchmark).`);

  // Survival bias works in our favour: unprofitable ads are rarely left running for weeks.
  if (days >= 30 && ad.active !== false) {
    basis.push(`Still running after ${days} days, so it most likely meets the advertiser's break-even ROAS.`);
    confidenceScore = Math.min(1, confidenceScore + 0.05);
    if (roas && roas.lo < 1) {
      // Condition on survival: an ad losing money for a month would have been switched off.
      const lo = 1;
      const hi = Math.max(roas.hi, 1.5);
      roas = { ...rng(lo, hi), survivalAdjusted: true };
    }
  }

  if (!ad.startedRunning && method !== 'Longevity prior' && method !== 'none') {
    basis.push('Start date unknown, so this is spend to date with no daily rate. Find the ad in the Meta Ad Library to get its start date.');
  }
  const confidence = confidenceScore >= 0.8 ? 'High' : confidenceScore >= 0.55 ? 'Medium' : confidenceScore >= 0.25 ? 'Low' : 'Very low';
  return {
    industry, country, days, method, confidence, confidenceScore, basis,
    goal: industry.goal,
    impressions, spend,
    // Cumulative signals (reach, engagement, views) can't be split per day without a start date.
    dailySpend: spend && (ad.startedRunning || method === 'Longevity prior') ? scale(spend, 1 / days) : null,
    cpm, ctr, clicks, cpc, cvr, conversions, cpa, aov, revenue, roas,
  };
}

// ------------------------------------------------------------------ winning-ad score
/** 0–100 composite of the public signals that correlate with a profitable ad. */
export function winningScore(ad, now = Date.now()) {
  const x = ad.extra || {};
  const eng = engagementStats(ad, now);
  const days = runningDays(ad, now);
  const factors = [];
  const add = (label, weight, value, detail) => factors.push({ label, weight, value: Math.max(0, Math.min(1, value)), detail });

  add('Longevity', ad.startedRunning ? 35 : 20, Math.log1p(days) / Math.log1p(90),
    ad.startedRunning ? `${days} days running` : `seen over ${days} day${days > 1 ? 's' : ''}`);
  if (typeof ad.active === 'boolean') add('Still active', 10, ad.active ? 1 : 0.15, ad.active ? 'active now' : 'stopped');
  if (x.adsUsingCreative || x.multipleVersions) {
    const n = Number(x.adsUsingCreative) || 2;
    add('Scaling (variations)', 15, Math.log2(1 + n) / Math.log2(21), `${n} ads use this creative`);
  }
  if (eng.hasData) {
    const perDay = eng.velocity ?? eng.perDay;
    add('Engagement', 20, Math.log10(1 + perDay) / Math.log10(501), `${Math.round(perDay).toLocaleString()} engagements/day`);
  }
  if (Number.isFinite(parseCount(x.euReach))) add('Reach', 10, Math.log10(1 + parseCount(x.euReach)) / 6, `${parseCount(x.euReach).toLocaleString()} EU reach`);
  if (x.publisherPlatforms?.length) add('Placements', 5, x.publisherPlatforms.length / 4, x.publisherPlatforms.join(', ').toLowerCase());
  add('Frequency (you)', 10, ((ad.seenCount || 1) - 1) / 9, `you saw it ${ad.seenCount || 1}×`);

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round((100 * factors.reduce((s, f) => s + f.weight * f.value, 0)) / totalWeight);
  return { score, factors };
}

// ------------------------------------------------------------------ messaging analysis
export const ANGLES = [
  ['Discount / price', /\b\d{1,2}\s?% off|\bsave \$?\d|\bsale\b|\bdiscount|\bdeal\b|\bcoupon|\bpromo code|\bhalf price|\$\d/i],
  ['Urgency / scarcity', /\btoday only|\blimited|\bends (tonight|soon|today)|\blast chance|\bhurry|\bwhile supplies|\bselling (out|fast)|\bsold out|\bonly \d+ left|\bdon'?t miss/i],
  ['Social proof', /\b\d[\d,.]*\+?\s?(k\s)?(customers|reviews|people|users|members|sold|5-star)|\bbest[- ]?seller|\bviral\b|\beveryone is|\btrusted by|\b★|⭐/i],
  ['Authority / expert', /\bdoctor|\bdermatologist|\bclinically|\bscientif|\bexpert|\bas seen (on|in)|\bawarded|\bcertified|\bpatented|\bresearch/i],
  ['Guarantee / risk reversal', /\bguarantee|\bmoney[- ]back|\brisk[- ]free|\bfree returns|\bno questions asked|\bcancel anytime/i],
  ['Problem / pain', /\btired of|\bstruggl|\bstop (wasting|suffering)|\bsick of|\bfrustrat|\bpain\b|\bproblem|\bworried|\bembarrass/i],
  ['Transformation / results', /\bin (just )?\d+ (days|weeks|minutes)|\bresults|\bbefore (and|&) after|\btransform|\bfinally\b|\bimagine|\bwithout (dieting|the gym)/i],
  ['Curiosity / question', /\?|\bsecret|\bwhy (most|you)|\bhere'?s (how|why|what)|\bthe truth|\bnobody tells|\bthis one/i],
  ['Free offer / lead magnet', /\bfree (guide|trial|ebook|webinar|consultation|quote|sample|gift|class)|\btry (it )?(for )?free|\bdownload (the|our|your) free/i],
  ['Free shipping', /\bfree (shipping|delivery)/i],
  ['New / launch', /\bnew\b|\bintroducing|\bjust (launched|dropped)|\bbrand[- ]new|\bfirst ever/i],
  ['UGC / testimonial', /\bI (tried|was|used|love|bought|can'?t)|\bmy (skin|hair|life|husband|wife|kids|dog)|^["“]|\bhonest review|\bchanged my/i],
  ['Gift / seasonal', /\bgift|\bholiday|\bchristmas|\bblack friday|\bcyber monday|\bmother'?s day|\bfather'?s day|\bvalentine|\bback to school|\bsummer/i],
];

export function anglesOf(ad) {
  const t = `${ad.headline || ''} ${ad.text || ''}`;
  return ANGLES.filter(([, re]) => re.test(t)).map(([name]) => name);
}

export function offersOf(ad) {
  const t = `${ad.headline || ''} ${ad.text || ''} ${(ad.extra?.landing?.offers || []).join(' ')}`;
  const out = [];
  for (const m of toAsciiDigits(t).matchAll(/\b(\d{1,2})\s?% off|(?:خصم|تخفيض)\s*(\d{1,2})\s*[%٪]|(\d{1,2})\s*[%٪]\s*(?:خصم|تخفيض)/gi)) out.push(`${m[1] || m[2] || m[3]}% off`);
  if (/شحن مجاني|توصيل مجاني/.test(t)) out.push('Free shipping');
  if (/\bfree (shipping|delivery)/i.test(t)) out.push('Free shipping');
  if (/\bbuy (one|1),? get (one|1)|\bBOGO\b/i.test(t)) out.push('BOGO');
  if (/\bfree trial/i.test(t)) out.push('Free trial');
  if (/\bmoney[- ]back|\bguarantee/i.test(t)) out.push('Guarantee');
  if (/\bfree gift/i.test(t)) out.push('Free gift');
  for (const m of t.matchAll(/\b(\d+)[- ]day (trial|guarantee|returns?)/gi)) out.push(`${m[1]}-day ${m[2].toLowerCase()}`);
  return [...new Set(out)];
}

/** Prices mentioned in the ad copy, in approximate USD. */
export function pricePoints(ad) {
  const t = toAsciiDigits(`${ad.headline || ''} ${ad.text || ''}`);
  return pricesInUsd(t.match(PRICE_RE) || []);
}

export const hookOf = (ad) => (ad.text || ad.headline || '').split(/(?<=[.!?])\s|\n/)[0].slice(0, 160).trim();

const STOP = new Set('a an the and or but of to in on for with at by from is are was be it this that your you our we us my me i they them their its as so if not no do does can will just get got more most all any out up now new one off than then there here what when how why who which'.split(' '));

/** Frequent 2–3 word phrases, with "lift" = how much more common they are in winning ads. */
export function phraseStats(ads, isWinner, { min = 2, limit = 30 } = {}) {
  const counts = new Map();
  let winners = 0;
  for (const ad of ads) {
    const win = isWinner(ad);
    if (win) winners++;
    const words = `${ad.headline || ''} ${ad.text || ''}`.toLowerCase().replace(/https?:\/\/\S+/g, ' ').match(/[\p{L}\p{N}%$'’]+/gu) || [];
    const seen = new Set();
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n);
        if (STOP.has(gram[0]) || STOP.has(gram[n - 1])) continue;
        seen.add(gram.join(' '));
      }
    }
    for (const g of seen) {
      const c = counts.get(g) || { phrase: g, ads: 0, winners: 0 };
      c.ads++;
      if (win) c.winners++;
      counts.set(g, c);
    }
  }
  const winRate = winners / Math.max(1, ads.length);
  return [...counts.values()]
    .filter((c) => c.ads >= min)
    .map((c) => ({ ...c, lift: winRate ? c.winners / c.ads / winRate : 0 }))
    .sort((a, b) => b.ads * (1 + b.lift) - a.ads * (1 + a.lift))
    .slice(0, limit);
}
