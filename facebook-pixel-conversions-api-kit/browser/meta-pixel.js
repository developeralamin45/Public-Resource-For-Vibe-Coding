/**
 * meta-pixel.js — the browser half: the pixel, every standard event, and
 * the attribution the server needs later.
 *
 *   MetaPixel.init({ pixelId: '1234567890', purchasePolicy: 'on_confirm', relayUrl: '/api/meta/event' });
 *   MetaPixel.viewContent({ content_ids: ['sku-1'], content_type: 'product', value: 950, currency: 'BDT' });
 *   MetaPixel.addPaymentInfo({ ... }, { user: { phone: '01712345678' } });
 *
 * What it takes care of so each page does not have to:
 *
 *   • One event, two channels. Every event fires in the browser (fbq) and,
 *     when `relayUrl` is set, on the server (Conversions API) with the SAME
 *     event_id — Meta counts the pair once, and an ad blocker that ate the
 *     browser copy leaves the server copy standing.
 *
 *   • Purchase is guarded. Under `on_confirm` the browser never fires it —
 *     the visitor has only CLAIMED to pay; the server sends Purchase when
 *     the money is real. Under `on_order` / `on_payment` it fires only with
 *     the event_id the server issued for that order. The relay never
 *     carries a Purchase under any policy.
 *
 *   • fbevents.js (≈260 KB) does not compete with the first paint. The
 *     `fbq` stub queues at once; the download waits for the first touch or
 *     scroll, or 2.5 s after load. A conversion event loads it immediately.
 *
 *   • Nothing here throws. Tracking must never break a checkout.
 *
 * Plain script: <script src="meta-pixel.js"></script> → window.MetaPixel.
 * Bundler (Vite, webpack): import it for its side effect and use the typed
 *               handle — see react/metaPixel.ts. Types: meta-pixel.d.ts.
 * No dependencies.
 */
