/**
 * meta-capi.js — the server half of the pixel, as pure functions.
 *
 * Three jobs:
 *
 *   1. THE PURCHASE POLICY. When is an order a sale? It depends on the
 *      project, and getting it wrong teaches Meta to find the wrong people:
 *
 *        on_order    cash on delivery — the placed order IS the sale.
 *        on_payment  online gateway — the sale is the verified callback.
 *        on_confirm  money sent by hand, or an order a human has to confirm —
 *                    the sale is the confirmation, hours or days later.
 *
 *      purchaseDue() answers "is this the moment?", and the caller stamps the
 *      order so the same money is never reported twice.
 *
 *   2. ATTRIBUTION. By the time an on_confirm purchase is real the browser
 *      is long gone. readAttribution() keeps what Meta needs (fbp, fbc, ip,
 *      user agent, page) with the order while the buyer is still there.
 *
 *   3. THE EVENT. buildEvent()/buildPurchaseEvent() make the Conversions API
 *      payload — identity hashed the way Meta normalises it — and
 *      sendEvents() posts it. sendEvents() NEVER throws: a marketing call
 *      that can fail an order is not worth having.
 *
 * It touches no database. Bind it to yours as CONTRACT.md describes
 * (demo-server.js does it in memory, laravel/ in Eloquent).
 *
 * Zero dependencies. Node 18+ (global fetch). CommonJS and ESM both work.
 */
'use strict';

const { createHash } = require('node:crypto');

// Pinned, not floating: Meta retires a Graph version about two years after
// release, and an unpinned call starts failing on a date nobody has in a
// calendar. Check https://developers.facebook.com/docs/graph-api/changelog
// when you install the kit and move this forward.
const DEFAULT_GRAPH_VERSION = 'v23.0';

// ─── The standard events (Meta's own list) ──────────────────────────────
const STANDARD_EVENTS = [
    'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
    'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead',
    'CompleteRegistration', 'Contact', 'CustomizeProduct', 'Donate',
    'FindLocation', 'Schedule', 'StartTrial', 'SubmitApplication', 'Subscribe',
];

/**
 * May the public relay endpoint forward this event? Every standard event
 * except Purchase. The browser only knows what the visitor CLAIMS; a
 * Purchase is sent by the server code that knows the order, under every
 * policy — so a stale bundle, or someone with curl, cannot invent a sale.
 */
function relayAllowed(eventName) {
    return eventName !== 'Purchase' && STANDARD_EVENTS.includes(eventName);
}

// ─── The purchase policy ────────────────────────────────────────────────
const POLICIES = ['on_order', 'on_payment', 'on_confirm'];

/** The one moment each policy treats as the sale. */
const PURCHASE_MOMENT = {
    on_order: 'order_placed',
    on_payment: 'payment_verified',
    on_confirm: 'confirmed',
};
const MOMENTS = ['order_placed', 'payment_verified', 'confirmed'];

/**
 * The policy for one order. A shop that takes COD and bKash-by-hand side by
 * side has two policies, so the config is a default plus a per-method map:
 *
 *   { default: 'on_confirm', methods: { cod: 'on_order', sslcommerz: 'on_payment' } }
 *
 * An unknown policy name falls back to on_confirm — the one that can only
 * under-report, never tell Meta about a sale that did not happen.
 */
function policyFor(config, method) {
    const cfg = typeof config === 'string' ? { default: config } : (config || {});
    const key = String(method == null ? '' : method).trim().toLowerCase();
    const picked = (cfg.methods && key && cfg.methods[key]) || cfg.default;
    return POLICIES.includes(picked) ? picked : 'on_confirm';
}

/**
 * Is this the moment the Purchase goes out? Call it at every moment the
 * project has (order placed, gateway callback verified, human confirmed);
 * it is true at exactly one of them.
 *
 *   alreadySent — the order's own stamp (purchase_sent_at). A webhook that
 *                 retries, an admin who confirms twice, a status that goes
 *                 confirmed → shipped → confirmed: one Purchase.
 */
