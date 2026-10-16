// Runs inside the dashboard page: builds a fictional demo library for store screenshots.
async (count) => {
  const db = await import('../src/lib/db.js');
  await db.clearAll();
  const DAY = 864e5, now = Date.now();
  const brands = [
    { name: 'Lumora Skin', domain: 'lumoraskin.com', hue: 275 },
    { name: 'Dermavia', domain: 'dermavia.co', hue: 200 },
    { name: 'Solenne Beauty', domain: 'solennebeauty.com', hue: 330 },
    { name: 'Velora Labs', domain: 'veloralabs.com', hue: 160 },
    { name: 'Purecrest', domain: 'purecrest.shop', hue: 30 },
    { name: 'Halo & Fern', domain: 'haloandfern.com', hue: 100 },
  ];
  const copies = [
    ['Tired of dull skin? Our Vitamin C serum gives visible glow in 7 days. 30% off today only + free shipping.', 'Vitamin C Glow Serum', 'Shop now'],
    ['Why do dermatologists recommend this night cream? Here’s the science behind overnight repair.', 'Overnight Repair Cream', 'Learn more'],
    ['Join 50,000+ happy customers. Our bestselling hydration duo is back in stock.', 'Hydration Duo', 'Shop now'],
    ['I tried every serum for my acne scars and this is the only one that worked. Honest review 👇', 'Clear Skin Serum', 'Shop now'],
    ['Money-back guarantee. Try our retinol for 60 days risk-free.', 'Gentle Retinol 0.3%', 'Shop now'],
    ['Limited stock: our summer SPF 50 sells out every year. Don’t miss it.', 'Daily SPF 50', 'Order now'],
    ['New: the barrier cream your sensitive skin has been waiting for.', 'Barrier Rescue Cream', 'Learn more'],
    ['Buy one get one free on all cleansers this weekend only!', 'Foaming Cleanser', 'Shop now'],
    ['Clinically tested: 92% saw smoother skin in 4 weeks.', 'Peptide Firming Serum', 'Shop now'],
    ['The secret to glass skin? Three steps, five minutes a day.', 'Glass Skin Set', 'Shop now'],
    ['Free gift with every order over $50 🎁 Holiday sets are here.', 'Holiday Gift Set', 'Shop now'],
    ['Stop wasting money on products that don’t work. Get a free skin quiz.', 'Free Skin Quiz', 'Sign up'],
  ];
  const ages = { '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0 };
  function thumb(hue, label) {
    const c = new OffscreenCanvas(480, 384);
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 480, 384);
    grd.addColorStop(0, `hsl(${hue} 70% 88%)`);
    grd.addColorStop(1, `hsl(${(hue + 40) % 360} 65% 72%)`);
    g.fillStyle = grd; g.fillRect(0, 0, 480, 384);
    // product bottle
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.roundRect(200, 90, 80, 210, 18); g.fill();
    g.fillStyle = `hsl(${hue} 45% 35%)`; g.beginPath(); g.roundRect(214, 60, 52, 40, 8); g.fill();
    g.fillStyle = `hsl(${hue} 50% 40%)`; g.fillRect(212, 170, 56, 46);
    g.fillStyle = '#fff'; g.font = '700 26px system-ui'; g.textAlign = 'center';
    g.fillText(label, 240, 345);
    return c.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  }
  const ads = [];
  let n = 0;
  for (const [bi, b] of brands.entries()) {
    const k = [5, 6, 4, 3, 3, 2][bi];
    for (let i = 0; i < k; i++) {
      const [text, headline, cta] = copies[(bi * 3 + i * 5) % copies.length];
      const days = [214, 160, 95, 61, 38, 21, 12, 6, 3][(bi + i * 2) % 9];
      const id = `fb-lib-99${String(1000000000000 + n++)}`;
      const lib = n % 4 !== 0;
      const eng = lib ? null : { reactions: 300 + n * 137, comments: 40 + n * 9, shares: 10 + n * 3 };
      const reach = lib && days >= 38 ? 80000 + n * 21000 : undefined; // long-running EU ads have Meta-reported reach
      ads.push({
        id, platform: lib ? 'adlibrary' : n % 2 ? 'facebook' : 'instagram', source: lib ? 'adlibrary' : 'feed',
        advertiser: b.name, advertiserUrl: `https://www.facebook.com/${b.domain}`, text, headline, cta,
        landingUrl: `https://${b.domain}/products/${headline.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, landingDomain: b.domain,
        mediaType: n % 5 === 0 ? 'video' : n % 7 === 0 ? 'carousel' : 'image', mediaUrls: [],
        postUrl: lib ? `https://www.facebook.com/ads/library/?id=${id.slice(7)}` : '',
        startedRunning: lib ? new Date(now - days * DAY).toISOString().slice(0, 10) : '',
        active: lib ? days > 5 : undefined,
        firstSeen: now - Math.min(days, 20) * DAY, lastSeen: now - (n % 3) * DAY, seenCount: 1 + (n % 4),
        favorite: n % 6 === 0, tags: n % 5 === 0 ? ['competitor'] : [], notes: '',
        history: eng ? [{ t: now - 3 * DAY, total: (eng.reactions + eng.comments + eng.shares) * 0.7 }, { t: now, total: eng.reactions + eng.comments + eng.shares }] : [],
        extra: {
          libraryId: lib ? id.slice(7) : undefined,
          adsUsingCreative: lib && days > 60 ? 2 + (n % 9) : undefined,
          engagement: eng || undefined, placement: lib ? undefined : 'news_feed',
          euReach: reach, countries: reach ? ['DE'] : undefined,
          publisherPlatforms: reach ? ['FACEBOOK', 'INSTAGRAM'] : undefined,
          audience: reach ? { ages: { '18-24': reach * 0.18, '25-34': reach * 0.44, '35-44': reach * 0.26, '45-54': reach * 0.12 }, genders: { female: reach * 0.86, male: reach * 0.14 }, countries: { DE: reach * 0.6, FR: reach * 0.25, NL: reach * 0.15 } } : undefined,
          targeting: reach ? { ages: '21–54', gender: 'All', locations: ['Germany', 'France', 'Netherlands'] } : undefined,
          landing: bi < 2 && i === 0 ? { title: `${headline} – ${b.name}`, description: 'Dermatologist-developed skincare.', platform: ['Shopify'], tracking: ['Meta Pixel', 'TikTok Pixel', 'Google Analytics 4', 'Klaviyo'], apps: ['Judge.me reviews', 'Klarna'], prices: ['$34.00', '$58.00', '$89.00'], currency: 'USD', offers: ['30% off', 'free shipping'], analyzedAt: now } : undefined,
        },
      });
      await db.putThumb(id, await thumb(b.hue, headline.split(' ').slice(0, 2).join(' ')));
    }
  }
  await db.bulkPut(ads);
  return ads.length;
}
