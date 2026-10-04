/* popuptest.mjs — YOUR popup, through the three keyboard hosts.

   kbtest.mjs proves keyboard-aware.js against the kit's own mock. This one
   proves it against the popup a project actually ships: point it at a page
   that renders the popup, tell it how to open it and where its parts are,
   and it fakes each host the way kbtest does and checks the invariants that
   matter to a buyer — the field and the button under it are above the
   keyboard, nothing was padded, nothing drifts, nothing moves mid-word.

   Written for Founders.com.bd, whose send-money popup was its own markup
   (not the kit's), adapted to the kit's contract (RECIPE §7a). Save the page
   as HTML (curl it, or render it in a test) and run:

     PAGE=checkout.html OPEN="window.dpOpen('bkash', 2950)" \
     CARD='#dp-card' SCROLL='#dp-scroll' FIELD='#dp-ref' SUBMIT='#dp-submit' \
     node tools/keyboard/popuptest.mjs

   With no PAGE it runs against mock.html (which has no kit of its own, so the
   kit is injected: INJECT=1 is the default there). A page that already
   includes keyboard-aware.js must NOT get INJECT — two copies fight.

   Env: PAGE  path or URL           OPEN    JS that opens the popup ('' = open)
        CARD / SCROLL / FIELD / SUBMIT   selectors (the card, its scroller,
                                          the field, the button under it)
        INJECT=1   inject KIT after load   KIT  path to keyboard-aware.js
        EXE   a Chromium binary (else Playwright's cached one)
*/
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const MOCK = !process.env.PAGE;
const PAGE = process.env.PAGE || path.join(DIR, 'mock.html');
const URL_ = /^https?:/.test(PAGE) ? PAGE : pathToFileURL(path.resolve(PAGE)).href;
const OPEN = process.env.OPEN || '';
const SEL = {
    card: process.env.CARD || '#card',
    scroll: process.env.SCROLL || '#scroll',
    field: process.env.FIELD || '#ref',
    submit: process.env.SUBMIT || '#submit',
};
const INJECT = process.env.INJECT ? process.env.INJECT === '1' : MOCK;
const KIT = INJECT ? fs.readFileSync(process.env.KIT || path.join(DIR, '..', '..', 'keyboard-aware.js'), 'utf8') : '';
const EXE = process.env.EXE || (() => {
    const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH,
        path.join(process.env.HOME || '', 'Library/Caches/ms-playwright'),
        path.join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean);
    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        for (const dir of fs.readdirSync(root)) {
            for (const rel of ['chrome-headless-shell-mac-arm64/chrome-headless-shell',
                'chrome-headless-shell-mac-x64/chrome-headless-shell',
                'chrome-headless-shell-linux/chrome-headless-shell',
                'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome']) {
                const f = path.join(root, dir, rel);
                if (fs.existsSync(f)) return f;
            }
        }
    }
    console.error('No Chromium found. Run: npx playwright install chromium-headless-shell');
    process.exit(2);
})();

const VW = 412, VH = 820, KB = 380;   // a mid-size Android phone, Gboard with suggestions
let pass = 0, fail = 0;
const ok = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? '  ok  ' : ' FAIL '} ${n}${d ? '   ' + d : ''}`); };

// Before any page script: a phone's pointer, and a visualViewport whose
// height the test controls — and whether the host admits to the keyboard.
const HOST = `
window.__kb = 0; window.__report = true;
window.matchMedia = (function (orig) { return function (q) {
  if (/coarse/.test(q)) return { matches: true, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} };
  return orig.call(window, q); }; })(window.matchMedia);
