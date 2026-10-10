// Instagram feed: sponsored posts and paid partnerships.
(() => {
  const A = window.__adspy;
  const OWN = ['instagram.com', 'cdninstagram.com', 'facebook.com', 'fbcdn.net'];

  function label(post) {
    const header = post.querySelector('header') || post;
    for (const n of header.querySelectorAll('span, a, div')) {
      const t = A.text(n);
      if (t.length > 30) continue;
      if (A.SPONSORED.test(t)) return 'sponsored';
      if (/^paid partnership/i.test(t)) return 'branded';
    }
    return '';
  }

  A.register({
    platform: 'instagram',
    selector: 'article',
    isAd: (post) => !!label(post),
    extract(post) {
      const header = post.querySelector('header');
      const advLink = header?.querySelector('a[href^="/"][role="link"], a[href^="/"]');
      const caption = A.longest(post.querySelectorAll('h1, span[dir="auto"], div[dir="auto"] > span'));
      return {
        advertiser: A.text(advLink) || A.lines(header)[0] || '',
        advertiserUrl: advLink ? advLink.href.split('?')[0] : '',
        text: caption,
        cta: A.findCta(post),
        landingUrl: A.findLanding(post, OWN),
        postUrl: (() => {
          const a = post.querySelector('a[href*="/p/"], a[href*="/reel/"]');
          return a ? a.href.split('?')[0] : '';
        })(),
        ...A.collectMedia(post, 200),
        extra: { kind: label(post), engagement: A.engagement(post), placement: 'feed' },
      };
    },
  });
})();
