// Usage: node scripts/promo-video/director.mjs  (needs Node, Playwright and ffmpeg)
// Renders the Adlumi promo video frame by frame (1920x1080 @ 30fps) from the real
// extension driven with fictional demo data, then encodes it with ffmpeg.
import { chromium } from 'playwright'; // npm i playwright (uses Chromium)
import fs from 'fs';
import { execSync } from 'child_process';

const DIR = new URL('.', import.meta.url).pathname;
const EXT = new URL('../..', import.meta.url).pathname.replace(/\/$/, ''); // repo root = the extension
const FRAMES = `${DIR}frames`;
const FPS = 30;
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const ctx = await chromium.launchPersistentContext('', {
  headless: true, channel: 'chromium', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, colorScheme: 'light',
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--force-color-profile=srgb', '--hide-scrollbars'],
});
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const extId = sw.url().split('/')[2];
await new Promise((r) => setTimeout(r, 800));
for (const p of ctx.pages()) if (p.url().includes('welcome')) await p.close();

// ---------------------------------------------------------------- frame helpers
let frame = 0;
let page;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const cur = { x: 640, y: 420 };

async function snap() {
  const file = `${FRAMES}/${String(frame++).padStart(5, '0')}.jpg`;
  await page.screenshot({ path: file, type: 'jpeg', quality: 92 });
  return file;
}
/** Static hold: one screenshot, hard-linked for the remaining frames. */
async function hold(sec) {
  const n = Math.round(sec * FPS);
  if (!n) return;
  const first = await snap();
  for (let i = 1; i < n; i++) fs.linkSync(first, `${FRAMES}/${String(frame++).padStart(5, '0')}.jpg`);
}
/** Runs fn(t) for t in (0,1] once per frame, capturing each. */
async function animate(sec, fn) {
  const n = Math.max(1, Math.round(sec * FPS));
  for (let i = 1; i <= n; i++) {
    await fn(ease(i / n), i / n);
    await snap();
  }
}

const OVERLAY = `
<div id="__cap" style="position:absolute;left:50%;bottom:30px;transform:translateX(-50%);background:rgba(22,14,52,.9);color:#fff;
  font:600 21px/1.35 Inter,system-ui,sans-serif;padding:13px 24px;border-radius:14px;box-shadow:0 12px 32px rgba(10,0,40,.35);opacity:0;white-space:nowrap;letter-spacing:.1px"></div>
<div id="__hl" style="position:absolute;border:3px solid #f59e0b;border-radius:10px;opacity:0;box-shadow:0 0 0 6px rgba(245,158,11,.22)"></div>
<div id="__rip" style="position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(139,92,246,.35);border:2px solid #8b5cf6;opacity:0"></div>
<svg id="__cur" width="26" height="30" viewBox="0 0 26 30" style="position:absolute;left:640px;top:420px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
  <path d="M2 2 L2 24 L8 18.5 L12.5 28 L16.5 26.2 L12 17 L20 17 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>
<div id="__fade" style="position:absolute;inset:0;background:#1c1145;opacity:0"></div>`;

async function overlay() {
  await page.evaluate((html) => {
    if (document.getElementById('__ov')) return;
    const root = document.createElement('div');
    root.id = '__ov';
    Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });
    root.innerHTML = html;
    document.documentElement.appendChild(root);
  }, OVERLAY);
  await page.evaluate(({ x, y }) => Object.assign(document.getElementById('__cur').style, { left: `${x}px`, top: `${y}px` }), cur);
}
const setStyle = (id, style) => page.evaluate(({ id, style }) => Object.assign(document.getElementById(id).style, style), { id, style });
const cursorVisible = (v) => setStyle('__cur', { opacity: v ? '1' : '0' });

async function caption(html) {
  const visible = await page.evaluate(() => getComputedStyle(document.getElementById('__cap')).opacity > 0.5);
  if (visible) await animate(0.2, (t) => setStyle('__cap', { opacity: String(1 - t) }));
  await page.evaluate((html) => { document.getElementById('__cap').innerHTML = html; }, html);
  await animate(0.3, (t) => setStyle('__cap', { opacity: String(t), transform: `translateX(-50%) translateY(${(1 - t) * 12}px)` }));
}
const capLeft = (open) => setStyle('__cap', { left: open ? '360px' : '50%', fontSize: open ? '19px' : '21px' });
const step = (n, text) => `<span style="color:#c4b5fd;margin-right:10px">Step ${n}</span>${text}`;

