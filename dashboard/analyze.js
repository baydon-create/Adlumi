// Landing-page intelligence: fetches an ad's destination and fingerprints the store
// platform, tracking pixels, apps and price points. Host access is requested per
// origin at click time (optional_host_permissions), so nothing is fetched silently.

const SIGNATURES = {
  platform: [
    ['Shopify', /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i],
    ['WooCommerce', /woocommerce|wc-ajax/i],
    ['BigCommerce', /bigcommerce\.com|stencil-utils/i],
    ['Magento', /Magento_|mage\/cookies/i],
    ['Wix', /static\.wixstatic\.com|_wixCIDX/i],
    ['Squarespace', /static1\.squarespace\.com/i],
    ['Webflow', /data-wf-page|webflow\.js/i],
    ['ClickFunnels', /clickfunnels/i],
    ['GoHighLevel', /leadconnectorhq|msgsndr\.com/i],
    ['Kajabi', /kajabi-cdn|kajabi\.com/i],
    ['Framer', /framerusercontent\.com/i],
    ['WordPress', /wp-content|wp-includes/i],
    ['Next.js', /__NEXT_DATA__|\/_next\/static/],
  ],
  tracking: [
    ['Meta Pixel', /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(\s*['"]init/i],
    ['Google Analytics 4', /gtag\/js\?id=G-|['"]G-[A-Z0-9]{6,}['"]/],
    ['Google Ads', /['"]AW-\d{6,}|googleadservices\.com\/pagead\/conversion/],
    ['Google Tag Manager', /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/],
    ['TikTok Pixel', /analytics\.tiktok\.com|ttq\.load/i],
    ['Snap Pixel', /sc-static\.net\/scevent|snaptr\(/i],
    ['Pinterest Tag', /s\.pinimg\.com\/ct|pintrk\(/i],
    ['LinkedIn Insight', /snap\.licdn\.com|_linkedin_partner_id/i],
    ['X Pixel', /static\.ads-twitter\.com|twq\(/i],
    ['Reddit Pixel', /redditstatic\.com\/ads|rdt\(/i],
    ['Klaviyo', /klaviyo/i],
    ['Hotjar', /static\.hotjar\.com/i],
    ['Microsoft Clarity', /clarity\.ms/i],
    ['Triple Whale', /triplewhale|triplepixel/i],
  ],
  apps: [
    ['Judge.me reviews', /judge\.me/i],
    ['Loox reviews', /loox\.io/i],
    ['Yotpo', /yotpo/i],
    ['Okendo', /okendo/i],
    ['Stamped', /stamped\.io/i],
    ['Recharge subscriptions', /rechargepayments|rechargecdn/i],
    ['Klarna', /klarna/i],
    ['Afterpay', /afterpay/i],
    ['Shop Pay', /shop-pay|shopify-payment/i],
    ['Gorgias chat', /gorgias/i],
    ['Intercom', /widget\.intercom\.io/i],
    ['Tidio chat', /tidio/i],
    ['Zendesk', /zdassets\.com/i],
    ['Privy popups', /privy\.com/i],
    ['Justuno', /justuno/i],
  ],
};

const match = (html, list) => list.filter(([, re]) => re.test(html)).map(([name]) => name);

/** Must be called from a user gesture (it may show a permission prompt). */
export async function analyzeLanding(url) {
  // "*.example.com" also matches the bare domain, covering www/shop redirects.
  const host = new URL(url).hostname.replace(/^www\./, '');
  const granted = await chrome.permissions.request({ origins: [`*://*.${host}/*`] });
  if (!granted) throw new Error('Permission to read this site was not granted.');

  const res = await fetch(url, { credentials: 'omit', redirect: 'follow' });
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const meta = (n) => doc.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.getAttribute('content') || '';
  const bodyText = doc.body?.textContent || '';
  const prices = [...new Set(bodyText.match(/(?:[$€£]\s?\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s?(?:€|USD|EUR|GBP))/g) || [])].slice(0, 10);

  const result = {
    finalUrl: res.url,
    status: res.status,
    title: doc.title.trim(),
    description: meta('description') || meta('og:description'),
    ogImage: meta('og:image'),
    platform: match(html, SIGNATURES.platform),
    tracking: match(html, SIGNATURES.tracking),
    apps: match(html, SIGNATURES.apps),
    prices,
    offers: [...new Set(bodyText.match(/\b\d{1,2}\s?% off\b|\bfree shipping\b|\bbuy \d+,? get \d+\b|\bBOGO\b/gi) || [])].slice(0, 6),
    analyzedAt: Date.now(),
  };

  // Shopify stores expose a public product feed: product count and price range.
  if (result.platform.includes('Shopify')) {
    try {
      const feed = await (await fetch(`${new URL(res.url).origin}/products.json?limit=250`, { credentials: 'omit' })).json();
      const products = feed.products || [];
      const variantPrices = products.flatMap((p) => p.variants.map((v) => Number(v.price))).filter((n) => n > 0);
      result.shopify = {
        products: products.length,
        minPrice: variantPrices.length ? Math.min(...variantPrices) : null,
        maxPrice: variantPrices.length ? Math.max(...variantPrices) : null,
        newest: products
          .slice()
          .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
          .slice(0, 5)
          .map((p) => ({ title: p.title, url: `${new URL(res.url).origin}/products/${p.handle}`, published: p.published_at })),
      };
    } catch {
      // products.json can be disabled by the store
    }
  }
  return result;
}
