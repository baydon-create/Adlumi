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
      return {
        advertiser: nameLines[0] || handle,
        advertiserUrl: handle ? `https://x.com/${handle.slice(1)}` : '',
        text: A.text(tweet.querySelector('[data-testid="tweetText"]')),
        headline: card ? A.lines(card).find((l) => !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(l) && !/^From /.test(l)) || '' : '',
        cta: A.findCta(tweet),
        // Card links are t.co shorteners; the card shows the real domain as text.
        landingUrl: card?.querySelector('a[href]')?.href || '',
        postUrl: statusLink ? statusLink.href.split('?')[0] : '',
        ...A.collectMedia(tweet, 150),
        extra: {
          engagement: A.engagement(tweet),
          cardDomain: card ? A.lines(card).find((l) => /^(From )?[a-z0-9.-]+\.[a-z]{2,}$/i.test(l))?.replace(/^From /, '') || '' : '',
          placement: 'timeline',
        },
      };
    },
  });
})();
