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

   There are three kinds of host, and this kit has to survive all of them:

     A. Chrome. The viewport shrinks, events fire, the browser scrolls the
        field into view itself. We measure zero and stay out of the way.

     B. A WebView that resizes nothing but whose visualViewport still carries
        honest NUMBERS — vv.height shrinks — while not reliably firing the
        EVENTS. Anything listening for a resize is deaf to a keyboard nobody
        announced. That is what the heartbeat is for: while a field is
        focused we read the numbers ourselves, and reserve and scroll from
        what they say.

     C. A WebView that gives us NOTHING. No event, and no number either:
        the keyboard is drawn over the page and every measurement — 100vh,
        innerHeight, visualViewport.height — reads exactly as it did before.
        Facebook's browser on current Android does this (an edge-to-edge
        window whose host never applies the keyboard inset to the WebView).
        Here there is nothing to measure, and a kit built on measuring is a
        kit that does nothing at all — the field sits centred behind the
        keyboard, and the screenshot that proves it has a Facebook title bar.

   For A and B, two things are needed and they are not the same thing:

     1. ROOM. If the field is the last thing on the page, there is nowhere to
        scroll it to — the document simply ends there. So while the keyboard
        is up we add exactly the missing height to the bottom of the document.
        Now the page CAN scroll far enough, whether the browser does it, we do
        it, or the visitor does it with a thumb.

     2. ONE nudge, then hands off. We scroll the focused field clear of the
        keyboard once, and only if it is genuinely covered. If the browser
        already handled it — Chrome — nothing is covered, so we do nothing at
        all, and Chrome's good behaviour stays untouched.

   For C, where nothing can be measured, there are two more, and they act on
   position instead of on measurement:

     3. A field inside a PANEL — a popup's own scroller — is scrolled up just
        far enough that it, and whatever it asked to keep under it
        (scroll-margin-bottom: its submit button), sit at the foot of the
        panel. Never further, and never past the range the panel's own content
        already has. Nothing is added to the panel, ever.

        That last clause is the lesson of the version this replaces, which
        lengthened the panel with padding so the field could reach the TOP of
        it. Both halves of that were wrong. Aiming at the top asks for the
        longest scroll there is, so it needed the most padding; and padding
        added on focus came off on BLUR, while a keyboard is dismissed with a
        chevron that blurs nothing — so a buyer who put the keyboard away was
        left staring at a white card with four hundred pixels of nothing under
        the button. It also ran on every host, including the one that already
        had this right, which is how Chrome acquired the same white band.

     3b. When that scroll cannot be enough — a card sized to a viewport the
        host never shrank is taller than the space the keyboard left, so its
        foot is behind the keyboard no matter where the content sits — the
        CARD is shortened instead, to the half of the screen no keyboard
        reaches, and 3 runs again into the shorter box. Shrinking what an
        overlay may use is the same correction expressed as a HEIGHT, and a
        height cannot outlive the keyboard the way padding did: it is state,
        undone by removing one attribute, not a mutation to unwind.

     4. A field on the PAGE itself gets the heartbeat's judgement: it was
        tapped, the wait for an announcement is over, none came, and it sits
        where a keyboard would be. Then we assume the keyboard, reserve at the
        foot of the document exactly the height one would cover, and scroll
        the field — with whatever it keeps under it — to the foot of the band
        no keyboard reaches, and no further. The reserve is never lengthened
        to take it higher: room past the keyboard is not unseen, it is the
        grey band between the form and the keys the moment the real keyboard
        is shorter than the guess, and half a screen of nothing under the form
        once the keyboard is put away with the chevron. A guess — but the
        alternative is the screenshot; a wrong guess costs one unneeded
        scroll, a right one is the difference between a sale and a buyer
        typing into a field they cannot see.

   The obvious implementation of all this is scrollIntoView on every focus;
   that is also the version that makes the screen jump, because it fights the
   browser's own scrolling, fires again on every keyboard resize, and drags
   the page back down the moment the visitor scrolls up to check the email
   they just typed. So: we never scroll on a scroll, we stand down the instant
   a finger touches the screen, we never act on a field that is still moving,
   and we come back only when the focus or the keyboard height actually
   changes.

   IME is the other half. A Bangla keyboard (or Gboard's own suggestion buffer,
   or swipe typing) holds half-finished text in a composition the browser owns,
   and moving the page under an open composition is how you get a candidate bar
   that flickers and a caret that jumps. Between compositionstart and
   compositionend we freeze completely — no scrolling, no resizing, no reading
   of a layout that is mid-flight. See useImeInput for the matching rule on the
   other side: do not rewrite .value mid-composition.

   Rejected: `interactive-widget=resizes-content` in the viewport meta. It is
   the standards-track version of point 1 and it would be one line — but it
   changes what 100vh means for every browser, including the one that has no
   bug today, and host C ignores it anyway. Buying a fix for the in-app browser
   with a behaviour change in Chrome is the wrong trade when the JS below is
   scoped to do nothing unless something is actually wrong.

   A fixed overlay (like the send-money popup) is its own scroller, so the
   page-level room added here cannot reach inside it. The overlay's CSS must
   spend the number itself — two lines, and a bottom sheet wants both:
     html[data-kb] .my-popup{max-height:calc(var(--kb-vh,100vh) - 32px);}
     html[data-kb] .my-sheet{margin-bottom:var(--kb-reserve,0px);}
   --kb-vh is the height the overlay may use, --kb-reserve the height the
   keyboard covers, --kb-top how far an adjustPan host scrolled the page. All
   three in PIXELS, and that is not a style choice: `dvh` landed in Chrome 108
   and a browser that does not know a unit throws the WHOLE declaration away,
   so a dvh rule became no rule at all on precisely the hosts with the bug —
   the kit measured perfectly, published the number, and the CSS meant to
   spend it had already been dropped. A length in px cannot be dropped by
   anyone.

   Shortening is for a card the overlay tops or centres; lifting is for one
   anchored to the foot. Give a bottom sheet only the height and it will sit,
   shorter, exactly where it was — on the bottom edge, behind the keyboard.

   And the overlay should sit at the TOP of the screen on phones, not centred:
   centred in a viewport the browser never shrank is centred behind the
   keyboard, and a card already where it needs to be has nothing to jump when
   the keyboard arrives.

   Tested, not asserted: tools/keyboard drives this file through all three
   hosts in a headless browser. The version this replaces was reasoned about
   just as carefully and shipped a white void to every one of them.
