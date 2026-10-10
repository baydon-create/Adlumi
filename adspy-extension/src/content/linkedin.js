// LinkedIn feed: "Promoted" posts.
(() => {
  const A = window.__adspy;
  const OWN = ['linkedin.com', 'licdn.com', 'lnkd.in'];

  function isPromoted(post) {
    const sub = post.querySelector('.update-components-actor__sub-description, .update-components-actor__description');
    if (sub && /\bPromoted\b/i.test(A.text(sub))) return true;
    for (const n of post.querySelectorAll('span[aria-hidden="true"], span.visually-hidden')) {
      const t = A.text(n);
      if (t.length < 30 && /^Promoted( by .+)?$/i.test(t)) return true;
    }
    return false;
  }

  A.register({
    platform: 'linkedin',
    selector: 'div.feed-shared-update-v2, div[data-urn^="urn:li:activity"], div[data-id^="urn:li:activity"]',
    isAd: isPromoted,
    extract(post) {
      const advEl = post.querySelector(
        '.update-components-actor__title span[aria-hidden="true"], .update-components-actor__name span[aria-hidden="true"], .update-components-actor__title'
      );
      const advLink = post.querySelector('a.update-components-actor__meta-link, a.update-components-actor__image');
      return {
        advertiser: A.text(advEl),
        advertiserUrl: advLink ? advLink.href.split('?')[0] : '',
        text: A.text(post.querySelector('.update-components-text, .feed-shared-text, .feed-shared-inline-show-more-text')),
        headline: A.text(
          post.querySelector('.update-components-article__title, .feed-shared-article__title, .update-components-image__headline')
        ),
        cta: A.findCta(post),
        landingUrl: A.findLanding(post, OWN),
        ...A.collectMedia(post, 160),
        extra: { engagement: A.engagement(post), placement: 'feed' },
      };
    },
  });
})();
