// YouTube: in-feed / search / sidebar ad slots, plus in-stream video ads in the player.
(() => {
  const A = window.__adspy;
  const OWN = ['youtube.com', 'youtu.be', 'ytimg.com', 'google.com', 'googleadservices.com', 'doubleclick.net'];

  const SLOT_SELECTOR = [
    'ytd-ad-slot-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-promoted-video-renderer',
    'ytd-display-ad-renderer',
    'ytd-search-pyv-renderer',
    'ytd-action-companion-ad-renderer',
    'ytd-companion-slot-renderer',
    'ytd-statement-banner-renderer',
  ]
    .map((s) => `${s}:not(ytd-ad-slot-renderer ${s})`)
    .join(', ');

  const pickText = (root, selectors) => {
    for (const sel of selectors) {
      const t = A.text(root.querySelector(sel));
      if (t) return t;
    }
    return '';
  };

  A.register({
    platform: 'youtube',
    selector: SLOT_SELECTOR,
    isAd: (el) => A.text(el).length > 3,
    extract(el) {
      const landingUrl = A.findLanding(el, OWN);
      return {
        headline: pickText(el, ['#title', '.title', 'h3', '[id*="headline" i]', '#video-title']),
        advertiser:
          pickText(el, ['#website-text', '#domain', '.ytd-ad-meta', '#channel-name', '[class*="advertiser" i]']) ||
          A.domainOf(landingUrl),
        text: pickText(el, ['#description', '#body-text', '#description-text', '.description']),
        cta: pickText(el, ['ytd-button-renderer button', 'button[aria-label]', '#action-button']) || A.findCta(el),
        landingUrl,
        postUrl: (() => {
          const a = el.querySelector('a[href*="/watch?v="]');
          return a ? a.href.split('&')[0] : '';
        })(),
        ...A.collectMedia(el, 100),
        extra: { placement: location.pathname.startsWith('/results') ? 'search' : location.pathname === '/watch' ? 'watch_sidebar' : 'home_feed' },
      };
    },
  });

  // In-stream (pre-roll / mid-roll) ads: the player gets the "ad-showing" class.
  let lastKey = '';
  A.register({
    platform: 'youtube',
    scan() {
      const player = document.querySelector('#movie_player.ad-showing, .html5-video-player.ad-showing');
      if (!player) return void (lastKey = '');
      const advertiser = pickText(player, [
        '.ytp-ad-visit-advertiser-button',
        '.ytp-visit-advertiser-link__text',
        '.ytp-ad-player-overlay-layout__ad-info-container',
        '.ytp-ad-button-text',
      ]);
      const headline = pickText(player, ['.ytp-flyout-cta-headline-container', '.ytp-ad-overlay-title', '.ytp-ad-text']);
      const cta = pickText(player, ['.ytp-ad-button-vm', '.ytp-flyout-cta-action-button', '.ytp-ad-call-to-action']);
      const key = `${advertiser}|${headline}`;
      if (!advertiser && !headline) return;
      if (key === lastKey) return;
      lastKey = key;
      const videoId = new URL(location.href).searchParams.get('v');
      A.send({
        platform: 'youtube',
        source: 'feed',
        advertiser,
        headline,
        cta,
        text: '',
        landingUrl: /\./.test(advertiser) && !/\s/.test(advertiser) ? `https://${advertiser}` : '',
        mediaType: 'video',
        mediaUrls: [],
        extra: { placement: 'in_stream', hostVideo: videoId ? `https://www.youtube.com/watch?v=${videoId}` : '' },
      });
    },
  });
})();