*/
(function () {
    var vv = window.visualViewport;
    if (!vv) return;

    /* Touch devices only — but this is the cheap guard, not the real one. It
       just avoids binding listeners on a desktop that could never need them.
       The measuring half below acts on a viewport that measurably shrank, so
       a physical keyboard, which shrinks nothing, falls out for free. The
       positional half (points 3 and 4) has no measurement to lean on; its
       guard is that it only ever moves a field that is sitting where a
       keyboard would land, and only inside a scroller of its own or after a
       finger actually tapped it. */
    if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;

    var root = document.documentElement;

    /* The room from point 1, as CSS. Padding on the ROOT element, not on body:
       body often carries min-height:100vh, and with border-box sizing padding
       inside that just re-centres content instead of lengthening the document.
       html has no height of its own, so its padding is pure scroll range.
       (clientHeight on the root still reports the viewport, not this box, so
       the measurement below stays honest.) scroll-padding-bottom tells the
       browser's OWN scrolling where to land a field it focuses without us —
       "Next" on the keyboard, a Tab — so the next field arrives above the
       keyboard rather than under it. --kb-foot is that line: the measured
       keyboard plus some air where the host reports one, the foot of the safe
       band where it had to be guessed — the same line revealOnPage aims at,
       so a field the browser placed needs no second nudge from the
       heartbeat 600ms later. */
    var css = document.createElement('style');
    css.textContent =
        'html[data-kb]{padding-bottom:var(--kb-reserve,0px);' +
        'scroll-padding-bottom:var(--kb-foot,0px);}';
    document.head.appendChild(css);

    var KB_MIN     = 140;  /* px. Under this it is browser chrome collapsing, not a keyboard. */
    var GAP_BELOW  = 20;   /* px of air we want between the field and the keyboard. */
    var GAP_ABOVE  = 32;   /* px above — a floating label sits outside the input's box. */
    var STEP       = 8;    /* Round the reserve, so a candidate bar twitching by 2px is not a relayout. */
    var MIN_MOVE   = 12;   /* px. Below this a correction is invisible as a fix and visible as a twitch. */

    /* Host C's constants. Fractions of the LAYOUT viewport, which in host C
       is the whole screen below the browser bar — the only height there is. */
    var SAFE_BAND  = 0.40; /* The top band no keyboard reaches. The tallest seen (Gboard, Bangla, suggestions, number row) stops at ~52%. */
    var BAND       = 0.50; /* Where an assumed keyboard's top edge is: half way down. A hair above the tallest actually seen (Gboard, Bangla, suggestions and number row, ~52%), so a card sized to the band is never clipped by it. The one number the whole guess rests on — the overlay's height and the page's reserve are both read off it, so they can never disagree. */
    var TOUCH_TTL  = 1500; /* ms. A focus this soon after a touch was a tap on the field — a keyboard follows it. */
    var MIN_PANEL  = 100;  /* px. Anything shorter that computes overflow-y:auto is a chip strip, not a panel. */
    var SETTLE_MS  = 360;  /* A smooth scroll's length, roughly; the room comes off after it. */

    var baseVisual = vv.height;      /* viewport height with no keyboard up */
    var baseLayout = root.clientHeight;
    var baseWidth  = root.clientWidth;

    var composing    = false;  /* an IME owns the field right now — touch nothing */
    var handsOff     = false;  /* the visitor scrolled; stop steering until something changes */
    var reserve      = 0;
    var lastReserve  = -1;
    var lastFoot     = -1;
    var lastTop      = -1;
    var timer        = 0;
    var lastKeyboard = 0;      /* the raw keyboard height the last measure() saw, before crediting the host */
    var assumed      = false;  /* the reserve on the page is a guess (point 4), not a measurement */
    var lastTouch    = 0;      /* when a finger last touched the screen */
    var fieldTop     = NaN;    /* where the focused field was at the last look — a field still moving is not judged */
    var band         = 0;      /* px of height a fixed overlay may use; 0 = as much as it likes */
    var lastBand     = -1;
    var assumedBand  = false;  /* the band is a guess, so a measurement of zero must not retire it */
    var everReported = false;  /* this host has announced a keyboard at least once, so its silence means something */

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
        lastKeyboard = keyboard;
        if (keyboard < KB_MIN) return 0;

        var shrunk = baseLayout - root.clientHeight;
        return Math.max(0, Math.round((keyboard - shrunk) / STEP) * STEP);
    }

    /* The visible band itself, in PIXELS, for the surfaces that cannot use the
       document's scroll range — a fixed overlay has to size itself to what the
       keyboard left, and no amount of padding at the foot of the document
       reaches inside one.

       Pixels rather than dvh, and that is the whole point. `dvh` arrived in
       Chrome 108 (Dec 2022); the in-app browsers this kit exists for are
       routinely older, and a browser that does not know a unit throws the
       WHOLE declaration away. So `max-height: calc(100dvh - ...)` silently
       became no rule at all on exactly the hosts that needed it: the kit
       measured the keyboard perfectly, published the number, and the CSS that
       was supposed to spend it had already been dropped. The card kept its
       full height and sat behind the keyboard. A length in px cannot be
       dropped by anyone.

       --kb-top is the other half. An adjustPan host does not resize the page,
       it scrolls the whole thing upward — carrying a `position:fixed` overlay
       up with it, off the top of the screen. offsetTop is how far it went, and
       an overlay that pads by it lands back where the eye is. */
    function publishTop() {
        if (zoomed()) return;
        var t = Math.round(vv.offsetTop);
        if (t !== lastTop) { lastTop = t; root.style.setProperty('--kb-top', t + 'px'); }
    }

    /* data-kb is the switch every overlay rule hangs off, and BOTH halves of
       the kit can be the reason it is on: a page that needed room at its foot,
       or an overlay that needed a shorter box. One owner, so that neither can
       switch the other's rules off on its way out. */
    function syncAttr() {
        if (reserve > 0 || band > 0) root.setAttribute('data-kb', '');
        else root.removeAttribute('data-kb');
    }

    /* The height a fixed overlay may use, in px. Measured from the visual
       viewport where the host reports one; guessed at half the screen where it
       reports nothing ([guess] true). Sole owner of --kb-vh: a measurement
       must never quietly overwrite a guess that is currently holding a card
       above a keyboard nobody announced. */
    function applyBand(px, guess) {
        assumedBand = !!guess;
        if (px !== lastBand) {
            lastBand = px;
            band = px;
            if (px > 0) root.style.setProperty('--kb-vh', px + 'px');
            else root.style.removeProperty('--kb-vh');
        }
        syncAttr();
    }

    /* Where the browser's own scrolling should land a field (see the CSS
       above). Refreshed on every reserve, guess or measurement alike: the same
       number can be a guess one beat and a measurement the next. */
    function publishFoot(next) {
        var foot = next > 0 ? (assumed ? Math.round(root.clientHeight * (1 - SAFE_BAND)) : next + GAP_ABOVE) : 0;
        if (foot === lastFoot) return;
        lastFoot = foot;
        if (foot > 0) root.style.setProperty('--kb-foot', foot + 'px');
        else root.style.removeProperty('--kb-foot');
    }

    function applyReserve(next) {
        /* Before data-kb, never after: the rule that reads these variables
           starts matching the instant the attribute lands, and a rule that
           matches with its measurement still missing is the flicker. */
        if (next > 0) {
            publishTop();
            if (!assumedBand && !zoomed()) applyBand(Math.round(vv.height), false);
        }
        reserve = next;
        publishFoot(next);
        if (next === lastReserve) { syncAttr(); return; }
        lastReserve = next;
        if (next > 0) {
            root.style.setProperty('--kb-reserve', next + 'px');
        } else {
            root.style.removeProperty('--kb-reserve');
            root.style.removeProperty('--kb-top');
            lastTop = -1;
            if (!assumedBand) applyBand(0, false);
        }
        syncAttr();
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

    /* The panel a field lives in — whether or not it can scroll YET. The
       measuring path above wants a scroller that already has range; point 3
       wants the one that will have it once it is given room, which is how a
       popup whose content fits without scrolling still gets its last field
       lifted to the top. The height floor is what rules out a chip strip. */
    function panelFor(el) {
        var stop = document.body;
        for (var n = el.parentElement; n && n !== stop && n !== root; n = n.parentElement) {
            var oy = getComputedStyle(n).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && n.clientHeight >= MIN_PANEL) return n;
        }
        return null;
    }

    /* scroll-margin-bottom: "when you reveal me, reveal what sits under me
       too" — the payment popup's submit button lives there. */
    function clearance(el) { return parseFloat(getComputedStyle(el).scrollMarginBottom) || 0; }
    /* scroll-margin-top: the label above the box, when the field declares one. */
    function headroom(el)  { var m = parseFloat(getComputedStyle(el).scrollMarginTop); return m > 0 ? m : GAP_ABOVE; }

    /* Is the field — and what it asked to keep under it — inside the band at
       the top of the screen that no keyboard reaches? A field that is, needs
       nothing from anyone; moving it would be the twitch this kit exists to
       avoid. */
    function inSafeBand(el) {
        var box = el.getBoundingClientRect();
        if (!box.height) return true;   /* display:none, or a panel mid-transition: nothing to reveal */
        return box.bottom + clearance(el) <= root.clientHeight * SAFE_BAND;
    }

    /* ── Point 3: the panel scroll ──
       The field, and whatever it asked to keep under it, brought to the foot
       of the panel — and no further. Clamped to the range the panel's content
       already has, so this can move what is there and can never add to it.

       Two directions, and only two. Below the foot: scroll up until the field
       and its clearance fit. Clipped at the head (under a sticky header, or
       off the top after a shrink): scroll down until its label is clear. A
       field that is neither is left exactly where it is — that is the common
       case on a host that handles its own keyboard, and doing nothing there
       is the point.

       What it must never do is scroll a visible field DOWNWARD to sit at the
       foot. That is not a reveal, it is the screen jumping, and aiming at a
       fixed landing line rather than at "somewhere on screen" is how the last
       version earned that. */
    function revealInPanel(el, host) {
        var box = el.getBoundingClientRect();
        if (!box.height) return;
        var hbox = host.getBoundingClientRect();
        var pad  = parseFloat(getComputedStyle(host).scrollPaddingTop) || 0;
        var max  = Math.max(0, host.scrollHeight - host.clientHeight);
        var want = host.scrollTop;

        var below = (box.bottom + clearance(el)) - hbox.bottom;
        var above = (hbox.top + pad + headroom(el)) - box.top;
        /* Clipped wins: a field nobody can see at all beats a button below the
           fold. For a field shorter than its panel the two never both apply. */
        if (below > 0) want = host.scrollTop + below;
        if (above > 0) want = host.scrollTop - above;

        if (want < 0) want = 0;
        if (want > max) want = max;
        if (Math.abs(want - host.scrollTop) < MIN_MOVE) return;
        host.scrollTop = want;
    }

    /* Point 4's placement: the nearest position that works. The field, and
       whatever it keeps under it, brought to the foot of the band no keyboard
       reaches — the same line inSafeBand tests — and no further. Clamped to
       the range the document has once the reserve is on it: a field that is
       the last thing on the page lands as high as that allows, a hair above
       the assumed keyboard, and the reserve is never topped up to take it
       higher. The version this replaces aimed at a landing line near the top
       and lengthened the reserve until the scroll could reach it. The extra
       length was room past the keyboard — and room past the keyboard is the
       grey band a visitor sees between the form and the keys the moment the
       real keyboard is shorter than the guess, and half a screen of nothing
       under the form once the keyboard is put away with the chevron. The
       signup page shipped exactly that, in Facebook's browser, 2026-09-21. */
    function revealOnPage(el) {
        var box = el.getBoundingClientRect();
        if (!box.height) return;
        var foot = vv.offsetTop + Math.round(root.clientHeight * SAFE_BAND);
        var move = (box.bottom + clearance(el)) - foot;
        var max  = Math.max(0, root.scrollHeight - root.clientHeight);
        if (window.scrollY + move > max) move = max - window.scrollY;
        if (move < MIN_MOVE) return;
        window.scrollBy(0, move);
    }

    function assumedBandPx()  { return Math.round(root.clientHeight * BAND); }
    /* The other side of the same line: what the keyboard is assumed to cover. */
    function assumedReserve() { return Math.round((root.clientHeight - assumedBandPx()) / STEP) * STEP; }

    /* Point 4's judgement, from the heartbeat. True when it acted. Every
       clause is a reason NOT to guess: nothing focused; a focus that no finger
       caused (a script, a physical keyboard's Tab); a field in a panel, which
       point 3 already placed; a field already in the safe band; a visitor who
       has taken the wheel; a field that moved since we last looked — the page
       is mid-scroll, ours or theirs, and a nudge on top of a scroll is the
       jump. */
    function assume() {
        var el = document.activeElement;
        if (!isField(el) || !el.isConnected || handsOff) return false;
        /* A host that has announced a keyboard once in this session announces
           them all: its silence now is the honest report of an empty screen,
           not the silence of a host that cannot speak. Believe it, and never
           guess over it again — this is what keeps a browser that handles its
           own keyboard from being second-guessed on every later field. */
        if (everReported) return false;
        if (!assumed && !assumedBand && Date.now() - lastTouch > TOUCH_TTL) return false;
        var top = el.getBoundingClientRect().top;
        var moving = isFinite(fieldTop) && Math.abs(top - fieldTop) > MIN_MOVE;
        fieldTop = top;
        if (moving) return false;

        /* Point 3b. The card is shortened to the band no keyboard reaches and
           the panel scroll runs again into the smaller box — where the same
           clamped scroll now reaches, because the foot it is aiming at has
           moved up. Reading the field's box forces the layout that takes the
           new height, so the shorter panel exists by the time we scroll it.
           Once the band is on, it stays on until a blur or a real
           measurement: a beat that finds the field comfortable now must not
           read that as "no keyboard" and hand the card its full height back
           under the visitor's thumb. */
        var host = panelFor(el);
        if (host) {
            if (inSafeBand(el) && !assumedBand) return false;
            applyBand(assumedBandPx(), true);
            /* Shortening is enough for a card the overlay centres or tops. It
               is NOT enough for one anchored to the FOOT of the screen — the
               renewal sheet slides up from the bottom, and a shorter sheet
               still sitting on the bottom edge is still behind the keyboard.
               So the reserve goes out too: --kb-reserve is the height the
               keyboard is assumed to cover, and a bottom sheet spends it as a
               margin. Set after the band, never before: applyReserve publishes
               a MEASURED band when it has one, and the guard it checks is the
               flag applyBand just raised.

               assumed, so that the next heartbeat's measurement of zero — the
               only thing this host will ever report — reads as "no news" and
               not as "the keyboard closed, take it all back", which is the
               reserve flapping on and off under the visitor's thumb. */
            assumed = true;
            reserve = assumedReserve();
            applyReserve(reserve);
            revealInPanel(el, host);
            return true;
        }

        if (inSafeBand(el)) return false;
        assumed = true;
        reserve = assumedReserve();
        applyReserve(reserve);
        /* Synchronous, not on the next frame: reading the field's box forces
           the layout that takes the new padding, so the room exists by the
           time the scroll asks for it. */
        revealOnPage(el);
        return true;
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
        var extra = reserve > 0 ? clearance(el) : 0;

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

    /* The reserve, read fresh — with two asymmetries. While a field is focused
       the reserve may grow or drop to zero, but never merely shrink: a Bangla
       keyboard's suggestion strip appears and disappears with every word, and
       chasing it down means shrinking the padding and re-nudging the page once
       per word — which is the "screen keeps jumping while I type" bug in the
       flesh. Extra reserve is unseen room below the fold; a page yanked down
       mid-word is very seen. Zero still passes through, because zero means the
       keyboard actually closed (Android's back button does this with the field
       still focused), and blur re-measures honestly on its own.

       The second: a reserve that was GUESSED (point 4) is kept for as long as
       the field is focused and the host stays silent — a measurement of zero
       from a host that cannot measure is not news, and acting on it would take
       the room away under the visitor's thumb, every beat, forever. The moment
       the host does speak, the guess retires and the measurement rules. */
    function currentReserve() {
        var next = measure();
        /* The host found its voice: every guess retires, the page's and the
           overlay's, and the measurement takes over from here. */
        if (lastKeyboard >= KB_MIN) { assumed = false; assumedBand = false; everReported = true; }
        if (assumed && next === 0 && isField(document.activeElement)) return reserve;
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

    /* The heartbeat. Host B is why it exists: honest NUMBERS, unreliable
       EVENTS — the keyboard opens, vv.height shrinks, and no resize ever
       arrives. Every listener above is deaf to a keyboard nobody announced,
       and the one late read settle() takes at focus+320ms is blind to a
       keyboard that finishes opening after it, changes height when a
       suggestion strip loads, or is closed by Android's back button with the
       field still focused. So while a field is focused — and only then — we
       take our own pulse. Every layer is a no-op when nothing changed
       (applyReserve compares, uncover has its floor and its handsOff), so in
       a browser whose events work this never finds anything to do; in one
       whose events don't, it is the only thing that ever will.

       Host C gets its judgement here too (point 4), and here rather than at
       focus on purpose: the first beat lands 600ms after the focus, which is
       longer than any keyboard takes to open and announce itself. A host that
       has said nothing by then is not going to. The beat retires itself once
       the keyboard is down and nothing is focused. */
    var beatTimer = 0;
    function beat() {
        if (composing || zoomed()) return;
        var next = currentReserve();
        /* Nothing focused means no keyboard, whatever the host did or did not
           say — the one conclusion that is safe to draw from silence. A card
           still holding a guessed band here would stay short for the life of
           the page. */
        if (!isField(document.activeElement)) applyBand(0, false);
        if (!isField(document.activeElement) && !reserve && !next) {
            stopBeat();
            return;
        }
        reserve = next;
        applyReserve(next);
        if (!next && lastKeyboard < KB_MIN && assume()) return;
        requestAnimationFrame(uncover);
    }
    function startBeat() { stopBeat(); beatTimer = setInterval(beat, 600); }
    function stopBeat()  { if (beatTimer) { clearInterval(beatTimer); beatTimer = 0; } }

    document.addEventListener('focusin', function (e) {
        var el = e.target;
        if (!isField(el)) return;
        handsOff  = false;
        /* A composition cannot survive its field losing focus — the browser
           commits it at blur. But Facebook's WebView has been seen committing
           WITHOUT firing compositionend, and a `composing` that nothing ever
           clears is a kit that never runs again for the life of the page.
           Focus moving is proof the old composition is over, whether or not
           its end event was delivered. */
        composing = false;
        /* Point 3, in the same frame as the focus, on every host: it is a
           clamped scroll of the panel's own content, so on a browser that
           handles its own keyboard the field is already inside the foot and
           this finds nothing to do. No gate needed, and no gate wanted — the
           safe-band test it used to carry was about a landing line that no
           longer exists. */
        if (!zoomed()) {
            var host = panelFor(el);
            if (host) revealInPanel(el, host);
        }
        fieldTop  = el.getBoundingClientRect().top;
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
            assumed  = false;
            fieldTop = NaN;
            /* Full height again, at the same moment the keyboard slides away.
               Nothing to unwind and nothing to time: the card grows back
               because one attribute stopped matching. */
            applyBand(0, false);
            reserve  = measure();
            applyReserve(reserve);
        }, 320);
    });

    /* The visitor took over. Whatever they are looking at is more important than
       what we think should be on screen — most often it is the field two rows
       up, checked before they commit to the next one. We stay out of it until
       the focus or the keyboard changes and gives us a fresh mandate. */
    window.addEventListener('touchstart', function () { lastTouch = Date.now(); }, { passive: true });
    window.addEventListener('touchmove',  function () { handsOff = true; }, { passive: true });
    window.addEventListener('wheel',      function () { handsOff = true; }, { passive: true });

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
        composing    = false;
        handsOff     = false;
        assumed      = false;
        reserve      = 0;
        lastKeyboard = 0;
        lastTop      = -1;
        fieldTop     = NaN;
        applyBand(0, false);
        baseVisual = vv.height;
        baseLayout = root.clientHeight;
        baseWidth  = root.clientWidth;
        applyReserve(0);
    });
})();
