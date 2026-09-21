#!/usr/bin/env node
/**
 * demo-server.js — the whole contract, runnable, no npm install.
 *
 *   node server/node/demo-server.js          → http://localhost:8787
 *
 * Serves vanilla/demo.html with the kit's files, and implements the four
 * endpoints of CONTRACT.md on an in-memory store:
 *
 *   POST /api/lead                  the order form, while they type
 *   POST /api/payment-claim         the popup's submit
 *   POST /api/payment-claim/check   the popup's poll ("did the money arrive?")
 *   POST /api/smartpay/payment      the SmartPay Auto Verify app's webhook
 *
 * Play the app yourself with curl (the secret is `demo-secret`):
 *
 *   curl -X POST http://localhost:8787/api/smartpay/payment \
 *     -H 'Content-Type: application/json' -H 'Authorization: Bearer demo-secret' \
 *     -H 'Idempotency-Key: DIF8IFIRKK' \
 *     -d '{"amount":2950,"txn_id":"DIF8IFIRKK","sender":"01712345678","gateway":"BKASH","reference":"","timestamp":1789448820,"tolerance_over_flat":30,"tolerance_over_percent":2,"tolerance_under_flat":1}'
 *
 * Type 01712345678 in the popup before or after — either order works, and
 * that is the point: the claim and the payment meet whichever comes first.
 *
 * This is a demo, not a deployment: the store is a JS object, the secret is
 * in the source. The Laravel folder is the shape of the real thing.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const R = require('./smartpay-rules.js');

const PORT = Number(process.env.PORT) || 8787;
const KIT = path.resolve(__dirname, '..', '..');
const SITE = 'Send-Money Demo';
const SECRET = process.env.SMARTPAY_SECRET || 'demo-secret';

// ── The store. Replace with your database; CONTRACT.md names each table. ──
const store = {
    settings: { autoVerifyEnabled: true, lastEventAt: null },
    leads: new Map(),      // phone → { name, phone, stage, ... }
    claims: [],            // { id, method, reference, amount, lead, popupKey, status, ... }
    payments: [],          // the pool: { id, txnId, ..., used, claimId }
    replies: new Map(),    // txnId → the reply already given (idempotency)
    checks: new Map(),     // phone → { hour, count }
};
let nextId = 1;

const STAGES = ['typed', 'checkout', 'paid'];

// ── Handlers ──────────────────────────────────────────────────────────
const handlers = {
    // The order form, while they type. Furthest stage wins, never the latest.
    'POST /api/lead': (body) => {
        const phone = R.normalizeBdPhone(body.phone || '');
        if (!R.isValidBdPhone(phone)) return [200, { ok: false }];
        const prev = store.leads.get(phone) || {};
        const incoming = STAGES.includes(body.stage) ? body.stage : 'typed';
        const stage = STAGES.indexOf(prev.stage) > STAGES.indexOf(incoming) ? prev.stage : incoming;
        store.leads.set(phone, { ...prev, name: String(body.name || '').slice(0, 120), phone, stage, method: body.method, amount: body.amount,
            ...(body.reference ? { reference: body.reference } : {}), ...(body.whatsapp ? { whatsappAt: new Date().toISOString() } : {}), updatedAt: new Date().toISOString() });
        console.log(`[lead] ${phone} → ${stage}`);
        return [200, { ok: true }];
    },

    // The popup's submit: a claim, pending until money confirms it.
    'POST /api/payment-claim': (body) => {
        const parsed = R.parseClaim(body);
        if (!parsed.ok) return [400, { error: parsed.error }];
        const c = parsed.claim;
        // One open claim per reference+popupKey: a resubmit edits, it does not duplicate.
        let claim = store.claims.find((x) => x.status === 'pending' && x.popupKey === c.popupKey && x.method === c.method && x.reference === c.reference);
        if (!claim) { claim = { id: nextId++, status: 'pending', createdAt: new Date().toISOString() }; store.claims.push(claim); }
        Object.assign(claim, c, { updatedAt: new Date().toISOString() });
        console.log(`[claim] #${claim.id} ${c.method} ${c.reference} ৳${c.amount}`);
        return [200, { ok: true, claimId: claim.id }];
    },

    // "Did the money arrive?" — the popup asks every 8 s for two minutes.
    'POST /api/payment-claim/check': (body) => {
        const parsed = R.parseClaim(body);
        if (!parsed.ok) return [400, { error: parsed.error }];
        const c = parsed.claim;
        const key = c.lead.phone || (R.isTrxMethod(c.method) ? c.reference : c.reference);
        const counter = R.nextClaimCheckCounter(store.checks.get(key));
        if (!counter) return [200, { found: false, throttled: true }];
        store.checks.set(key, counter);

        // Already matched by the webhook (the SMS beat the typing)?
        const claim = store.claims.find((x) => x.popupKey === c.popupKey && x.method === c.method && x.reference === c.reference);
        if (claim && (claim.status === 'approved' || claim.status === 'verified')) {
            return [200, { found: true, amount: claim.paidAmount, gateway: claim.gateway, underpaid: !!claim.underpaid }];
        }
        // Waiting in the pool (the typing beat the SMS)?
        const answer = R.claimAnswer(c, store.payments);
        if (answer.found) {
            answer.payment.used = true;
            if (claim) { answer.payment.claimId = claim.id; Object.assign(claim, { status: 'approved', paidAmount: answer.amount, gateway: answer.gateway, underpaid: answer.underpaid, verifiedAt: new Date().toISOString() }); }
            console.log(`[check] found ৳${answer.amount} for ${c.reference}`);
            return [200, { found: true, amount: answer.amount, gateway: answer.gateway, underpaid: answer.underpaid }];
        }
        const verifier = R.verifierState({ enabled: store.settings.autoVerifyEnabled, lastEventAt: store.settings.lastEventAt });
        return [200, { found: false, ...(verifier ? { verifier } : {}) }];
    },

    // The SmartPay app: a payment SMS, parsed, seconds after the money landed.
    'POST /api/smartpay/payment': (body, req) => {
        if (!R.authorized(req.headers.authorization, SECRET)) return [401, { error: 'Unauthorized' }];
        store.settings.lastEventAt = new Date().toISOString();   // the forwarder is alive
        const parsed = R.parseWebhook(body);
        if (!parsed.ok) return [parsed.status, { error: parsed.error }];
        if (parsed.test) return [200, { status: 'success', message: 'Test connection successful. Webhook is active!' }];
        const p = parsed.payment;
        // Idempotency: the same TxnID twice gets the same answer, never a second approval.
        const key = String(req.headers['idempotency-key'] || p.txnId);
        if (store.replies.has(key)) return [200, store.replies.get(key)];

        const claim = R.findClaimForPayment(p, store.claims);
        let reply;
        if (claim) {
            const judged = R.judgeAmount(claim.amount, p.amount, p.tolerance);
            Object.assign(claim, { status: judged.action === 'approved' ? 'approved' : 'hold', paidAmount: p.amount, gateway: p.gateway, underpaid: judged.action === 'hold_short', txnId: p.txnId, note: judged.note, verifiedAt: new Date().toISOString() });
            store.payments.push({ id: nextId++, ...p, used: true, claimId: claim.id, receivedAt: new Date().toISOString() });
            reply = R.webhookReply({ site: SITE, claim, action: judged.action, note: judged.note, expected: claim.amount });
            console.log(`[smartpay] ${p.gateway} ৳${p.amount} → claim #${claim.id}: ${judged.action}`);
        } else {
            // Nobody has claimed it yet: keep it, the popup's next poll will find it.
            store.payments.push({ id: nextId++, ...p, used: false, receivedAt: new Date().toISOString() });
            reply = R.webhookReply({ site: SITE, claim: null });
            console.log(`[smartpay] ${p.gateway} ৳${p.amount} from ${p.sender || p.senderMasked || p.txnId} → pooled`);
        }
        if (claim) store.replies.set(key, reply);   // not_found is not cached: a claim may come later
        return [200, reply];
    },

    // A peek, for the demo page and for curiosity.
    'GET /api/demo/state': () => [200, { leads: [...store.leads.values()], claims: store.claims, payments: store.payments }],
};

// ── Static files + JSON plumbing ──────────────────────────────────────
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.md': 'text/markdown; charset=utf-8' };
function serveFile(res, rel) {
    const file = path.join(KIT, rel);
    if (!file.startsWith(KIT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = `${req.method} ${url.pathname}`;
    if (handlers[route]) {
        let raw = '';
        req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
        req.on('end', () => {
            let body = {};
            try { body = raw ? JSON.parse(raw) : {}; } catch { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":"bad json"}'); return; }
            let out;
            try { out = handlers[route](body, req); } catch (err) { console.error(err); out = [500, { error: 'Internal error' }]; }
            res.writeHead(out[0], { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(out[1]));
        });
        return;
    }
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    // The demo page lives in vanilla/ so its relative paths (../checkout.css, bd-phone.js) resolve.
    if (url.pathname === '/' || url.pathname === '/demo') { res.writeHead(302, { Location: '/vanilla/demo.html' }); res.end(); return; }
    serveFile(res, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
});

server.listen(PORT, () => {
    console.log(`Send-money checkout demo → http://localhost:${PORT}`);
    console.log(`SmartPay webhook         → POST http://localhost:${PORT}/api/smartpay/payment  (Bearer ${SECRET})`);
});
