// Reddit: promoted posts on new Reddit (shreddit-ad-post) and old Reddit (.promotedlink).
(() => {
  const A = window.__adspy;
  const OWN = ['reddit.com', 'redd.it', 'redditmedia.com', 'redditstatic.com'];

  A.register({
    platform: 'reddit',
    selector: 'shreddit-ad-post, .promotedlink, article:has(shreddit-ad-post)',
    isAd: () => true,
    extract(el) {
      const attr = (name) => el.getAttribute?.(name) || el.querySelector('shreddit-ad-post')?.getAttribute(name) || '';
      const authorLink = el.querySelector('a[href*="/user/"], a[href*="/u/"], .author');
      return {
        advertiser: attr('author') || A.text(authorLink).replace(/^u\//, ''),
        advertiserUrl: authorLink ? authorLink.href : '',
        headline: attr('post-title') || A.text(el.querySelector('[slot="title"], h2, h3, a.title, [id^="post-title"]')),
        text: A.text(el.querySelector('[slot="text-body"], .md, .usertext-body')),
        cta: A.findCta(el),
        landingUrl: A.decodeRedirect(attr('outbound-link') || attr('content-href')) || A.findLanding(el, OWN),
        ...A.collectMedia(el, 140),
        extra: { placement: 'feed', subreddit: attr('subreddit-prefixed-name') },
      };
    },
  });
})();