function purchaseDue(policy, moment, alreadySent = false) {
    if (alreadySent) return false;
    if (!MOMENTS.includes(moment)) return false;
    return PURCHASE_MOMENT[policy] === moment;
}

/**
 * May the BROWSER fire Purchase too (thank-you / success page, with the
 * server's event_id so Meta counts the pair once)? Only where the page the
 * buyer is looking at is itself proof: the order just placed (on_order) or
 * the gateway's verified return (on_payment). Under on_confirm the buyer's
 * browser never knows — what it fires at submit is AddPaymentInfo or Lead.
 */
function browserMayFirePurchase(policy) {
    return policy === 'on_order' || policy === 'on_payment';
}

/** What the browser fires at the "I have ordered / I have paid" moment. */
function submitEventFor(policy) {
    return browserMayFirePurchase(policy) ? 'Purchase' : 'AddPaymentInfo';
}

/** One id per order, the same on the server and on the thank-you page. */
function purchaseEventId(orderRef) {
    return `purchase.${String(orderRef)}`;
}
function eventIdFor(eventName, ref) {
    const slug = String(eventName).replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    return `${slug}.${String(ref)}`;
}

// ─── Identity: normalise, then SHA-256 — exactly as Meta does ───────────
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
const isSha256 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

function toAsciiDigits(s) {
    return String(s == null ? '' : s).replace(/[০-৯٠-٩۰-۹]/g, (d) => {
        const c = d.charCodeAt(0);
        const base = c >= 0x09E6 ? 0x09E6 : c >= 0x06F0 ? 0x06F0 : 0x0660;
        return String(c - base);
    });
}

/**
 * Meta wants digits only, country code in front, no leading zeros or plus.
 * `countryCode` is the project's home market ('880' Bangladesh): a local
 * number (leading 0) gets it; a number that already starts with it is left
 * alone. The browser (meta-pixel.js) uses the same rule, so both halves of
 * a deduplicated pair hash to the same value.
 */
function normalizePhone(phone, countryCode = '880') {
    let p = toAsciiDigits(phone).replace(/\D/g, '');
    if (!p) return '';
    if (p.startsWith('00')) p = p.slice(2);
    const cc = String(countryCode || '').replace(/\D/g, '');
    if (!cc) return p;
    if (p.startsWith(cc)) return p;
    if (p.startsWith('0')) return cc + p.replace(/^0+/, '');
    // A bare national number without its trunk zero (1712345678).
    if (p.length <= 10) return cc + p;
    return p;
}
const normalizeEmail = (email) => String(email == null ? '' : email).trim().toLowerCase();

/** Meta matches on first and last name, lowercase: the first word and the
 *  last word of whatever the buyer typed. */
function splitName(name) {
    const parts = String(name == null ? '' : name).trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!parts.length) return [null, null];
    return [parts[0], parts.length > 1 ? parts[parts.length - 1] : null];
}

// fb.<subdomain index>.<ms timestamp>.<random | fbclid>
const FB_COOKIE_RE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_-]{1,500}$/;
const isFbCookie = (v) => typeof v === 'string' && FB_COOKIE_RE.test(v);

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/**
 * What the browser sent about itself (meta-pixel.js attribution()), plus
 * what only the server can see: the address and user agent of the call.
 * Store the result WITH the order / lead / account — it is what ties a
 * Purchase confirmed next Tuesday back to today's ad click.
 *
 * Null when the client sent nothing shaped like attribution (an old bundle,
 * a native app where the pixel does not run): record nothing.
 */
