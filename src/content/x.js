// X / Twitter: promoted tweets ("Ad" / "Promoted" label in the tweet header).
(() => {
  const A = window.__adspy;
  const OWN = ['x.com', 'twitter.com', 'twimg.com'];

  function isPromoted(tweet) {
    for (const span of tweet.querySelectorAll('span')) {
      if (span.closest('[data-testid="tweetText"]')) continue;
      const t = span.textContent.trim();
      if (t === 'Ad' || t === 'Promoted') return true;
    }
    return !!tweet.querySelector('[data-testid="placementTracking"]') && /\bAd\b/.test(A.text(tweet).slice(0, 200));
  }

  A.register({
    platform: 'x',
    selector: 'article[data-testid="tweet"]',
    isAd: isPromoted,
    extract(tweet) {
      const nameLines = A.lines(tweet.querySelector('[data-testid="User-Name"]'));
      const card = tweet.querySelector('[data-testid="card.wrapper"]');
      const handle = nameLines.find((l) => l.startsWith('@')) || '';
      const statusLink = tweet.querySelector('a[href*="/status/"]');
      // Check each text element (not rendered lines): the domain often shares a line with the headline.
      const DOMAIN = /^(?:From )?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})$/i;
      const cardDomain = card ? [...card.querySelectorAll('span, div')].map((n) => A.text(n).match(DOMAIN)?.[1]).find(Boolean) || '' : '';
      return {
        advertiser: nameLines[0] || handle,
        advertiserUrl: handle ? `https://x.com/${handle.slice(1)}` : '',
        text: A.text(tweet.querySelector('[data-testid="tweetText"]')),
        headline: card ? A.lines(card).find((l) => !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(l) && !/^From /.test(l)) || '' : '',
        cta: A.findCta(tweet),
        // Card links are t.co shorteners; the card shows the real domain as text, which is far
        // more useful for domain stats and landing-page analysis than "t.co".
        landingUrl: cardDomain ? `https://${cardDomain.toLowerCase()}` : card?.querySelector('a[href]')?.href || '',
        postUrl: statusLink ? statusLink.href.split('?')[0] : '',
        ...A.collectMedia(tweet, 150),
        extra: {
          engagement: (() => {
            // e.g. "12 replies, 34 reposts, 567 likes, 8 bookmarks, 15022 views"
            const bar = tweet.querySelector('[role="group"][aria-label]')?.getAttribute('aria-label') || '';
            const pick = (re) => A.parseCount(bar.match(re)?.[1]);
            const viewsLink = tweet.querySelector('a[href$="/analytics"]')?.getAttribute('aria-label') || '';
            return A.engagement(tweet, {
              comments: pick(/(\d[\d.,]*[KMB]?) repl/i),
              shares: pick(/(\d[\d.,]*[KMB]?) (?:repost|retweet)/i),
              likes: pick(/(\d[\d.,]*[KMB]?) like/i),
              bookmarks: pick(/(\d[\d.,]*[KMB]?) bookmark/i),
              views: pick(/(\d[\d.,]*[KMB]?) view/i) ?? A.parseCount(viewsLink.match(/(\d[\d.,]*[KMB]?) view/i)?.[1]),
            });
          })(),
          cardDomain,
          shortLink: card?.querySelector('a[href]')?.href || '',
          placement: 'timeline',
        },
      };
    },
  });
})();
