// Shared capture engine for all platform content scripts. Platform scripts call
// __adspy.register({ platform, selector, isAd, extract }) and this file handles
// scheduling, de-duplication, settings, messaging and on-page badges.
(() => {
  if (window.__adspy) return;

  const SPONSORED =
    /^(sponsored|promoted|ad|sponsorisé|sponsorisée|patrocinado|patrocinada|publicidad|gesponsert|anzeige|sponsorizzato|gesponsord|sponsorowane|sponsrad|sponset|sponsoroitu|реклама|sponsorlu|ممول|إعلان|اعلان|برعاية|مدعوم|赞助内容|贊助|広告|광고|bersponsor|được tài trợ|ได้รับการสนับสนุน|प्रायोजित)$/i;

  /**
   * Locale normalisation: Arabic-Indic digits -> ASCII, Arabic decimal/thousands marks,
   * and removal of Arabic diacritics/tatweel (Facebook writes "مُموَّل" for "ممول").
   */
  const normalize = (str) =>
    String(str ?? '')
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
      .replace(/\u066B/g, '.')
      .replace(/\u066C/g, ',')
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '');

  const CTA_LABELS = [
    'Shop now', 'Learn more', 'Sign up', 'Download', 'Install now', 'Install', 'Book now', 'Contact us',
    'Get offer', 'Get offers', 'Order now', 'Subscribe', 'Apply now', 'Watch more', 'Get quote',
    'Send message', 'Send WhatsApp message', 'WhatsApp', 'Play game', 'Use app', 'Donate now', 'See menu',
    'Get directions', 'Listen now', 'Buy now', 'Buy tickets', 'Visit site', 'Visit website', 'Call now',
    'Get started', 'Request time', 'Get showtimes', 'Open link', 'Start order', 'Try for free', 'Get app',
    'Register', 'Get access', 'Claim offer', 'Watch now', 'View more', 'Get promotions', 'Inquire now',
    'Book a demo', 'Request demo', 'Get the app', 'Shop', 'Order', 'Get deal', 'See details', 'Join now',
  ];
  // Arabic button labels, mapped to the English label so stats group them together.
  const CTA_AR = {
    'تسوق الآن': 'Shop now', 'التسوق الآن': 'Shop now', 'تسوق الان': 'Shop now', 'اعرف المزيد': 'Learn more',
    'معرفة المزيد': 'Learn more', 'اطلب الآن': 'Order now', 'اطلب الان': 'Order now', 'سجل الآن': 'Sign up',
    'التسجيل': 'Sign up', 'إرسال رسالة': 'Send message', 'أرسل رسالة': 'Send message', 'احجز الآن': 'Book now',
    'تنزيل': 'Download', 'اتصل بنا': 'Contact us', 'اتصل الآن': 'Call now', 'الحصول على العرض': 'Get offer',
    'احصل على العرض': 'Get offer', 'قدم الآن': 'Apply now', 'تقدم الآن': 'Apply now', 'شاهد المزيد': 'Watch more',
    'اشترك': 'Subscribe', 'اشترك الآن': 'Subscribe', 'تثبيت الآن': 'Install now', 'استخدام التطبيق': 'Use app',
    'إرسال رسالة واتساب': 'Send WhatsApp message', 'واتساب': 'WhatsApp', 'اشتر الآن': 'Buy now', 'شراء الآن': 'Buy now',
    'زيارة الموقع': 'Visit website', 'ابدأ الآن': 'Get started', 'الحصول على عرض سعر': 'Get quote',
  };
  const CTA = new Map([
    ...CTA_LABELS.map((l) => [l.toLowerCase(), l]),
    ...Object.entries(CTA_AR).map(([ar, en]) => [normalize(ar), en]),
  ]);

  const settings = { paused: false, badges: true, platforms: {} };
  let alive = true;

  try {
    chrome.storage.local.get('settings', (r) => r?.settings && Object.assign(settings, r.settings));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings?.newValue) Object.assign(settings, changes.settings.newValue);
    });
  } catch {
    alive = false;
  }

  // ---------- DOM helpers ----------
  const text = (el) => normalize(el ? (el.innerText ?? el.textContent ?? '') : '').replace(/\s+/g, ' ').trim();
  const lines = (el) => normalize(el?.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const longest = (els) =>
    [...els].map(text).reduce((best, t) => (t.length > best.length ? t : best), '');

  const TRACKING_PARAMS = ['fbclid', 'gclid', 'dclid', 'msclkid', '__cft__[0]', '__tn__', 'igshid', 'si'];

  function cleanUrl(href) {
    try {
      const u = new URL(href);
      TRACKING_PARAMS.forEach((p) => u.searchParams.delete(p));
      for (const k of [...u.searchParams.keys()]) if (k.startsWith('__cft__')) u.searchParams.delete(k);
      return u.href;
    } catch {
      return '';
    }
  }

  /** Unwraps platform click-tracking redirects to the real destination URL. */
  function decodeRedirect(href) {
    if (!href) return '';
    let u;
    try {
      u = new URL(href, location.href);
    } catch {
      return '';
    }
    const pick = (...keys) => {
      for (const k of keys) {
        const v = u.searchParams.get(k);
        if (v && /^https?:/i.test(v)) return cleanUrl(v);
      }
      return '';
    };
    const h = u.hostname;
    if (/^l[m]?\.(facebook|instagram|messenger)\.com$/.test(h) || u.pathname === '/l.php') return pick('u') || u.href;
    if (h.endsWith('youtube.com') && u.pathname === '/redirect') return pick('q') || u.href;
    if (/(^|\.)google(adservices|syndication)?\.[a-z.]+$/.test(h) && /aclk|\/url$/.test(u.pathname))
      return pick('adurl', 'url', 'q') || u.href;
    if (h === 'out.reddit.com' || h === 'alb.reddit.com') return pick('url') || u.href;
    if (h.endsWith('linkedin.com') && u.pathname.startsWith('/redir')) return pick('url') || u.href;
    return cleanUrl(u.href);
  }

  const domainOf = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  const isExternal = (href, ownHosts) => {
    const d = domainOf(href);
    return !!d && !ownHosts.some((h) => d === h || d.endsWith(`.${h}`));
  };

  const COPY_SELECTOR = '[data-ad-preview="message"], [data-ad-comet-preview="message"], div[style*="pre-wrap"], div[style*="pre-line"]';

  /**
   * The ad's real destination. Ad copy often links the bare homepage ("order at
   * brand.com") before the creative, so links are scored instead of taking the
   * first one: the CTA button / creative attachment and deep URLs win, links
   * inside the copy lose.
   */
  function findLanding(root, ownHosts) {
    let best = null;
    root.querySelectorAll('a[href]').forEach((a, i) => {
      const dest = decodeRedirect(a.href);
      if (!dest || !isExternal(dest, ownHosts)) return;
      let score = -i * 0.01; // document order only breaks ties
      const label = text(a).toLowerCase();
      if (CTA.has(label) || [...a.querySelectorAll('div, span')].some((n) => CTA.has(text(n).toLowerCase()))) score += 4;
      if (a.querySelector('img, video')) score += 2;
      if (a.closest(COPY_SELECTOR)) score -= 3;
      try {
        const u = new URL(dest);
        if (u.pathname.length > 1) score += 2;
        if (u.search) score += 0.5;
      } catch {}
      if (!best || score > best.score) best = { dest, score };
    });
    return best?.dest || '';
  }

  function findCta(root) {
    for (const n of root.querySelectorAll('a, button, [role="button"], [role="link"]')) {
      const t = text(n).toLowerCase();
      if (t && t.length <= 30 && CTA.has(t)) return CTA.get(t);
    }
    return '';
  }

  function collectMedia(root, minSize = 140) {
    const urls = new Set();
    let video = false;
    root.querySelectorAll('video').forEach((v) => {
      video = true;
      if (v.poster) urls.add(v.poster);
    });
    root.querySelectorAll('img').forEach((img) => {
      const src = img.currentSrc || img.src;
      if (!src || !/^https?:/.test(src)) return;
      const r = img.getBoundingClientRect();
      const w = Math.max(r.width, img.width);
      const h = Math.max(r.height, img.height);
      if (w < minSize || h < minSize * 0.5) return;
      urls.add(src);
    });
    const mediaUrls = [...urls].slice(0, 10);
    const mediaType = video ? 'video' : mediaUrls.length > 1 ? 'carousel' : mediaUrls.length ? 'image' : 'text';
    return { mediaUrls, mediaType };
  }

  /** "1.2K" -> 1200, "3,456" -> 3456, "1,2 M" -> 1200000 (mirrors src/lib/estimates.js). */
  function parseCount(v) {
    if (v == null) return null;
    const m = normalize(v).replace(/\s/g, '').match(/^(\d[\d.,]*)([KkMmBb]|ألف|الف|مليون|مليار)?/);
    if (!m) return null;
    let num = m[1];
    if (/^\d{1,3}(,\d{3})+$/.test(num)) num = num.replace(/,/g, '');
    else if (/^\d{1,3}(\.\d{3})+$/.test(num) && !m[2]) num = num.replace(/\./g, '');
    else num = num.replace(',', '.');
    const n = parseFloat(num);
    const mult = { k: 1e3, m: 1e6, b: 1e9, 'ألف': 1e3, 'الف': 1e3, 'مليون': 1e6, 'مليار': 1e9 }[(m[2] || '').toLowerCase()] || 1;
    return Number.isFinite(n) ? Math.round(n * mult) : null;
  }

  const NUM = String.raw`(\d[\d.,]*\s?(?:[KkMmBb]|ألف|الف|مليون)?)`;
  const COUNT_PATTERNS = {
    reactions: [String.raw`All reactions:?\s*${NUM}`, String.raw`${NUM}\s+reactions?\b`, String.raw`كل التفاعلات:?\s*${NUM}`],
    comments: [String.raw`${NUM}\s+comments?\b`, String.raw`View all ${NUM} comments`, String.raw`${NUM}\s+replies\b`, String.raw`${NUM}\s+(?:تعليقات|تعليقًا|تعليقا|تعليق)`],
    shares: [String.raw`${NUM}\s+(?:shares?|reposts?|retweets?)\b`, String.raw`${NUM}\s+(?:مشاركات|مشاركة)`],
    views: [String.raw`${NUM}\s+(?:views?|plays?)\b`, String.raw`${NUM}\s+(?:مشاهدات|مشاهدة)`],
    likes: [String.raw`${NUM}\s+likes?\b`, String.raw`${NUM}\s+(?:إعجابات|إعجاب)`],
  };

  /**
   * Numeric engagement counters from visible text and aria-labels.
   * `overrides` (platform-specific readings) win over the generic text patterns.
   */
  function engagement(root, overrides = {}) {
    const sources = [normalize(root.innerText || '')];
    root.querySelectorAll('[aria-label]').forEach((n) => {
      const label = n.getAttribute('aria-label');
      if (label && label.length < 200 && /\d/.test(normalize(label))) sources.push(normalize(label));
    });
    const text = sources.join('\n');
    const out = {};
    for (const [key, patterns] of Object.entries(COUNT_PATTERNS)) {
      for (const p of patterns) {
        const v = parseCount(text.match(new RegExp(p, 'i'))?.[1]);
        if (v != null) {
          out[key] = v;
          break;
        }
      }
    }
    for (const [k, v] of Object.entries(overrides)) {
      const n = typeof v === 'number' ? v : parseCount(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  }

  // cyrb53: fast, well-distributed 53-bit string hash
  function hash(str) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  // Signed CDN URLs change between views, so the identity is built from the creative's
  // copy and destination; media paths are only used when there is no copy at all.
  function makeId(ad) {
    const copy = `${ad.text || ''}${ad.headline || ''}`.slice(0, 300);
    const media = copy ? '' : (ad.mediaUrls?.[0] || '').split('?')[0];
    const key = [ad.platform, ad.advertiser, copy, domainOf(ad.landingUrl), media].join('|').toLowerCase();
    return `${ad.platform}-${hash(key)}`;
  }

  // ---------- messaging & badges ----------
  function send(ad, el, type = 'ad:capture') {
    if (!alive) return;
    ad.id ||= makeId(ad);
    ad.landingDomain = domainOf(ad.landingUrl);
    ad.pageUrl = location.href;
    try {
      chrome.runtime.sendMessage({ type, ad }, () => void chrome.runtime.lastError);
    } catch {
      alive = false; // extension was reloaded; this page's script is orphaned
      return;
    }
    if (el && settings.badges !== false && type === 'ad:capture') badge(el);
  }

  // Engagement counters often render after the post, so captured ads are re-read
  // a few times; the worker merges these without counting a new sighting.
  const REFRESH_DELAYS = [4000, 15000, 60000];
  function scheduleRefresh(def, el, id) {
    for (const delay of REFRESH_DELAYS) {
      setTimeout(() => {
        if (!alive || !el.isConnected) return;
        try {
          const ad = def.extract(el);
          if (ad) send({ platform: def.platform, source: 'feed', ...ad, id }, el, 'ad:refresh');
        } catch {}
      }, delay);
    }
  }

  let styleInjected = false;
  function badge(el, label = 'Adlumi ✓') {
    if (!styleInjected) {
      const style = document.createElement('style');
      style.textContent = `.adspy-badge{position:absolute;top:6px;right:6px;z-index:2147483000;background:#6d4aff;color:#fff;font:600 11px/1 system-ui,sans-serif;padding:4px 7px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.25);pointer-events:none;letter-spacing:.2px}`;
      document.documentElement.appendChild(style);
      styleInjected = true;
    }
    if (el.querySelector(':scope > .adspy-badge')) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const b = document.createElement('div');
    b.className = 'adspy-badge';
    b.textContent = label;
    el.appendChild(b);
  }

  // ---------- scan loop ----------
  const defs = [];
  const checks = new WeakMap();
  const MAX_CHECKS = 30; // labels can render late, so non-ads are re-checked a few times

  const nearViewport = (el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > -innerHeight && r.top < innerHeight * 2;
  };

  function scan() {
    if (!alive || settings.paused) return;
    for (const def of defs) {
      if (settings.platforms?.[def.platform] === false) continue;
      if (def.active && !def.active()) {
        def.onInactive?.();
        continue;
      }
      if (def.scan) {
        try {
          def.scan();
        } catch {}
        continue;
      }
      for (const el of document.querySelectorAll(def.selector)) {
        // Selectors can match nested containers of the same post; capture it once.
        if (el.closest('[data-adspy]') || el.querySelector('[data-adspy]') || !nearViewport(el)) continue;
        const n = checks.get(el) || 0;
        if (n >= MAX_CHECKS) continue;
        checks.set(el, n + 1);
        let ad;
        try {
          if (!def.isAd(el)) continue;
          ad = def.extract(el);
        } catch {
          continue;
        }
        if (!ad || !(ad.advertiser || ad.text || ad.headline)) continue;
        el.dataset.adspy = '1';
        const full = { platform: def.platform, source: 'feed', ...ad };
        send(full, el);
        scheduleRefresh(def, el, full.id);
      }
    }
  }

  let timer = null;
  const schedule = () => {
    if (!timer) timer = setTimeout(() => ((timer = null), scan()), 700);
  };

  let started = false;
  function register(def) {
    defs.push(def);
    if (started) return;
    started = true;
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    addEventListener('scroll', schedule, { passive: true });
    setInterval(scan, 4000);
    schedule();
  }

  window.__adspy = {
    SPONSORED, normalize, settings, register, send, badge, text, lines, longest, cleanUrl, decodeRedirect,
    domainOf, isExternal, findLanding, findCta, collectMedia, engagement, parseCount, hash,
  };
})();
