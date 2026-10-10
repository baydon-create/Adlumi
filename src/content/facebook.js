// Facebook News Feed: detects sponsored posts as you scroll.
(() => {
  const A = window.__adspy;
  const OWN = ['facebook.com', 'fb.com', 'fbcdn.net', 'messenger.com', 'fb.me', 'fb.watch'];

  // Facebook obfuscates the "Sponsored" label (split letters, hidden decoys, SVG <use>
  // references), so several independent signals are checked.
  function svgLabel(root) {
    let out = '';
    root.querySelectorAll('svg use').forEach((u) => {
      const id = (u.getAttribute('xlink:href') || u.getAttribute('href') || '').replace(/^#/, '');
      const ref = id && document.getElementById(id);
      if (ref) out += ref.textContent;
    });
    root.querySelectorAll('svg text').forEach((t) => (out += t.textContent));
    return out.replace(/\s+/g, '');
  }

  function isSponsored(post) {
    if (post.querySelector('a[href*="/ads/about"], [aria-label="Sponsored" i], a[href*="ad_preferences"]')) return true;
    if (A.SPONSORED.test(A.normalize(svgLabel(post)))) return true;
    const nodes = post.querySelectorAll('a[role="link"] span, span[dir="auto"] > span, a[href="#"]');
    for (let i = 0; i < nodes.length && i < 250; i++) {
      const t = A.text(nodes[i]);
      if (t.length <= 24 && A.SPONSORED.test(t.replace(/[\s·]/g, ''))) return true;
    }
    // Weak signal: an outbound click-tracked link paired with an ad-style CTA button.
    return !!post.querySelector('a[href*="l.facebook.com/l.php"]') && !!A.findCta(post);
  }

  function headlineFrom(post, landingUrl) {
    const domain = A.domainOf(landingUrl).toLowerCase();
    for (const a of post.querySelectorAll('a[href*="l.facebook.com"], a[target="_blank"]')) {
      const candidates = A.lines(a).filter(
        (l) => l.toLowerCase() !== domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(l) && l.length > 3 && l.length < 200
      );
      if (candidates.length) return candidates[0];
    }
    return '';
  }

  // The reaction total sits in the post footer as a bare number ("1.2K") right before
  // the "N comments" / "N shares" counters, next to a "See who reacted" control.
  const COUNT_LINE = /^\d[\d.,]*\s?(?:[KM]|ألف|الف|مليون)?$/i;
  const COUNTER_LINE = /\d\s+(?:comments?|shares?|تعليقات|تعليقًا|تعليقا|تعليق|مشاركات|مشاركة)$/i;

  function reactions(post) {
    const reactedBtn = post.querySelector('[aria-label*="who reacted" i], [aria-label*="تفاعل"]');
    const near = reactedBtn && A.parseCount(A.lines(reactedBtn.parentElement).find((l) => COUNT_LINE.test(l)));
    if (near != null) return near;
    const ls = A.lines(post);
    const idx = ls.findIndex((l) => COUNTER_LINE.test(l));
    for (let i = idx - 1; i >= Math.max(0, idx - 3); i--) {
      if (COUNT_LINE.test(ls[i])) return A.parseCount(ls[i]);
    }
    return null;
  }

  function extract(post) {
    const advEl = post.querySelector('h2 a, h3 a, h4 a, strong a, h2 strong, h3 strong, h4 strong, h4 span');
    const advLink = advEl?.closest('a');
    const message =
      A.text(post.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"]')) ||
      A.longest(post.querySelectorAll('div[dir="auto"]'));
    const landingUrl = A.findLanding(post, OWN);
    const permalink = post.querySelector(
      'a[href*="/posts/"], a[href*="/videos/"], a[href*="/reel/"], a[href*="story_fbid"], a[href*="/permalink/"]'
    );
    return {
      advertiser: A.text(advEl),
      advertiserUrl: advLink ? advLink.href.split('?')[0] : '',
      text: message,
      headline: headlineFrom(post, landingUrl),
      cta: A.findCta(post),
      landingUrl,
      postUrl: permalink ? A.cleanUrl(permalink.href) : '',
      ...A.collectMedia(post, 180),
      extra: { engagement: A.engagement(post, { reactions: reactions(post) }), placement: 'news_feed' },
    };
  }

  A.register({
    platform: 'facebook',
    active: () => !location.pathname.startsWith('/ads/library'),
    selector: 'div[aria-posinset], div[data-pagelet^="FeedUnit"], div[role="article"]:not([role="article"] [role="article"])',
    isAd: isSponsored,
    extract,
  });
})();