function readAttribution(raw, { ip, userAgent, now = new Date() } = {}) {
    if (!raw || typeof raw !== 'object') return null;
    const out = { at: now.toISOString() };
    if (isFbCookie(str(raw.fbp, 200))) out.fbp = str(raw.fbp, 200);
    if (isFbCookie(str(raw.fbc, 600))) out.fbc = str(raw.fbc, 600);
    if (/^https?:\/\//.test(str(raw.url, 500))) out.url = str(raw.url, 500);
    if (str(userAgent, 400)) out.ua = str(userAgent, 400);
    if (str(ip, 64)) out.ip = str(ip, 64);
    return out;
}

/**
 * The user_data block. The more of it there is, the higher Meta's Event
 * Match Quality and the cheaper the ads. Match keys are hashed here; ip,
 * user agent, fbp and fbc travel raw (Meta's rule, not ours).
 *
 *   person       { email, phone, name, city, country, externalId }
 *                 — raw values; or { emHash, phHash } already hashed by the
 *                 browser relay.
 *   attribution  what readAttribution() stored
 */
function buildUserData(person = {}, attribution = null, { countryCode = '880' } = {}) {
    const a = attribution || {};
    const [fn, ln] = splitName(person.name);
    const email = normalizeEmail(person.email);
    const phone = normalizePhone(person.phone, countryCode);
    const out = {};
    if (email) out.em = [sha256(email)]; else if (isSha256(person.emHash)) out.em = [person.emHash];
    if (phone) out.ph = [sha256(phone)]; else if (isSha256(person.phHash)) out.ph = [person.phHash];
    if (fn) out.fn = [sha256(fn)];
    if (ln) out.ln = [sha256(ln)];
    if (person.city) out.ct = [sha256(String(person.city).toLowerCase().replace(/[^a-z]/g, ''))];
    if (person.country) out.country = [sha256(String(person.country).trim().toLowerCase())];
    if (person.externalId != null && person.externalId !== '') out.external_id = [sha256(String(person.externalId))];
    if (isFbCookie(a.fbp)) out.fbp = a.fbp;
    if (isFbCookie(a.fbc)) out.fbc = a.fbc;
    if (a.ip) out.client_ip_address = a.ip;
    if (a.ua) out.client_user_agent = a.ua;
    // An empty `ct` hash (a city written in Bangla has no a–z letters).
    if (out.ct && out.ct[0] === sha256('')) delete out.ct;
    return out;
}

/**
 * One Conversions API event.
 *
 * Meta requires a user agent on every `website` event. A buyer with none on
 * file (ordered by phone, registered in a native app, an attribution-less
 * old row) is still a real event — it is filed as `other` so Meta accepts
 * it instead of refusing it for the missing field.
 */
function buildEvent({ name, eventId, time, person, attribution, customData, url, actionSource, countryCode } = {}) {
    const a = attribution || {};
    const userData = buildUserData(person, a, { countryCode });
    const website = !!userData.client_user_agent;
    const source = actionSource || (website ? 'website' : 'other');
    const sourceUrl = url || a.url;
    return {
        event_name: name,
        event_time: Math.floor((time instanceof Date ? time.getTime() : (time || Date.now())) / 1000),
        event_id: eventId,
        action_source: source,
        ...(source === 'website' && sourceUrl ? { event_source_url: sourceUrl } : {}),
        user_data: userData,
        ...(customData && Object.keys(customData).length ? { custom_data: customData } : {}),
    };
}

/**
 * The custom_data for an order: what was bought and — only when `withValue`
 * — what it was worth.
 *
 * Under on_confirm, leave the value OFF everything before the Purchase: a
 * 200-piece order that never confirms would otherwise tell Meta the shop
 * sells ৳40,000 baskets, and it would go looking for people who "spend"
 * that. Under on_order / on_payment the funnel events may carry it.
 */
function orderCustomData(order, { withValue = true } = {}) {
    const items = Array.isArray(order.items) ? order.items : [];
    const out = {};
    if (withValue) {
        out.value = Math.round(Number(order.value) * 100) / 100;
        out.currency = String(order.currency || 'BDT').toUpperCase();
    }
    if (order.ref != null) out.order_id = String(order.ref);
    out.content_type = order.contentType || 'product';
    if (order.contentName) out.content_name = String(order.contentName);
    if (items.length) {
        out.content_ids = [...new Set(items.map((i) => String(i.id)))];
        out.contents = items.map((i) => ({
            id: String(i.id),
            quantity: Number(i.quantity) || 1,
            ...(i.price != null ? { item_price: Number(i.price) } : {}),
        }));
        out.num_items = items.reduce((n, i) => n + (Number(i.quantity) || 1), 0);
    }
    return out;
}

/**
 * The Purchase. `order` = { ref, value, currency, items[], contentName,
 * method }. Purchase without a positive value and a currency is refused by
 * Meta for optimisation, so it throws here — in your tests, not in
 * production (callers wrap the whole send in try/catch).
 */
function buildPurchaseEvent({ order, person, attribution, time, countryCode } = {}) {
    const value = Number(order && order.value);
    if (!order || order.ref == null || order.ref === '') throw new Error('Purchase needs order.ref');
    if (!Number.isFinite(value) || value <= 0) throw new Error('Purchase needs a positive order.value');
    const customData = orderCustomData(order, { withValue: true });
    if (order.method) customData.payment_method = String(order.method);
    return buildEvent({
        name: 'Purchase',
        eventId: purchaseEventId(order.ref),
        time, person, attribution, customData, countryCode,
    });
}

/**
 * A browser event forwarded by the relay endpoint (POST /api/meta/event).
 * Returns null when it must not be forwarded: not a standard event, or a
 * Purchase. The server adds the ip and user agent it saw.
 */
function buildRelayedEvent(body, { ip, userAgent, now = new Date() } = {}) {
    if (!body || typeof body !== 'object') return null;
    const name = str(body.event_name, 40);
    const eventId = str(body.event_id, 100);
    if (!relayAllowed(name) || !eventId) return null;
    const attribution = readAttribution(
        { fbp: body.fbp, fbc: body.fbc, url: body.event_source_url },
        { ip, userAgent, now },
    );
    const custom = body.custom_data && typeof body.custom_data === 'object' && !Array.isArray(body.custom_data)
        ? body.custom_data : {};
    return buildEvent({
        name, eventId, time: now,
        person: { emHash: body.em, phHash: body.ph },
        attribution,
        customData: name === 'PageView' ? {} : custom,
        actionSource: 'website',
    });
}

/**
 * POST events to the Conversions API. Never throws; returns
 * { ok, status, error }. `disabled` (no pixel id or no token) is a normal
 * state — the site runs before the owner has pasted the credentials.
 *
 * The token rides in the body, never the query string, so it cannot end up
 * in an access log with the URL.
 */
async function sendEvents(events, cfg = {}) {
    const list = (Array.isArray(events) ? events : [events]).filter(Boolean);
    if (!list.length) return { ok: false, status: 'empty' };
    if (!cfg.pixelId || !cfg.accessToken || cfg.enabled === false) return { ok: false, status: 'disabled' };

    const base = String(cfg.baseUrl || 'https://graph.facebook.com').replace(/\/+$/, '');
    const version = String(cfg.version || DEFAULT_GRAPH_VERSION).replace(/^\/+|\/+$/g, '');
    const payload = { data: list, access_token: cfg.accessToken };
    if (cfg.testEventCode) payload.test_event_code = cfg.testEventCode;

    const doFetch = cfg.fetch || globalThis.fetch;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), cfg.timeoutMs || 8000) : null;
    try {
        const res = await doFetch(`${base}/${version}/${encodeURIComponent(cfg.pixelId)}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(payload),
            ...(ctrl ? { signal: ctrl.signal } : {}),
        });
        if (res.ok) return { ok: true, status: 'sent' };
        let error = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j && j.error && j.error.message) error = j.error.message; } catch { /* not json */ }
        return { ok: false, status: 'rejected', error };
    } catch (e) {
        return { ok: false, status: 'unreachable', error: String((e && e.message) || e) };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

module.exports = {
    DEFAULT_GRAPH_VERSION, STANDARD_EVENTS, relayAllowed,
    POLICIES, MOMENTS, PURCHASE_MOMENT, policyFor, purchaseDue, browserMayFirePurchase, submitEventFor,
    purchaseEventId, eventIdFor,
    sha256, isSha256, toAsciiDigits, normalizePhone, normalizeEmail, splitName,
    isFbCookie, readAttribution, buildUserData,
    buildEvent, orderCustomData, buildPurchaseEvent, buildRelayedEvent,
    sendEvents,
};
