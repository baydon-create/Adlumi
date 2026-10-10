// Google Search: text ads (top and bottom), tagged with the keyword that triggered them.
(() => {
  const A = window.__adspy;
  const OWN = ['google.com', 'googleadservices.com', 'gstatic.com', 'doubleclick.net'];

  A.register({
    platform: 'google',
    selector: '[data-text-ad], #tads > div, #bottomads > div, #tadsb > div',
    isAd: (el) => !!el.querySelector('a[href]') && A.text(el).length > 10,
    extract(el) {
      const link = [...el.querySelectorAll('a[href]')].find((a) => A.isExternal(A.decodeRedirect(a.href), OWN));
      const landingUrl = link ? A.decodeRedirect(link.getAttribute('data-pcu')?.split(',')[0] || link.href) : '';
      const headline = A.text(el.querySelector('[role="heading"]'));
      const linkLines = A.lines(link);
      const all = A.lines(el);
      const text = all
        .filter((l) => l !== headline && !linkLines.includes(l) && !A.SPONSORED.test(l) && l.length > 25)
        .join(' ');
      const q = new URL(location.href).searchParams.get('q') || '';
      return {
        advertiser: linkLines.find((l) => l !== headline && !/^https?:|›/.test(l)) || A.domainOf(landingUrl),
        headline,
        text,
        landingUrl,
        mediaType: 'text',
        mediaUrls: [],
        extra: { keyword: q, position: el.closest('#bottomads') ? 'bottom' : 'top', placement: 'search' },
      };
    },
  });
})();