(function () {
  var vv = window.visualViewport; var proto = Object.getPrototypeOf(vv);
  var realH = Object.getOwnPropertyDescriptor(proto, 'height').get;
  Object.defineProperty(vv, 'height', { configurable: true, get: function () { return realH.call(vv) - (window.__report ? window.__kb : 0); } });
  window.__fire = function () { vv.dispatchEvent(new Event('resize')); };
})();
try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
`;

const geom = (page) => page.evaluate((s) => {
    const card = document.querySelector(s.card), scroll = document.querySelector(s.scroll);
    const field = document.querySelector(s.field), sub = document.querySelector(s.submit);
    const sb = scroll.getBoundingClientRect();
    // Where the scroller's own content ends, in its scroll coordinates — under
    // it is only what something added.
    let end = 0;
    for (const c of scroll.children) {
        const r = c.getBoundingClientRect();
        if (r.height) end = Math.max(end, r.bottom - sb.top + scroll.scrollTop);
    }
    return {
        dataKb: document.documentElement.hasAttribute('data-kb'),
        guess: document.documentElement.hasAttribute('data-kb-guess'),
        kbVh: getComputedStyle(document.documentElement).getPropertyValue('--kb-vh').trim(),
        inlinePad: scroll.style.paddingBottom || card.style.paddingBottom || '',
        cardTop: Math.round(card.getBoundingClientRect().top),
        cardH: Math.round(card.getBoundingClientRect().height),
        fieldBottom: Math.round(field.getBoundingClientRect().bottom),
        subBottom: Math.round(sub.getBoundingClientRect().bottom),
        fold: window.innerHeight - window.__kb,
        voidPx: Math.round(scroll.scrollHeight - end),
        scrollTop: Math.round(scroll.scrollTop),
    };
}, SEL);

// A tap: the kit never guesses at a focus no finger caused.
const tap = (page) => page.evaluate((sel) => {
    const el = document.querySelector(sel); const b = el.getBoundingClientRect();
    const t = new Touch({ identifier: 1, target: el, clientX: b.x + 5, clientY: b.y + 5 });
    window.dispatchEvent(new TouchEvent('touchstart', { touches: [t], bubbles: true }));
    el.focus();
}, SEL.field);

const fresh = async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => { console.log(' PAGE ERROR  ' + e.message); fail++; });
    await page.addInitScript(HOST);
    await page.goto(URL_);
    if (INJECT) await page.addScriptTag({ content: KIT });
    if (OPEN) await page.evaluate(OPEN);
    await page.waitForTimeout(500);   // the card's own entrance animation
    return { ctx, page };
};

const blurField = (page) => page.evaluate((s) => document.querySelector(s).blur(), SEL.field);
const ime = (page, type) => page.evaluate(([s, t]) => document.querySelector(s).dispatchEvent(new CompositionEvent(t, { bubbles: true })), [SEL.field, type]);

const run = async () => {
    const browser = await chromium.launch({ executablePath: EXE });
    console.log(`page: ${URL_}${OPEN ? `\nopen: ${OPEN}` : ''}`);

    console.log("\nHost C — Facebook's browser on Android: no event, and no changed number");
    {
        const { ctx, page } = await fresh(browser);
        const before = await geom(page);
        ok('on a phone the card starts near the top, not centred behind a keyboard', before.cardTop <= 40, `cardTop=${before.cardTop}`);
        await page.evaluate((k) => { window.__kb = k; window.__report = false; }, KB);
        await tap(page);
        await page.waitForTimeout(1600);
        const g = await geom(page);
        ok('the field is above the keyboard', g.fieldBottom <= g.fold, `fieldBottom=${g.fieldBottom} fold=${g.fold}`);
        ok('and the button under it', g.subBottom <= g.fold, `submitBottom=${g.subBottom} fold=${g.fold}`);
        ok('the card fits the band no keyboard reaches', g.cardTop + g.cardH <= g.fold + 2, `cardTop=${g.cardTop} cardH=${g.cardH} (was ${before.cardH}) --kb-vh=${g.kbVh}`);
        ok('NOTHING was padded to make room', g.inlinePad === '', `inline="${g.inlinePad}"`);
        ok('no dead space under the content', g.voidPx <= 16, `voidPx=${g.voidPx}`);
        const a = await geom(page); await page.waitForTimeout(3000); const b = await geom(page);
        ok('nothing drifts over three seconds of heartbeat', a.scrollTop === b.scrollTop && a.cardH === b.cardH, `scrollTop ${a.scrollTop}->${b.scrollTop} cardH ${a.cardH}->${b.cardH}`);
        await ime(page, 'compositionstart');
        const c = await geom(page); await page.waitForTimeout(1500); const d = await geom(page);
        ok('a Bangla IME mid-word freezes everything', c.scrollTop === d.scrollTop && c.cardH === d.cardH);
        await ime(page, 'compositionend');
        await blurField(page);
        await page.waitForTimeout(900);
        const e = await geom(page);
        ok('blur gives the card its height back', !e.dataKb && e.cardH === before.cardH, `cardH=${e.cardH} (was ${before.cardH}) data-kb=${e.dataKb}`);
        await ctx.close();
    }

    console.log('\nHost B — honest numbers (vv.height drops), no events');
    {
        const { ctx, page } = await fresh(browser);
        await page.evaluate((k) => { window.__kb = k; window.__report = true; }, KB);
        await tap(page);
        await page.waitForTimeout(1600);
        const g = await geom(page);
        ok('the card is sized to the measurement, not a guess', g.kbVh === (VH - KB) + 'px' && !g.guess, `--kb-vh=${g.kbVh} guess=${g.guess}`);
        ok('the field is above the keyboard', g.fieldBottom <= g.fold, `fieldBottom=${g.fieldBottom} fold=${g.fold}`);
        ok('and the button under it', g.subBottom <= g.fold, `submitBottom=${g.subBottom} fold=${g.fold}`);
        ok('NOTHING was padded', g.inlinePad === '');
        await ctx.close();
    }

    console.log('\nHost A — a browser that reported a keyboard once: its silence is believed');
    {
        const { ctx, page } = await fresh(browser);
        const before = await geom(page);
        await page.evaluate((k) => { window.__kb = k; window.__report = true; }, KB);
        await tap(page);
        await page.evaluate(() => window.__fire());
        await page.waitForTimeout(700);
        await blurField(page);
        await page.evaluate(() => { window.__kb = 0; window.__fire(); });
        await page.waitForTimeout(700);
        await tap(page);
        await page.waitForTimeout(1000);
        const g = await geom(page);
        ok('no guess over an honest host', !g.dataKb, `data-kb=${g.dataKb}`);
        ok('the card keeps its own height', g.cardH === before.cardH, `cardH=${g.cardH} (was ${before.cardH})`);
        await ctx.close();
    }

    console.log('\nA focus no finger caused (a script, a Tab key)');
    {
        const { ctx, page } = await fresh(browser);
        const before = await geom(page);
        await page.evaluate(([k, s]) => { window.__kb = k; window.__report = false; document.querySelector(s).focus(); }, [KB, SEL.field]);
        await page.waitForTimeout(1600);
        const g = await geom(page);
        ok('is never guessed at', !g.dataKb && g.cardH === before.cardH, `data-kb=${g.dataKb} cardH=${g.cardH}`);
        await ctx.close();
    }

    await browser.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
};
run();
