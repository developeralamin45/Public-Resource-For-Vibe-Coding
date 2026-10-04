import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const SP  = process.env.SP  || path.dirname(fileURLToPath(import.meta.url));
// The kit's own keyboard-aware.js by default; KIT=/path/to/your/copy tests a
// project's copy instead — the one it actually ships.
const KIT = fs.readFileSync(process.env.KIT || path.join(SP, '..', '..', 'keyboard-aware.js'), 'utf8');
/* Playwright's own cached Chromium, wherever this machine keeps it. Set EXE to
   override. playwright-core ships no browser of its own on purpose — the one
   already on disk is the one the rest of the toolchain uses. */
const EXE = process.env.EXE || (() => {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(process.env.HOME || '', 'Library/Caches/ms-playwright'),
    path.join(process.env.HOME || '', '.cache/ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      for (const rel of ['chrome-headless-shell-mac-arm64/chrome-headless-shell',
                         'chrome-headless-shell-mac-x64/chrome-headless-shell',
                         'chrome-headless-shell-linux/chrome-headless-shell',
                         'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
                         'chrome-linux/chrome']) {
        const f = path.join(root, dir, rel);
        if (fs.existsSync(f)) return f;
      }
    }
  }
  console.error('No Chromium found. Run: npx playwright install chromium');
  process.exit(2);
})();
const VW = 412, VH = 820;

let pass = 0, fail = 0;
const ok  = (n, c, d = '') => { c ? pass++ : fail++; console.log(`${c ? '  ok  ' : ' FAIL '} ${n}${d ? '   ' + d : ''}`); };

// Injected before the kit: makes the desktop look like a phone, and lets each
// test say how tall the keyboard is and whether the host admits to it.
const HOST = `
window.__kb = 0; window.__report = true;
window.matchMedia = function (q) {
  return { matches: /coarse/.test(q), media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} };
};
(function () {
  var vv = window.visualViewport;
  var proto = Object.getPrototypeOf(vv);
  var realH = Object.getOwnPropertyDescriptor(proto, 'height').get;
  Object.defineProperty(vv, 'height', { configurable: true,
    get: function () { return realH.call(vv) - (window.__report ? window.__kb : 0); } });
  window.__fire = function () { vv.dispatchEvent(new Event('resize')); };
})();
`;

const geom = async (page) => page.evaluate(() => {
  const scroll = document.getElementById('scroll');
  const card   = document.getElementById('card');
  const ref    = document.getElementById('ref');
  const sub    = document.getElementById('submit');
  const kb     = window.__report ? window.__kb : window.__kb;      // real keyboard, admitted or not
  const fold   = window.innerHeight - kb;                          // the line the keyboard's top edge sits on
  const body   = document.querySelector('.pay-body');
  const cs     = getComputedStyle(scroll);
  return {
    dataKb:      document.documentElement.hasAttribute('data-kb'),
    kbVh:        getComputedStyle(document.documentElement).getPropertyValue('--kb-vh').trim(),
    inlinePad:   scroll.style.paddingBottom || '',
    computedPad: cs.paddingBottom,
    cardH:       Math.round(card.getBoundingClientRect().height),
    refBottom:   Math.round(ref.getBoundingClientRect().bottom),
    subTop:      Math.round(sub.getBoundingClientRect().top),
    subBottom:   Math.round(sub.getBoundingClientRect().bottom),
    fold, innerH: window.innerHeight,
    // Dead space inside the scroller under the last thing in it.
    voidPx: Math.round(scroll.scrollHeight - (body.offsetTop + body.offsetHeight)),
    scrollTop: Math.round(scroll.scrollTop),
    maxScroll: Math.round(scroll.scrollHeight - scroll.clientHeight),
  };
});

// The page surface: a field in the document itself, no popup, the reserve
// at the foot of <html> its only extra range. Everything the kit may not
// exceed is read off the same constants it guesses with (BAND 0.5, STEP 8).
const pageGeom = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s); const b = el.getBoundingClientRect();
  const H  = document.documentElement.clientHeight;
  const pg = document.querySelector('.page').getBoundingClientRect();
  return {
    top: Math.round(b.top), bottom: Math.round(b.bottom),
    fold: window.innerHeight - window.__kb,                              // the real keyboard's top edge
    assumedFold: Math.round(H * 0.5),                                    // where the kit assumes it
    assumedReserve: Math.round((H - Math.round(H * 0.5)) / 8) * 8,       // the reserve that assumption is worth, and no more
    safe: Math.round(H * 0.4),                                           // the foot of the band the kit calls safe
    reserve: getComputedStyle(document.documentElement).getPropertyValue('--kb-reserve').trim(),
    dataKb: document.documentElement.hasAttribute('data-kb'),
    guess: document.documentElement.hasAttribute('data-kb-guess'),
    // What the page itself was given: the room at its foot and the landing line.
    htmlPad: getComputedStyle(document.documentElement).paddingBottom,
    scrollPad: getComputedStyle(document.documentElement).scrollPaddingBottom,
    foot: getComputedStyle(document.documentElement).getPropertyValue('--kb-foot').trim(),
    contentEnd: Math.round(pg.bottom),   // where the page's own content stops; under it is only the reserve
    scrollY: Math.round(window.scrollY),
  };
}, sel);

