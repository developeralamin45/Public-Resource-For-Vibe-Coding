/* Soft-keyboard survival kit for phone forms.
   Framework-agnostic. Include ONCE per page (a <script src> before </body>).
   There is nothing to add to your markup and nothing to configure.

   The bug it exists for: a visitor arrives from a Facebook ad, so the page
   opens inside Facebook's in-app browser, not Chrome. Tap the reference field
   at the bottom of the payment popup and the keyboard slides up over it. The
   field is still focused, still receiving the typing — you just cannot see a
   character of it. Chrome gets this right on its own, which is why the bug is
   invisible until you test the way the traffic actually arrives.

   Why the in-app browser differs: when the keyboard opens, Chrome shrinks the
   page's viewport and scrolls the focused field back into what is left. The
   in-app WebView lets the keyboard sit ON TOP of an unchanged page instead —
   nothing resized, so nothing scrolled, so the field stays buried. Same
   engine, different host, and the host is the part that decides.

   Worse: Facebook's WebView carries honest visualViewport NUMBERS but does
   not reliably fire the EVENTS. The keyboard opens, vv.height shrinks, and no
   resize ever arrives — so anything listening for one is deaf to a keyboard
   nobody announced. That is what the heartbeat at the bottom is for.

   Two things are needed and they are not the same thing:

     1. ROOM. If the field is the last thing on the page, there is nowhere to
        scroll it to — the document simply ends there. So while the keyboard
        is up we add exactly the missing height to the bottom of the document.
        Now the page CAN scroll far enough, whether the browser does it, we do
        it, or the visitor does it with a thumb.

     2. ONE nudge, then hands off. We scroll the focused field clear of the
        keyboard once, and only if it is genuinely covered. If the browser
        already handled it — Chrome — nothing is covered, so we do nothing at
        all, and Chrome's good behaviour stays untouched.

   Point 2 is the whole design. The obvious implementation is to scrollIntoView
   on every focus; that is also the version that makes the screen jump, because
   it fights the browser's own scrolling, fires again on every keyboard resize,
   and drags the page back down the moment the visitor scrolls up to check the
   email they just typed. So: we never scroll on a scroll, we stand down the
   instant a finger touches the screen, and we come back only when the focus or
   the keyboard height actually changes.

   IME is the other half. A Bangla keyboard (or Gboard's own suggestion buffer,
   or swipe typing) holds half-finished text in a composition the browser owns,
   and moving the page under an open composition is how you get a candidate bar
   that flickers and a caret that jumps. Between compositionstart and
   compositionend we freeze completely — no scrolling, no resizing, no reading
   of a layout that is mid-flight. See bd-phone.js for the matching rule on the
   other side: do not rewrite .value mid-composition.

   Rejected: `interactive-widget=resizes-content` in the viewport meta. It is
   the standards-track version of point 1 and it would be one line — but it
   changes what 100vh means for every browser, including the one that has no
   bug today. Buying a fix for the in-app browser with a behaviour change in
   Chrome is the wrong trade when the JS below is scoped to do nothing unless
   something is actually wrong.

   A fixed overlay (like the send-money popup) is its own scroller, so the
   page-level room added here cannot reach inside it. The overlay's CSS must
   spend the measurement itself — one line, and the popup in this kit already
   carries it:
     html[data-kb] .dp-center{padding-bottom:calc(24px + var(--kb-reserve,0px));}
*/
(function () {
    var vv = window.visualViewport;
    if (!vv) return;

    /* Touch devices only — but this is the cheap guard, not the real one. It
       just avoids binding listeners on a desktop that could never need them.
       The real guard is that nothing below acts on a device type at all: it
       acts on a viewport that measurably shrank by more than KB_MIN. A physical
       keyboard shrinks nothing, so an iPad in a keyboard case, a Bluetooth
       keyboard on Android and a touchscreen laptop all fall out for free —
       without a single special case for any of them. Sniff the effect, never
       the device; the effect is the thing we are actually correcting. */
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;

    var root = document.documentElement;

    /* The room from point 1, as CSS. Padding on the ROOT element, not on body:
       body often carries min-height:100vh, and with border-box sizing padding
       inside that just re-centres content instead of lengthening the document.
       html has no height of its own, so its padding is pure scroll range.
       (clientHeight on the root still reports the viewport, not this box, so
       the measurement below stays honest.) scroll-padding-bottom tells the
       browser's OWN scrolling about the same room, so "Next" on the keyboard —
       which moves focus without us — also lands the next field above the
       keyboard rather than under it. */
    var css = document.createElement('style');
    css.textContent =
        'html[data-kb]{padding-bottom:var(--kb-reserve,0px);' +
        'scroll-padding-bottom:calc(var(--kb-reserve,0px) + 2rem);}';
    document.head.appendChild(css);

    var KB_MIN     = 140;  /* px. Under this it is browser chrome collapsing, not a keyboard. */
    var GAP_BELOW  = 20;   /* px of air we want between the field and the keyboard. */
    var GAP_ABOVE  = 32;   /* px above — a floating label sits outside the input's box. */
    var STEP       = 8;    /* Round the reserve, so a candidate bar twitching by 2px is not a relayout. */
    var MIN_MOVE   = 12;   /* px. Below this a correction is invisible as a fix and visible as a twitch. */

    var baseVisual = vv.height;      /* viewport height with no keyboard up */
    var baseLayout = root.clientHeight;
    var baseWidth  = root.clientWidth;

    var composing   = false;  /* an IME owns the field right now — touch nothing */
    var handsOff    = false;  /* the visitor scrolled; stop steering until something changes */
    var reserve     = 0;
    var lastReserve = -1;
    var timer       = 0;

    /* Pinch-zoom shrinks the visual viewport exactly the way a keyboard does —
       zoom to 2x and vv.height halves, which reads as a 320px keyboard that is
       not there. Nothing is measured or moved while the visitor is zoomed in;
       they are looking closely at something, which is the worst possible moment
       to scroll the page under them. */
    function zoomed() { return vv.scale > 1.01; }

    function isField(el) {
        if (!el) return false;
        if (el.isContentEditable) return true;
        var tag = el.tagName;
        if (tag === 'TEXTAREA') return true;
        if (tag !== 'INPUT') return false;
        return !/^(button|submit|reset|checkbox|radio|range|file|color|hidden|image)$/i
            .test(el.type || 'text');
    }

    /* How much of the keyboard the page has NOT already been shrunk to account
       for. In Chrome that difference is zero — the layout viewport shrank by the
       full keyboard height — so we reserve nothing and change nothing. In the
       in-app browser the layout never moved, so the difference is the whole
       keyboard, and that is exactly the scroll range the document is missing. */
    function measure() {
        /* Zoomed: hold whatever we already had rather than read a lie. */
        if (zoomed()) return reserve;

        /* Orientation change invalidates every baseline we hold. Measured on
           the LAYOUT width, which turns with the phone but is untouched by
           pinch-zoom — vv.width would reset the baselines on every zoom and
           leave the fix quietly dead until the next unfocus. */
        if (root.clientWidth !== baseWidth) {
            baseWidth  = root.clientWidth;
            baseVisual = vv.height;
            baseLayout = root.clientHeight;
        }

        /* Baselines are only trustworthy with nothing focused — that is the one
           moment we know the keyboard is down. Keep the tallest we have seen,
           so a collapsing URL bar reads as chrome rather than as a keyboard. */
        if (!isField(document.activeElement)) {
            baseVisual = Math.max(baseVisual, vv.height);
            baseLayout = Math.max(baseLayout, root.clientHeight);
        }

        var keyboard = baseVisual - vv.height;
        if (keyboard < KB_MIN) return 0;

        var shrunk = baseLayout - root.clientHeight;
        return Math.max(0, Math.round((keyboard - shrunk) / STEP) * STEP);
    }

    function applyReserve(next) {
        if (next === lastReserve) return;
        lastReserve = next;
        if (next > 0) {
            root.style.setProperty('--kb-reserve', next + 'px');
            root.setAttribute('data-kb', '');
        } else {
            root.removeAttribute('data-kb');
            root.style.removeProperty('--kb-reserve');
        }
    }

    /* What would actually move if we scrolled. Usually the page — but a field
       inside a fixed overlay (the payment popup) lives in its own scroller, and
       scrolling the page under a fixed overlay moves nothing at all while
       looking, from here, exactly like success. Find the real one. */
    function scrollerFor(el) {
        /* Stopping at body, not just html, is the whole subtlety. Many layouts
           set overflow-x:hidden on body, and CSS then computes its overflow-y
           to `auto` — but body's overflow is PROPAGATED to the viewport, so
           body itself never becomes a scroll container. Believing the computed
           value would have us set body.scrollTop, which silently does nothing. */
        var stop = document.body;
        for (var n = el.parentElement; n && n !== stop && n !== root; n = n.parentElement) {
            var oy = getComputedStyle(n).overflowY;
            /* A horizontally-scrolling row (a chip strip, a card rail) also
               computes overflow-y to `auto` for the same CSS reason. It has no
               vertical range, so the second half of this is what rules it out. */
            if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
        }
        return null;
    }

    /* The one nudge. Nothing happens unless the focused field is actually
       outside the band of page the keyboard left visible. */
    function uncover() {
        if (composing || handsOff || zoomed()) return;

        var el = document.activeElement;
        if (!isField(el)) return;

        /* The field can be gone by the time the timer fires — a tab switched, a
           panel closed, the row re-rendered. A detached node measures as a box
           of zeros at the origin, which reads as "far above the fold" and would
           scroll the page up for no reason at all. */
        if (!el.isConnected) return;

        /* getBoundingClientRect is in layout-viewport coordinates; the visual
           viewport is a window onto that, so this is the strip still on screen. */
        var top    = vv.offsetTop;
        var bottom = top + vv.height;
        var box    = el.getBoundingClientRect();
        var move   = 0;

        if (!box.height) return;   /* display:none, or a panel mid-transition */

        /* A field may ask for extra clearance under itself via
           scroll-margin-bottom — the native way to say "when you reveal me,
           reveal what sits under me too" (the payment popup's submit button
           lives there). Browsers that handle the keyboard themselves already
           honour that property in their own focus scroll, so this only levels
           the broken hosts up to the same landing spot. Gated on the reserve
           because reserve > 0 IS the broken host: where the browser shrank the
           layout itself, its own scroll was right, and we stay out. */
        var extra = reserve > 0 ? parseFloat(getComputedStyle(el).scrollMarginBottom) || 0 : 0;

        if (box.bottom + GAP_BELOW + extra > bottom) {
            move = box.bottom + GAP_BELOW + extra - bottom;
        } else if (box.top < top) {
            /* Only when the field is genuinely CLIPPED at the top, not merely
               near the edge. Triggering on "within GAP_ABOVE of the top" gives
               every field that sits high on the page a standing 32px dead zone
               it gets nudged out of on focus — a small, pointless, and very
               visible jump on any page whose form starts near the header. */
            move = box.top - GAP_ABOVE - top;
        }

        /* A tall field cannot fit; showing its foot would push its head off the
           top, which reads as a jump for no gain. Show what fits and stop. */
        if (move > 0) move = Math.max(0, Math.min(move, box.top - top - GAP_ABOVE));

        /* The floor that keeps this from ever reading as a twitch: a correction
           worth making is worth seeing, and one that is not is worth skipping. */
        if (Math.abs(move) < MIN_MOVE) return;

        /* Same sign either way: a positive scrollTop and a positive scrollBy
           both pull content upward. */
        var host = scrollerFor(el);
        if (host) host.scrollTop += move;
        else window.scrollBy(0, move);
    }

    /* The reserve, read fresh — with one asymmetry. While a field is focused
       the reserve may grow or drop to zero, but never merely shrink: a Bangla
       keyboard's suggestion strip appears and disappears with every word, and
       chasing it down means shrinking the padding and re-nudging the page once
       per word — which is the "screen keeps jumping while I type" bug in the
       flesh. Extra reserve is unseen room below the fold; a page yanked down
       mid-word is very seen. Zero still passes through, because zero means the
       keyboard actually closed (Android's back button does this with the field
       still focused), and blur re-measures honestly on its own. */
    function currentReserve() {
        var next = measure();
        if (next !== 0 && next < reserve && isField(document.activeElement)) return reserve;
        return next;
    }

    function settle(delay) {
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (composing) return;
            /* Measure NOW, not when this was scheduled. The value cached at
               focus time predates the keyboard; and in a WebView that never
               fires a visualViewport event at all (Facebook's has moods),
               this late read is the only honest one we get. */
            reserve = currentReserve();
            applyReserve(reserve);
            /* Reserve first, uncover second: the scroll needs the room to exist
               before it can use it, and layout must have taken the padding. */
            requestAnimationFrame(uncover);
        }, delay);
    }

    /* A keyboard opening or closing is a real event; a candidate bar breathing
       by a few pixels, or a URL bar collapsing under a thumb, is not. The
       reserve tracks every change — it only ever adds unseen room at the foot of
       the page — but only the keyboard actually appearing hands us back the
       wheel after the visitor has taken it. Otherwise a URL bar sliding away
       mid-scroll would read as a mandate to yank them back down. */
    function onViewportChange() {
        if (composing) return;
        var next = currentReserve();
        if (next === reserve) return;

        var opened = reserve === 0 && next > 0;
        reserve = next;
        if (opened) handsOff = false;
        settle(120);
    }

    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);

    /* The heartbeat. Facebook's WebView is why it exists: its visualViewport
       carries honest NUMBERS but does not reliably fire the EVENTS — the
       keyboard opens, vv.height shrinks, and no resize ever arrives. Every
       listener above is deaf to a keyboard nobody announced, and the one late
       read settle() takes at focus+320ms is blind to a keyboard that finishes
       opening after it, changes height when a suggestion strip loads, or is
       closed by Android's back button with the field still focused. So while a
       field is focused — and only then — we take our own pulse. Every layer is
       a no-op when nothing changed (applyReserve compares, uncover has its
       floor and its handsOff), so in a browser whose events work this never
       finds anything to do; in one whose events don't, it is the only thing
       that ever will. It retires itself once the keyboard is down and nothing
       is focused. */
    var beatTimer = 0;
    function beat() {
        if (composing || zoomed()) return;
        var next = currentReserve();
        if (!isField(document.activeElement) && !reserve && !next) {
            stopBeat();
            return;
        }
        reserve = next;
        applyReserve(next);
        requestAnimationFrame(uncover);
    }
    function startBeat() { stopBeat(); beatTimer = setInterval(beat, 600); }
    function stopBeat()  { if (beatTimer) { clearInterval(beatTimer); beatTimer = 0; } }

    document.addEventListener('focusin', function (e) {
        if (!isField(e.target)) return;
        handsOff  = false;
        /* A composition cannot survive its field losing focus — the browser
           commits it at blur. But Facebook's WebView has been seen committing
           WITHOUT firing compositionend, and a `composing` that nothing ever
           clears is a kit that never runs again for the life of the page.
           Focus moving is proof the old composition is over, whether or not
           its end event was delivered. */
        composing = false;
        reserve   = currentReserve();
        /* Long enough for the keyboard's slide-in to finish; correcting against
           a half-open keyboard is how you end up correcting twice. The
           heartbeat picks up whatever this early read got wrong. */
        settle(320);
        startBeat();
    });

    document.addEventListener('focusout', function () {
        composing = false;  /* same swallowed-compositionend insurance as focusin */
        clearTimeout(timer);
        timer = setTimeout(function () {
            if (isField(document.activeElement)) return;  /* moved to the next field */
            reserve = measure();
            applyReserve(reserve);
        }, 320);
    });

    /* The visitor took over. Whatever they are looking at is more important than
       what we think should be on screen — most often it is the field two rows
       up, checked before they commit to the next one. We stay out of it until
       the focus or the keyboard changes and gives us a fresh mandate. */
    window.addEventListener('touchmove', function () { handsOff = true; }, { passive: true });
    window.addEventListener('wheel',     function () { handsOff = true; }, { passive: true });

    /* Freeze for the duration of a composition — see the header note. */
    document.addEventListener('compositionstart', function () {
        composing = true;
        clearTimeout(timer);
    });
    document.addEventListener('compositionend', function () {
        composing = false;
        settle(250);
    });

    /* Coming back through the back button restores this page from the bfcache
       with all of its JS state intact — including a reserve measured against a
       keyboard that closed two pages ago, and which no resize will now fire to
       clear. Start over from what is actually on screen. */
    window.addEventListener('pageshow', function (e) {
        if (!e.persisted) return;
        clearTimeout(timer);
        stopBeat();
        composing  = false;
        handsOff   = false;
        reserve    = 0;
        baseVisual = vv.height;
        baseLayout = root.clientHeight;
        baseWidth  = root.clientWidth;
        applyReserve(0);
    });
})();