(function (root, factory) {
    var api = factory(root);
    if (root) root.MetaPixel = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this, function (win) {
    'use strict';

    var STANDARD_EVENTS = [
        'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
        'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead',
        'CompleteRegistration', 'Contact', 'CustomizeProduct', 'Donate',
        'FindLocation', 'Schedule', 'StartTrial', 'SubmitApplication', 'Subscribe',
    ];
    var POLICIES = ['on_order', 'on_payment', 'on_confirm'];

    var cfg = null;
    var lastPageViewPath = null;
    var loadScript = function () {};

    function warn(msg) { try { if (cfg && cfg.debug) console.warn('[MetaPixel] ' + msg); } catch (e) { /* silent */ } }

    function active() {
        if (!cfg || !cfg.pixelId || !win || !win.document) return false;
        try { return cfg.enabled ? cfg.enabled() !== false : true; } catch (e) { return false; }
    }

    // Meta's own base code, with one change: the script download is deferred.
    function injectBaseCode(lazy, scriptUrl) {
        var doc = win.document;
        if (!win.fbq) {
            var fbq = function () {
                if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
                else fbq.queue.push(arguments);
            };
            if (!win._fbq) win._fbq = fbq;
            fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
            win.fbq = fbq;
        }
        var armed = false;
        loadScript = function () {
            if (armed) return;
            armed = true;
            var t = doc.createElement('script');
            t.async = true; t.src = scriptUrl;
            (doc.head || doc.documentElement).appendChild(t);
        };
        if (!lazy) { loadScript(); return; }
        ['pointerdown', 'touchstart', 'scroll', 'keydown'].forEach(function (k) {
            win.addEventListener(k, loadScript, { once: true, passive: true });
        });
        if (doc.readyState === 'complete') setTimeout(loadScript, 2500);
        else win.addEventListener('load', function () { setTimeout(loadScript, 2500); }, { once: true });
    }

    function newEventId() {
        try { return win.crypto.randomUUID(); } catch (e) { /* older browsers */ }
        return 'ev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
    }

    function getCookie(name) {
        try {
            var m = win.document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
            return m ? decodeURIComponent(m[1]) : null;
        } catch (e) { return null; }
    }

    // The _fbc cookie, or — when the visitor arrived from an ad a moment ago
    // and the pixel has not written it yet — built from the fbclid in the
    // URL in Meta's own format (fb.1.<ms>.<fbclid>).
    function getFbc() {
        var cookie = getCookie('_fbc');
        if (cookie) return cookie;
        try {
            var fbclid = new URLSearchParams(win.location.search).get('fbclid');
            if (fbclid) return 'fb.1.' + Date.now() + '.' + fbclid;
        } catch (e) { /* silent */ }
        return null;
    }

    /**
     * What this browser knows about the ad click. Send it with every order,
     * lead and registration, and have the server keep it with the row: under
     * `on_confirm` it is the only thing that ties a Purchase confirmed days
     * later back to today's click.
     */
    function attribution() {
        try { return { fbp: getCookie('_fbp'), fbc: getFbc(), url: win.location.href }; }
        catch (e) { return { fbp: null, fbc: null, url: '' }; }
    }

    function toAsciiDigits(s) {
        return String(s == null ? '' : s).replace(/[০-৯٠-٩۰-۹]/g, function (d) {
            var c = d.charCodeAt(0);
            var base = c >= 0x09E6 ? 0x09E6 : c >= 0x06F0 ? 0x06F0 : 0x0660;
            return String(c - base);
        });
    }

    // The SAME rule as the server (meta-capi.js normalizePhone), so the two
    // halves of a deduplicated pair hash to the same value.
    function normalizePhone(phone, countryCode) {
        var p = toAsciiDigits(phone).replace(/\D/g, '');
        if (!p) return '';
        if (p.indexOf('00') === 0) p = p.slice(2);
        var cc = String(countryCode == null ? '880' : countryCode).replace(/\D/g, '');
        if (!cc) return p;
        if (p.indexOf(cc) === 0) return p;
        if (p.charAt(0) === '0') return cc + p.replace(/^0+/, '');
        if (p.length <= 10) return cc + p;
        return p;
    }

    function sha256(value) {
        try {
            var data = new TextEncoder().encode(value);
            return win.crypto.subtle.digest('SHA-256', data).then(function (buf) {
                return Array.prototype.map.call(new Uint8Array(buf), function (b) {
                    return ('0' + b.toString(16)).slice(-2);
                }).join('');
            }, function () { return null; });
        } catch (e) {
            // Not a secure context — skip matching rather than fail the event.
            return Promise.resolve(null);
        }
    }

    function relay(name, eventId, params, user) {
        if (!cfg.relayUrl || name === 'Purchase') return;
        var phone = user && user.phone ? normalizePhone(user.phone, cfg.phoneCountryCode) : '';
        var email = user && user.email ? String(user.email).trim().toLowerCase() : '';
        Promise.all([phone ? sha256(phone) : null, email ? sha256(email) : null]).then(function (h) {
            var a = attribution();
            var body = {
                event_name: name,
                event_id: eventId,
                event_source_url: a.url,
                fbp: a.fbp,
                fbc: a.fbc,
                ph: h[0],
                em: h[1],
                custom_data: name === 'PageView' ? {} : (params || {}),
            };
            // keepalive: the request outlives an immediate navigation
            // (AddPaymentInfo, then straight to the next page).
            return win.fetch(cfg.relayUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                keepalive: true,
            });
        }).catch(function () { /* silent */ });
    }

    function fire(method, name, params, opts) {
        if (!active()) return null;
        opts = opts || {};
        var eventId = opts.eventId || newEventId();
        try {
            if (name !== 'PageView') loadScript();
            win.fbq(method, name, params || {}, { eventID: eventId });
        } catch (e) { /* silent */ }
        if (method === 'track') { try { relay(name, eventId, params, opts.user); } catch (e) { /* silent */ } }
        return eventId;
    }

    /**
     * Fire one standard event. Returns its event_id (null when tracking is
     * off). `opts.user` = { phone, email } — hashed here, before it leaves
     * the browser, and used only for matching on the server copy.
     */
    function track(name, params, opts) {
        if (STANDARD_EVENTS.indexOf(name) === -1) { warn(name + ' is not a standard event — use trackCustom()'); return null; }
        if (name === 'Purchase') return purchase(params, opts && opts.eventId, opts);
        return fire('track', name, params, opts);
    }

    /** A custom event (browser only — custom events are not relayed). */
    function trackCustom(name, params, opts) { return fire('trackCustom', name, params, opts); }

    /**
     * The browser's copy of a Purchase. Allowed only where the page itself
     * is proof (on_order: the order just placed; on_payment: the gateway's
     * verified return) and only with the event_id the SERVER issued for
     * that order — the server sends the same Purchase itself, and the shared
     * id is what makes Meta count it once. A refresh of the thank-you page
     * does not fire it again.
     *
     * `opts.policy` — this ORDER's policy, for a shop whose payment methods
     * differ (COD beside send-money); it overrides the site-wide one.
     */
    function purchase(params, eventId, opts) {
        if (!active()) return null;
        var policy = opts && POLICIES.indexOf(opts.policy) !== -1 ? opts.policy : cfg.purchasePolicy;
        if (policy === 'on_confirm') {
            warn('Purchase is server-only under on_confirm; fire AddPaymentInfo here');
            return null;
        }
        if (!eventId) { warn('Purchase needs the server-issued eventId'); return null; }
        if (!params || !(Number(params.value) > 0) || !params.currency) { warn('Purchase needs value and currency'); return null; }
        var key = 'mp_purchase_' + eventId;
        try {
            if (win.sessionStorage.getItem(key)) return eventId;
            win.sessionStorage.setItem(key, '1');
        } catch (e) { /* private mode — fire anyway; the event_id still dedupes */ }
        try { loadScript(); win.fbq('track', 'Purchase', params, { eventID: eventId }); } catch (e) { /* silent */ }
        return eventId;
    }

    /**
     * The "I have ordered / I have paid" moment, whatever the policy:
     * Purchase where the browser may fire it, AddPaymentInfo where it may
     * not. One call site in the checkout, right under every policy.
     */
    function orderSubmitted(params, opts) {
        opts = opts || {};
        if (opts.purchaseEventId) {
            var fired = purchase(params, opts.purchaseEventId, opts);
            if (fired) return fired;
        }
        return fire('track', 'AddPaymentInfo', params, { eventId: opts.eventId, user: opts.user });
    }

    /** PageView, once per path — call it on every route change in an SPA. */
    function pageView() {
        if (!active()) return null;
        var path = win.location.pathname + win.location.search;
        if (path === lastPageViewPath) return null;
        lastPageViewPath = path;
        return fire('track', 'PageView', {}, {});
    }

    /**
     * options:
     *   pixelId           the public Pixel / Dataset ID
     *   purchasePolicy    'on_order' | 'on_payment' | 'on_confirm' (default — the safe one)
     *   relayUrl          POST endpoint for the server copy; omit for browser-only
     *   enabled           () => boolean — return false inside a native app WebView, on admin pages, without consent
     *   lazy              defer fbevents.js (default true)
     *   autoPageView      fire PageView on init (default true)
     *   phoneCountryCode  for matching (default '880')
     *   debug             console warnings
     */
    function init(options) {
        options = options || {};
        if (cfg && cfg.pixelId) return active();
        cfg = {
            pixelId: String(options.pixelId || '').trim(),
            purchasePolicy: POLICIES.indexOf(options.purchasePolicy) === -1 ? 'on_confirm' : options.purchasePolicy,
            relayUrl: options.relayUrl || '',
            enabled: typeof options.enabled === 'function' ? options.enabled : null,
            phoneCountryCode: options.phoneCountryCode == null ? '880' : options.phoneCountryCode,
            debug: !!options.debug,
        };
        if (!active()) return false;
        try {
            injectBaseCode(options.lazy !== false, options.scriptUrl || 'https://connect.facebook.net/en_US/fbevents.js');
            win.fbq('init', cfg.pixelId);
        } catch (e) { return false; }
        if (options.autoPageView !== false) pageView();
        return true;
    }

    var api = {
        init: init,
        pageView: pageView,
        track: track,
        trackCustom: trackCustom,
        purchase: purchase,
        orderSubmitted: orderSubmitted,
        attribution: attribution,
        newEventId: newEventId,
        normalizePhone: normalizePhone,
        STANDARD_EVENTS: STANDARD_EVENTS,
        /** Test seam: forget the configuration. */
        _reset: function () { cfg = null; lastPageViewPath = null; loadScript = function () {}; },
    };

    // One named helper per standard event: MetaPixel.addToCart({...}).
    STANDARD_EVENTS.forEach(function (name) {
        if (name === 'PageView' || name === 'Purchase') return;
        api[name.charAt(0).toLowerCase() + name.slice(1)] = function (params, opts) { return track(name, params, opts); };
    });

    return api;
});
