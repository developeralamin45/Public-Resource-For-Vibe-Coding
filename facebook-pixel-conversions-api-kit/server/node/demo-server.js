/**
 * demo-server.js — the whole kit running on your laptop, talking to a FAKE
 * Meta. Nothing leaves the machine.
 *
 *   node server/node/demo-server.js      →  http://localhost:4747
 *
 * It is also the reference binding of meta-capi.js to a store: read
 * placeOrder() and reach() and you have the three call sites every real
 * project needs (see CONTRACT.md).
 *
 * The demo shop takes three payment methods, one per purchase policy:
 *
 *   cod         on_order    Purchase the moment the order is placed
 *   card        on_payment  Purchase when the gateway callback is verified
 *   send_money  on_confirm  Purchase when a human (or the SMS matcher) confirms
 *
 * Zero dependencies. Node 18+.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const M = require('./meta-capi.js');

const PORT = Number(process.env.PORT) || 4747;

const PURCHASE_POLICY = { default: 'on_confirm', methods: { cod: 'on_order', card: 'on_payment', send_money: 'on_confirm' } };

// A real project reads these from .env / its settings table. Here the
// "Graph API" is this same process, so the demo can show what Meta received.
const META = {
    pixelId: 'DEMO_PIXEL_ID',
    accessToken: 'demo-token',
    version: M.DEFAULT_GRAPH_VERSION,
    baseUrl: `http://127.0.0.1:${PORT}/mock-graph`,
};

const orders = new Map();      // ref → order row
const metaReceived = [];       // what the fake Graph API was sent
let seq = 1000;

// ─── Call site 1: the order is placed ───────────────────────────────────
async function placeOrder(body, req) {
    const method = String(body.method || 'cod');
    const order = {
        ref: `D-${++seq}`,
        method,
        policy: M.policyFor(PURCHASE_POLICY, method),
        value: 1900,
        currency: 'BDT',
        items: [{ id: 'sku-7', quantity: 2, price: 950 }],
        person: { name: body.name, phone: body.phone },
        // Kept with the row: under on_confirm this is the only link back
        // to the ad click by the time the Purchase is real.
        attribution: M.readAttribution(body.attribution, { ip: req.socket.remoteAddress, userAgent: req.headers['user-agent'] }),
        status: 'placed',
        purchaseSentAt: null,
    };
    orders.set(order.ref, order);
    await reach(order, 'order_placed');
    return order;
}

// ─── Call sites 2 and 3: every later moment goes through here too ───────
// `payment_verified` from the gateway's server-to-server callback,
// `confirmed` from the admin button / CRM sync / SMS matcher.
async function reach(order, moment) {
    if (moment === 'payment_verified') order.status = 'paid';
    if (moment === 'confirmed') order.status = 'confirmed';
    if (!M.purchaseDue(order.policy, moment, !!order.purchaseSentAt)) return;
    try {
        const event = M.buildPurchaseEvent({ order, person: order.person, attribution: order.attribution });
        const sent = await M.sendEvents([event], META);
        // Stamped only on success: a Meta outage leaves it unsent, and the
        // next moment or a retry job can send it. Never before the send.
        if (sent.ok) order.purchaseSentAt = new Date().toISOString();
        else console.warn('[meta] Purchase not sent', order.ref, sent.status, sent.error || '');
    } catch (e) {
        console.warn('[meta] Purchase crashed', order.ref, e.message);
    }
}

const view = (o) => ({
    ref: o.ref, method: o.method, policy: o.policy, status: o.status, value: o.value, currency: o.currency,
    purchaseSentAt: o.purchaseSentAt,
    // The page gets the id only where the browser may fire too, and only
    // once the sale is real on the server: at once for COD, on the gateway's
    // verified return for a card, never for money sent by hand.
    purchaseEventId: M.browserMayFirePurchase(o.policy) && o.purchaseSentAt ? M.purchaseEventId(o.ref) : null,
    customData: M.orderCustomData({ ...o }, { withValue: M.browserMayFirePurchase(o.policy) }),
});

// ─── HTTP plumbing ──────────────────────────────────────────────────────
const readJson = (req) => new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
});
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const file = (res, p, type) => fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(buf);
});

const BROWSER = path.join(__dirname, '..', '..', 'browser');

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;
    try {
        if (req.method === 'GET' && p === '/') return file(res, path.join(BROWSER, 'demo.html'), 'text/html; charset=utf-8');
        if (req.method === 'GET' && p === '/meta-pixel.js') return file(res, path.join(BROWSER, 'meta-pixel.js'), 'text/javascript');

        // Stands in for connect.facebook.net/fbevents.js: drains the fbq
        // queue into window.__fbqCalls so the demo can show the browser half.
        if (req.method === 'GET' && p === '/fbevents-stub.js') {
            res.writeHead(200, { 'Content-Type': 'text/javascript' });
            return res.end(`(function(){var f=window.fbq;window.__fbqCalls=window.__fbqCalls||[];
                f.callMethod=function(){window.__fbqCalls.push([].slice.call(arguments));
                window.dispatchEvent(new Event('fbq'))};
                var q=f.queue.splice(0);q.forEach(function(a){f.callMethod.apply(f,a)})})();`);
        }

        if (req.method === 'GET' && p === '/api/config') return json(res, 200, { pixelId: META.pixelId, policy: PURCHASE_POLICY });

        // The relay: the browser's funnel events, forwarded with the same
        // event_id. Rate-limit this route in a real project.
        if (req.method === 'POST' && p === '/api/meta/event') {
            const event = M.buildRelayedEvent(await readJson(req), { ip: req.socket.remoteAddress, userAgent: req.headers['user-agent'] });
            if (!event) return json(res, 422, { status: 'refused' });
            const sent = await M.sendEvents([event], META);
            return json(res, 200, { status: sent.status });
        }

        if (req.method === 'POST' && p === '/api/orders') return json(res, 200, view(await placeOrder(await readJson(req), req)));

        const m = p.match(/^\/api\/orders\/([^/]+)\/(gateway-callback|confirm)$/);
        if (req.method === 'POST' && m) {
            const order = orders.get(m[1]);
            if (!order) return json(res, 404, { error: 'no such order' });
            await reach(order, m[2] === 'confirm' ? 'confirmed' : 'payment_verified');
            return json(res, 200, view(order));
        }

        // ── the fake Meta ──
        if (req.method === 'POST' && /^\/mock-graph\/v[\d.]+\/[^/]+\/events$/.test(p)) {
            const body = await readJson(req);
            if (body.access_token !== META.accessToken) return json(res, 400, { error: { message: 'Invalid OAuth access token' } });
            for (const e of body.data || []) metaReceived.push(e);
            return json(res, 200, { events_received: (body.data || []).length });
        }
        if (req.method === 'GET' && p === '/debug/meta') return json(res, 200, metaReceived);
        if (req.method === 'POST' && p === '/debug/reset') { metaReceived.length = 0; orders.clear(); return json(res, 200, {}); }

        res.writeHead(404); res.end('not found');
    } catch (e) {
        json(res, 500, { error: e.message });
    }
});

if (require.main === module) {
    server.listen(PORT, () => console.log(`Pixel kit demo → http://localhost:${PORT}`));
}
module.exports = { server, PORT };