async function fadeIn(sec = 0.4) { await animate(sec, (t) => setStyle('__fade', { opacity: String(1 - t) })); }
async function fadeOut(sec = 0.4) { await animate(sec, (t) => setStyle('__fade', { opacity: String(t) })); }

async function boxOf(locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('no box');
  return b;
}
async function moveTo(x, y, sec = 0.8) {
  const from = { ...cur };
  await animate(sec, (t) => {
    cur.x = from.x + (x - from.x) * t;
    cur.y = from.y + (y - from.y) * t;
    return setStyle('__cur', { left: `${cur.x}px`, top: `${cur.y}px` });
  });
}
async function moveToEl(locator, sec, dx = 0.5, dy = 0.5) {
  const b = await boxOf(locator);
  await moveTo(b.x + b.width * dx, b.y + b.height * dy, sec);
}
async function clickFx() {
  await animate(0.35, (t) => setStyle('__rip', { left: `${cur.x}px`, top: `${cur.y}px`, opacity: String(1 - t), transform: `scale(${0.4 + t * 1.2})` }));
}
async function clickEl(locator, sec = 0.8) {
  await moveToEl(locator, sec);
  await locator.click();
  await clickFx();
}
async function highlight(locator, sec = 0.35, pad = 6) {
  const b = await boxOf(locator);
  await setStyle('__hl', { left: `${b.x - pad}px`, top: `${b.y - pad}px`, width: `${b.width + pad * 2}px`, height: `${b.height + pad * 2}px` });
  await animate(sec, (t) => setStyle('__hl', { opacity: String(t) }));
}
const unhighlight = () => animate(0.25, (t) => setStyle('__hl', { opacity: String(1 - t) }));
async function scrollEl(selector, to, sec) {
  const from = await page.evaluate((s) => (s ? document.querySelector(s).scrollTop : window.scrollY), selector);
  await animate(sec, (t) => page.evaluate(({ s, y }) => (s ? (document.querySelector(s).scrollTop = y) : window.scrollTo(0, y)), { s: selector, y: from + (to - from) * t }));
}

// ---------------------------------------------------------------- title cards
const icon = 'data:image/png;base64,' + fs.readFileSync(`${EXT}/store/assets/icon-512.png`).toString('base64');
const cardPage = await ctx.newPage();
async function titleCard(html, sec, { inSec = 0.9 } = {}) {
  page = cardPage;
  await page.setContent(`<!doctype html><html><head><style>
    *{box-sizing:border-box}body{margin:0;width:1280px;height:720px;overflow:hidden;font-family:Inter,system-ui,sans-serif;color:#fff;
      background:radial-gradient(1200px 700px at 30% 20%,#6d4aff 0%,#4a2bd6 40%,#2a1670 100%)}
    .c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 80px}
    .a{opacity:0;transform:translateY(18px)} h1{font-size:58px;letter-spacing:-1px;margin:18px 0 10px;line-height:1.1} h2{font-size:40px;letter-spacing:-.5px;margin:0;line-height:1.2}
    p{font-size:24px;opacity:.88;margin:10px 0 0} .grad{background:linear-gradient(90deg,#ffd166,#ff8fd8);-webkit-background-clip:text;background-clip:text;color:transparent}
    .pill{display:inline-block;margin-top:26px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);padding:10px 20px;border-radius:999px;font-size:20px;font-weight:700}
    img.logo{width:120px;height:120px}
  </style></head><body><div class="c">${html}</div></body></html>`);
  await overlay();
  await cursorVisible(false);
  const items = await page.$$('.a');
  const per = inSec / Math.max(1, items.length);
  for (const [i] of items.entries()) {
    await animate(per, (t) => page.evaluate(({ i, t }) => {
      const el = document.querySelectorAll('.a')[i];
      el.style.opacity = t; el.style.transform = `translateY(${(1 - t) * 18}px) scale(${0.96 + 0.04 * t})`;
    }, { i, t }));
  }
  await hold(sec);
}