// The signup page's shape, added under the mock's page field: a second field
// that asks to keep its button (scroll-margin-bottom), the button, a line of
// terms, a help link. The last field of a form, with things under it.
const FORM = () => {
  document.getElementById('ov').remove();
  document.querySelector('.page').insertAdjacentHTML('beforeend',
    '<input id="pf2" placeholder="confirm" style="display:block;width:100%;box-sizing:border-box;padding:12px;margin-top:16px;scroll-margin-bottom:72px">' +
    '<button id="pfbtn" style="display:block;width:100%;height:50px;margin-top:16px">register</button>' +
    '<p style="height:60px;margin:16px 0 0">terms</p><div style="height:40px;margin-top:16px">help</div>');
};

// A tap: what the kit requires before it will ever guess.
const tap = async (page, sel) => {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    const b = el.getBoundingClientRect();
    const t = new Touch({ identifier: 1, target: el, clientX: b.x + 5, clientY: b.y + 5 });
    window.dispatchEvent(new TouchEvent('touchstart', { touches: [t], bubbles: true }));
    el.focus();
  }, sel);
};

const fresh = async (browser, { kb = 0, report = true } = {}) => {
  const ctx  = await browser.newContext({ viewport: { width: VW, height: VH }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(HOST);
  await page.goto(pathToFileURL(path.join(SP, 'mock.html')).href);
  await page.addScriptTag({ content: KIT });
  await page.evaluate(([k, r]) => { window.__kb = k; window.__report = r; }, [kb, report]);
  return { ctx, page };
};

const run = async () => {
  const browser = await chromium.launch({ executablePath: EXE });

  // ── Host C: Facebook's browser. The keyboard is up; nothing is reported. ──
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: false });
    const before = await geom(page);
    await tap(page, '#ref');
    await page.waitForTimeout(1000);                 // past the 600ms heartbeat
    const g = await geom(page);
    console.log('\n── Host C (reports nothing), keyboard 380px, fold at ' + g.fold + ' ──');
    ok('card shortened to the safe band', g.cardH <= 430 && g.cardH > 250, `cardH=${g.cardH} (was ${before.cardH})`);
    ok('data-kb set from the guess',      g.dataKb, `--kb-vh=${g.kbVh}`);
    ok('field is above the keyboard',     g.refBottom <= g.fold, `refBottom=${g.refBottom} fold=${g.fold}`);
    ok('submit button is above it too',   g.subBottom <= g.fold, `subBottom=${g.subBottom} fold=${g.fold}`);
    ok('NO padding added to the panel',   g.inlinePad === '', `inline="${g.inlinePad}" computed=${g.computedPad}`);
    ok('no dead space under the content', g.voidPx <= 16, `voidPx=${g.voidPx}`);

    // The screenshot-2 case: keyboard put away with the chevron. No blur fires.
    await page.evaluate(() => { window.__kb = 0; });
    await page.waitForTimeout(800);
    const d = await geom(page);
    ok('keyboard dismissed: still no void', d.voidPx <= 16 && d.inlinePad === '', `voidPx=${d.voidPx} pad="${d.inlinePad}"`);

    // Blur gives the card its height back.
    await page.evaluate(() => document.getElementById('ref').blur());
    await page.waitForTimeout(900);
    const b = await geom(page);
    ok('blur restores the card',          !b.dataKb && b.cardH === before.cardH, `cardH=${b.cardH} (was ${before.cardH}) dataKb=${b.dataKb}`);
    await ctx.close();
  }

  // ── Host B: the keyboard is reported. The measurement must beat the guess. ──
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: true });
    await tap(page, '#ref');
    await page.evaluate(() => window.__fire());
    await page.waitForTimeout(1000);
    const g = await geom(page);
    console.log('\n── Host B (reports honestly), keyboard 380px, fold at ' + g.fold + ' ──');
    ok('band is the measurement, not 50%', g.kbVh === (VH - 380) + 'px', `--kb-vh=${g.kbVh} expected=${VH - 380}px`);
    ok('field above the keyboard',         g.refBottom <= g.fold, `refBottom=${g.refBottom} fold=${g.fold}`);
    ok('submit above the keyboard',        g.subBottom <= g.fold, `subBottom=${g.subBottom} fold=${g.fold}`);
    ok('NO padding added',                 g.inlinePad === '', `inline="${g.inlinePad}"`);
    await ctx.close();
  }

  // Host A: an honest host. Once it has reported a keyboard, its silence is
  // believed - which is what keeps Chrome from being second-guessed.
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: true });
    const before = await geom(page);
    await tap(page, '#ref');
    await page.evaluate(() => window.__fire());
    await page.waitForTimeout(700);
    await page.evaluate(() => document.getElementById('ref').blur());
    await page.evaluate(() => { window.__kb = 0; window.__fire(); });
    await page.waitForTimeout(700);
    await tap(page, '#ref');
    await page.waitForTimeout(1000);
    const g = await geom(page);
    console.log('\n-- Host A (honest: it reported a keyboard once, so silence means none) --');
    ok('no guess over an honest host', !g.dataKb, 'dataKb=' + g.dataKb + ' kbVh=' + g.kbVh);
    ok('card at its own height', g.cardH === before.cardH, 'cardH=' + g.cardH + ' was ' + before.cardH);
    ok('no padding', g.inlinePad === '', 'inline=' + JSON.stringify(g.inlinePad));
    ok('field left in place', Math.abs(g.scrollTop) < 12, 'scrollTop=' + g.scrollTop);
    await ctx.close();
  }

  // ── A focus no finger caused (a script, a Tab key) must never be guessed at. ──
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: false });
    const before = await geom(page);
    await page.evaluate(() => document.getElementById('ref').focus());   // no touchstart
    await page.waitForTimeout(1000);
    const g = await geom(page);
    console.log('\n── Script-driven focus, host C ──');
    ok('no guess without a tap', !g.dataKb && g.cardH === before.cardH, `dataKb=${g.dataKb} cardH=${g.cardH}`);
    await ctx.close();
  }

  // ── A field on the PAGE itself (no panel): point 4. ──
  // The lone field at the very end of the document. Nothing under it, so the
  // reserve is the whole range; it lands as high as that allows — a hair
  // above the assumed keyboard — and the reserve is never lengthened to take
  // it higher. The version this replaces topped the reserve up until the
  // field reached a landing line near the top: the top-up was room past the
  // keyboard, i.e. the grey band of the signup screenshot.
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: false });
    await page.evaluate(() => document.getElementById('ov').remove());   // no popup on this page
    await tap(page, '#pagefield');
    await page.waitForTimeout(1000);
    const g = await pageGeom(page, '#pagefield');
    console.log('\n── Page field at the very end of the page, host C ──');
    ok('above the assumed keyboard line',  g.bottom <= g.assumedFold + 1, `bottom=${g.bottom} assumed fold=${g.assumedFold}`);
    ok('above the real keyboard',          g.bottom <= g.fold, `bottom=${g.bottom} fold=${g.fold}`);
    ok('reserve is the assumed keyboard, not topped up', g.dataKb && g.reserve === g.assumedReserve + 'px', `--kb-reserve=${g.reserve} expected=${g.assumedReserve}px`);
    await page.evaluate(() => { window.dispatchEvent(new TouchEvent('touchmove', { bubbles: true })); window.scrollTo(0, 1e6); });
    await page.waitForTimeout(500);
    const e = await pageGeom(page, '#pagefield');
    ok('dragged to the end: nothing of the reserve above that line', e.contentEnd >= e.assumedFold - 1, `contentEnd=${e.contentEnd} assumed fold=${e.assumedFold}`);
    await ctx.close();
  }

  // The signup page (screenshot of 2026-09-21: a grey band between the form
  // and the keyboard, the field pinned to the top edge). The last field has
  // a button, terms and a help link under it and asks to keep the button.
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: false });
    await page.evaluate(FORM);
    await tap(page, '#pf2');
    await page.waitForTimeout(1000);
    const g = await pageGeom(page, '#pf2');
    const btn = await page.evaluate(() => Math.round(document.getElementById('pfbtn').getBoundingClientRect().bottom));
    console.log('\n── Page form (the signup page), host C ──');
    ok('field at the foot of the safe band, not on a landing line', g.bottom + 72 <= g.safe + 1 && g.bottom + 72 >= g.safe - 12, `bottom=${g.bottom} +72 vs safe=${g.safe}`);
    ok('the button under it is visible too',      btn <= g.fold, `buttonBottom=${btn} fold=${g.fold}`);
    ok('reserve is the assumed keyboard, not topped up', g.reserve === g.assumedReserve + 'px', `--kb-reserve=${g.reserve} expected=${g.assumedReserve}px`);
    ok('a guess gives the page its room and its line', g.guess && g.htmlPad === g.reserve && g.foot !== '', `data-kb-guess=${g.guess} padding=${g.htmlPad} --kb-foot=${g.foot}`);
    ok('no grey band above the keyboard',         g.contentEnd >= g.fold, `contentEnd=${g.contentEnd} fold=${g.fold}`);
    // The visitor drags the page to its end: the reserve stops at the assumed keyboard line.
    await page.evaluate(() => { window.dispatchEvent(new TouchEvent('touchmove', { bubbles: true })); window.scrollTo(0, 1e6); });
    await page.waitForTimeout(500);
    const e = await pageGeom(page, '#pf2');
    ok('dragged to the end: nothing of the reserve above that line', e.contentEnd >= e.assumedFold - 1, `contentEnd=${e.contentEnd} assumed fold=${e.assumedFold}`);
    // Chevron: keyboard away, no blur. The kit cannot know; the page must not move.
    await page.evaluate(() => { window.__kb = 0; });
    await page.waitForTimeout(800);
    const d = await pageGeom(page, '#pf2');
    ok('keyboard dismissed with the chevron: page does not move', d.scrollY === e.scrollY, `${e.scrollY} -> ${d.scrollY}`);
    await page.evaluate(() => document.getElementById('pf2').blur());
    await page.waitForTimeout(900);
    const b = await pageGeom(page, '#pf2');
    ok('blur takes the reserve away',             !b.dataKb && b.reserve === '', `dataKb=${b.dataKb} reserve="${b.reserve}"`);
    await ctx.close();
  }

  // "Next" on the keyboard: focus moves with no touch. The browser's own
  // scroll, told where to land through scroll-padding-bottom (--kb-foot),
  // puts the next field on the same line the kit aims at — so the heartbeat
  // has no second nudge to make 600ms later.
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: false });
    await page.evaluate(FORM);
    await tap(page, '#pagefield');
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.getElementById('pf2').focus());
    await page.waitForTimeout(150);
    const a = await pageGeom(page, '#pf2');
    await page.waitForTimeout(1500);
    const b = await pageGeom(page, '#pf2');
    console.log('\n── "Next" to the following field, host C ──');
    ok('landed in the safe band by the browser\'s own scroll', a.bottom + 72 <= a.safe + 1, `bottom=${a.bottom} +72 vs safe=${a.safe}`);
    ok('no second nudge from the heartbeat',                    a.scrollY === b.scrollY, `${a.scrollY} -> ${b.scrollY}`);
    await ctx.close();
  }

  // The same form where the keyboard is MEASURED: Chrome 108+ on Android and
  // iOS Safari shrink only the visual viewport, so vv.height drops by the
  // whole keyboard while the layout stays put. The browser already scrolls
  // the field into that smaller window and subtracts scroll-padding from it;
  // the page getting the keyboard again as padding + scroll-padding is a
  // double count that left no target area, and every keystroke pinned the
  // field under the browser bar (akhanei.com.bd checkout, 2026-10-01). The
  // measurement is for overlays only.
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: true });
    await page.evaluate(FORM);
    await tap(page, '#pf2');
    await page.evaluate(() => window.__fire());
    await page.waitForTimeout(1000);
    const g = await pageGeom(page, '#pf2');
    const kbVh = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kb-vh').trim());
    console.log('\n── Page form, measured keyboard (Chrome 108+, Safari) ──');
    ok('overlays still get the measurement',   g.dataKb && kbVh === (VH - 380) + 'px', `data-kb=${g.dataKb} --kb-vh=${kbVh}`);
    ok('not a guess',                          !g.guess, `data-kb-guess=${g.guess}`);
    ok('no room added at the foot of the page', g.htmlPad === '0px', `padding-bottom=${g.htmlPad}`);
    ok('no landing line for the browser\'s scroll', g.foot === '' && (g.scrollPad === 'auto' || g.scrollPad === '0px'), `--kb-foot="${g.foot}" scroll-padding-bottom=${g.scrollPad}`);
    await page.evaluate(() => { window.__kb = 0; window.__fire(); document.getElementById('pf2').blur(); });
    await page.waitForTimeout(900);
    const b = await pageGeom(page, '#pf2');
    ok('keyboard gone: nothing left on <html>', !b.dataKb && !b.guess && b.htmlPad === '0px', `data-kb=${b.dataKb} guess=${b.guess} padding=${b.htmlPad}`);
    await ctx.close();
  }

  // The thing this whole kit is one wrong move away from becoming: a screen
  // that keeps twitching while you type. The heartbeat runs every 600ms
  // forever, so "corrected once" is not the bar - "corrected once and then
  // still" is.
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: false });
    await tap(page, '#ref');
    await page.waitForTimeout(1000);
    const a = await geom(page);
    await page.waitForTimeout(1300);
    const b = await geom(page);
    await page.waitForTimeout(1300);
    const c = await geom(page);
    console.log('\n-- Stability: three seconds of heartbeats after the correction --');
    ok('scroll does not drift', a.scrollTop === b.scrollTop && b.scrollTop === c.scrollTop,
       [a.scrollTop, b.scrollTop, c.scrollTop].join(' -> '));
    ok('card does not resize', a.cardH === b.cardH && b.cardH === c.cardH,
       [a.cardH, b.cardH, c.cardH].join(' -> '));
    ok('still no padding', c.inlinePad === '', 'inline=' + JSON.stringify(c.inlinePad));

    // Typing with a Bangla IME: a composition must freeze everything.
    await page.evaluate(() => {
      const el = document.getElementById('ref');
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });
    await page.waitForTimeout(1300);
    const d = await geom(page);
    ok('frozen mid-composition', d.scrollTop === c.scrollTop && d.cardH === c.cardH,
       'scrollTop=' + d.scrollTop + ' cardH=' + d.cardH);
    await ctx.close();
  }

  // The tall one: the bank card, five account rows where a wallet has one
  // number. This is the popup whose submit button fell below the fold.
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: false });
    await page.evaluate(() => {
      const body = document.querySelector('.pay-body');
      for (let i = 0; i < 6; i++) {
        const d = document.createElement('div');
        d.className = 'blk';
        body.insertBefore(d, body.firstChild);
      }
    });
    await tap(page, '#ref');
    await page.waitForTimeout(1000);
    const g = await geom(page);
    console.log('\n-- The tall (bank) card, host C --');
    ok('field above the keyboard', g.refBottom <= g.fold, 'refBottom=' + g.refBottom + ' fold=' + g.fold);
    ok('submit above it too', g.subBottom <= g.fold, 'subBottom=' + g.subBottom + ' fold=' + g.fold);
    ok('no padding', g.inlinePad === '', 'inline=' + JSON.stringify(g.inlinePad));
    ok('no dead space', g.voidPx <= 16, 'voidPx=' + g.voidPx);
    await ctx.close();
  }

  // A bottom sheet: shortening it is not enough, it has to be lifted too.
  {
    const { ctx, page } = await fresh(browser, { kb: 380, report: false });
    await page.evaluate(() => {
      document.getElementById('ov').remove();
      document.getElementById('sheetwrap').hidden = false;
    });
    await tap(page, '#sheetref');
    await page.waitForTimeout(1000);
    const g = await page.evaluate(() => {
      const r = document.getElementById('sheetref').getBoundingClientRect();
      const s = document.getElementById('sheetsubmit').getBoundingClientRect();
      const sh = document.getElementById('sheet');
      return {
        refBottom: Math.round(r.bottom), subBottom: Math.round(s.bottom),
        fold: window.innerHeight - window.__kb,
        pad: sh.style.paddingBottom || '',
        reserve: getComputedStyle(document.documentElement).getPropertyValue('--kb-reserve').trim(),
      };
    });
    console.log('\n-- Bottom sheet (the renewal panel), host C --');
    ok('sheet lifted clear of the keyboard', g.subBottom <= g.fold, 'subBottom=' + g.subBottom + ' fold=' + g.fold);
    ok('field visible', g.refBottom <= g.fold, 'refBottom=' + g.refBottom + ' fold=' + g.fold);
    ok('reserve matches the assumed keyboard', Math.abs(parseFloat(g.reserve) - 410) <= 8, 'reserve=' + g.reserve + ' (keyboard assumed at 410)');
    ok('sheet padding untouched by the kit', g.pad === '24px', 'pad=' + JSON.stringify(g.pad) + ' - its own, from the style attribute');
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};
run().catch(e => { console.error(e); process.exit(1); });