// ================================================================= STORYBOARD
// 1. Opening
await titleCard(`<img class="logo a" src="${icon}"><h1 class="a">Adlumi</h1><p class="a">Find the competitor ads that are <b class="grad">actually winning</b></p>`, 2.2);
await fadeOut(0.35);
// 2. Hook
await titleCard(`<h2 class="a">Still scrolling the Ad Library for hours,</h2><h2 class="a">guessing which ads <span class="grad">really work?</span></h2>`, 1.8, { inSec: 0.8 });
await fadeOut(0.35);

// 3. Meta Ad Library enhancer (illustrative page, fictional advertisers)
const cards = [['Lumora Skin', 214, 9, 'Tired of dull skin? Our Vitamin C serum gives visible glow in 7 days.', 275],
  ['Solenne Beauty', 95, 4, 'Why do dermatologists recommend this night cream?', 330],
  ['Velora Labs', 12, 1, 'New: the barrier cream your sensitive skin has been waiting for.', 160]];
const art = (h) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,88%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},65%,72%)"/></linearGradient></defs><rect width="400" height="260" fill="url(#g)"/><rect x="170" y="55" width="60" height="160" rx="14" fill="#fff" opacity=".85"/><rect x="181" y="34" width="38" height="30" rx="6" fill="hsl(${h},45%,35%)"/></svg>`)}`;
await ctx.route('https://www.facebook.com/ads/library/**', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#f0f2f5;font:14px Inter,system-ui,sans-serif;color:#1c1e21}.bar{background:#fff;padding:14px 28px;font-weight:700;font-size:18px;border-bottom:1px solid #ddd}
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:20px 28px}.card{background:#fff;border-radius:10px;padding:14px;border:1px solid #dadde1}
  .meta{color:#65676b;font-size:13px;line-height:1.65}.card img{width:100%;border-radius:8px;margin-top:8px;display:block}.cta{margin-top:8px;background:#e4e6eb;border-radius:6px;padding:8px;text-align:center;font-weight:600;color:#1c1e21}
  a{color:#1c1e21;text-decoration:none}</style></head><body><div class="bar">Ad Library · results for "serum"</div><div class="grid">${cards.map(([name, days, v, text, hue], i) => {
    const d = new Date(Date.now() - days * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `<div class="card"><div class="meta"><span>Active</span><br><span>Library ID: 99887766554${4 + i}10</span><br><span>Started running on ${d}</span>${v > 1 ? `<br><span>${v} ads use this creative and text</span>` : ''}</div>
      <a href="https://www.facebook.com/x${i}" style="font-weight:700;display:block;margin-top:8px">${name}</a><div class="meta">Sponsored</div><div style="white-space:pre-wrap;margin-top:4px">${text}</div>
      <img src="${art(hue)}"><a href="https://l.facebook.com/l.php?u=${encodeURIComponent('https://example.com/p' + i)}"><div class="cta">Shop now</div></a></div>`;
  }).join('')}</div></body></html>` }));
page = await ctx.newPage();
await page.goto('https://www.facebook.com/ads/library/?q=serum');
await page.waitForSelector('.adspy-lib-bar');
await page.waitForTimeout(600);
await overlay();
await setStyle('__fade', { opacity: '1' });
await fadeIn(0.35);
await caption(step(1, 'Search any brand or keyword in the Meta Ad Library'));
await hold(1.2);
const firstPill = page.locator('.adspy-lib-bar .pill').first();
await moveToEl(firstPill, 0.9);
await highlight(firstPill);
await caption('Adlumi shows how long every ad has been running 🔥');
await hold(1.6);
await unhighlight();
await highlight(page.locator('.adspy-lib-bar .pill').nth(1));
await caption('…and how many variations the advertiser is scaling');
await hold(1.4);
await unhighlight();
await caption('Save every ad on the page with one click');
await clickEl(page.locator('#adspy-save-all'), 1.0);
await page.waitForTimeout(500);
await hold(1.4);
await fadeOut(0.35);

// 4. Library ranked by winning score
const dash = await ctx.newPage();
await dash.goto(`chrome-extension://${extId}/dashboard/dashboard.html`);
const seeded = await dash.evaluate(eval(fs.readFileSync(`${DIR}seed.js`, 'utf8')), 0);
await dash.reload();
await dash.waitForTimeout(900);
page = dash;
await overlay();
await setStyle('__fade', { opacity: '1' });
await fadeIn(0.35);
await caption(step(2, 'Every saved ad lands in your own searchable library'));
await hold(1.4);
const sort = page.locator('#f-sort');
await moveToEl(sort, 0.9);
await clickFx();
await sort.selectOption('score');
await page.waitForTimeout(500);
await caption('Sort by Winning Score to surface the strongest ads first ⚡');
await highlight(page.locator('.card .score').first(), 0.3, 5);
await hold(1.8);
await unhighlight();

// 5. Ad detail with performance estimate
await caption('Open any ad for estimated spend, CPM, CPA and ROAS');
// open the best-supported visible ad (Meta-reported reach -> medium confidence)
const pickIdx = await page.evaluate(async () => {
  const ads = await (await import('../src/lib/db.js')).allAds();
  const cards = [...document.querySelectorAll('#grid .card')].slice(0, 4);
  const i = cards.findIndex((c) => ads.some((a) => a.extra?.euReach && c.innerText.includes(a.headline)));
  return i < 0 ? 0 : i;
});
await clickEl(page.locator('#grid .card').nth(pickIdx), 0.9);
await page.waitForTimeout(700);
await overlay();
await capLeft(true);
const perfTop = await page.evaluate(() => document.querySelector('#drawer .perf').offsetTop - 16);
await scrollEl('#drawer', perfTop, 1.1);
await hold(1.2);
await moveToEl(page.locator('#drawer table.est'), 0.8, 0.75, 0.35);
await highlight(page.locator('#drawer table.est'), 0.3, 4);
await caption('Every number is an honest range with a confidence level');
await hold(2.2);
await unhighlight();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await capLeft(false);

// 6. Market intelligence
await caption(step(3, 'Market Intelligence: see who dominates your niche'));
await clickEl(page.locator('button[data-view="insights"]'), 0.9);
await page.waitForTimeout(900);
await hold(0.6);
await highlight(page.locator('#market table.data').first(), 0.3, 4);
await hold(1.8);
await unhighlight();
const anglesY = await page.evaluate(() => {
  const h = [...document.querySelectorAll('#market h3')].find((x) => /angles/i.test(x.textContent));
  return h.getBoundingClientRect().top + window.scrollY - 70;
});
await caption('…and which angles, offers and hooks over-index in winning ads');
await scrollEl(null, anglesY, 1.4);
await hold(2.4);

// 7. Competitor deep dive
await scrollEl(null, 0, 1.0);
await caption('Deep-dive any competitor in one click');
await clickEl(page.locator('#market table.data tbody tr').first(), 0.9);
await page.waitForTimeout(700);
await overlay();
await capLeft(true);
await hold(1.6);
await caption('Spend run-rate, launch cadence and every funnel page');
await scrollEl('#drawer', 520, 1.4);
await hold(1.4);
await fadeOut(0.35);

// 8. Privacy + 9. Call to action
await titleCard(`<h2 class="a">🔒 Private by design</h2><p class="a">No account. No tracking. Your research stays in your browser.</p>`, 1.8, { inSec: 0.7 });
await fadeOut(0.3);
await titleCard(`<img class="logo a" src="${icon}"><h1 class="a">Adlumi</h1><p class="a">Competitor ad research for Chrome</p>
  <div class="pill a">Free on the Chrome Web Store</div><p class="a" style="font-size:18px;margin-top:22px;opacity:.75">baydon-create.github.io/Adlumi</p>`, 3.0);
await fadeOut(0.5);

await ctx.close();
console.log(`frames: ${frame} (${(frame / FPS).toFixed(1)} s), demo ads: ${seeded}`);

// ---------------------------------------------------------------- encode
const out = `${EXT}/store/adlumi-promo.mp4`;
execSync(`ffmpeg -y -loglevel error -framerate ${FPS} -i ${FRAMES}/%05d.jpg -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart ${out}`);
console.log('wrote', out, (fs.statSync(out).size / 1e6).toFixed(1), 'MB');
