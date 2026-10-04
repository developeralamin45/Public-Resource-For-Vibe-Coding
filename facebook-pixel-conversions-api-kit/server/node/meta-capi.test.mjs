// Run: node --test server/node/
// The rules the server must never get wrong — each one a way real projects
// have told Meta about sales that did not happen, or lost ones that did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const M = createRequire(import.meta.url)('./meta-capi.js');

const ATTR = { fbp: 'fb.1.1727000000000.1234567890', fbc: 'fb.1.1727000000000.IwAR0abc_DEF-123', url: 'https://shop.test/checkout', ip: '203.0.113.9', ua: 'Mozilla/5.0' };
const ORDER = { ref: 'A-1001', value: 1900, currency: 'BDT', method: 'cod', items: [{ id: 7, quantity: 2, price: 950 }] };

test('policy: each one has exactly one purchase moment', () => {
    for (const policy of M.POLICIES) {
        const due = M.MOMENTS.filter((m) => M.purchaseDue(policy, m));
        assert.equal(due.length, 1, policy);
    }
    assert.ok(M.purchaseDue('on_order', 'order_placed'));
    assert.ok(M.purchaseDue('on_payment', 'payment_verified'));
    assert.ok(M.purchaseDue('on_confirm', 'confirmed'));
});

test('policy: COD fires at once, a claimed payment does not', () => {
    assert.ok(M.purchaseDue('on_order', 'order_placed'));
    assert.ok(!M.purchaseDue('on_confirm', 'order_placed'));
    assert.ok(!M.purchaseDue('on_payment', 'order_placed'));
});

test('policy: the same money is never reported twice', () => {
    assert.ok(!M.purchaseDue('on_confirm', 'confirmed', true));
    assert.ok(!M.purchaseDue('on_payment', 'payment_verified', true));
});

test('policy: a COD order confirmed later does not fire a second Purchase', () => {
    assert.ok(!M.purchaseDue('on_order', 'confirmed'));
    assert.ok(!M.purchaseDue('on_order', 'payment_verified'));
});

test('policy: an unknown moment or policy is never a sale', () => {
    assert.ok(!M.purchaseDue('on_order', 'shipped'));
    assert.ok(!M.purchaseDue('whenever', 'order_placed'));
});

test('policyFor: per-method map, with a default', () => {
    const cfg = { default: 'on_confirm', methods: { cod: 'on_order', sslcommerz: 'on_payment' } };
    assert.equal(M.policyFor(cfg, 'cod'), 'on_order');
    assert.equal(M.policyFor(cfg, 'COD'), 'on_order');
    assert.equal(M.policyFor(cfg, 'sslcommerz'), 'on_payment');
    assert.equal(M.policyFor(cfg, 'bkash'), 'on_confirm');
    assert.equal(M.policyFor('on_order', 'anything'), 'on_order');
});

test('policyFor: a typo falls back to the policy that cannot over-report', () => {
    assert.equal(M.policyFor({ default: 'instant' }, 'cod'), 'on_confirm');
    assert.equal(M.policyFor(undefined, undefined), 'on_confirm');
});

test('browser: fires Purchase only where the page itself is proof', () => {
    assert.ok(M.browserMayFirePurchase('on_order'));
    assert.ok(M.browserMayFirePurchase('on_payment'));
    assert.ok(!M.browserMayFirePurchase('on_confirm'));
    assert.equal(M.submitEventFor('on_confirm'), 'AddPaymentInfo');
    assert.equal(M.submitEventFor('on_order'), 'Purchase');
});

test('relay: every standard event except Purchase', () => {
    assert.ok(M.relayAllowed('AddToCart'));
    assert.ok(M.relayAllowed('PageView'));
    assert.ok(!M.relayAllowed('Purchase'));
    assert.ok(!M.relayAllowed('MadeUpEvent'));
    assert.equal(M.buildRelayedEvent({ event_name: 'Purchase', event_id: 'x', custom_data: { value: 9999 } }, { userAgent: 'UA' }), null);
    assert.equal(M.buildRelayedEvent({ event_name: 'AddToCart' }, {}), null);
});

test('relay: the server adds what only it can see; hashes pass only if they are hashes', () => {
    const e = M.buildRelayedEvent({
        event_name: 'AddToCart', event_id: 'ev-1', event_source_url: 'https://shop.test/p/7',
        fbp: ATTR.fbp, fbc: 'not-a-cookie', ph: M.sha256('8801712345678'), em: 'plain@mail.test',
        custom_data: { content_ids: ['7'] },
    }, { ip: '203.0.113.9', userAgent: 'Mozilla/5.0', now: new Date(1727000000000) });
    assert.equal(e.event_name, 'AddToCart');
    assert.equal(e.event_id, 'ev-1');
    assert.equal(e.action_source, 'website');
    assert.equal(e.event_time, 1727000000);
    assert.equal(e.user_data.client_ip_address, '203.0.113.9');
    assert.equal(e.user_data.fbp, ATTR.fbp);
    assert.equal(e.user_data.fbc, undefined);
    assert.deepEqual(e.user_data.ph, [M.sha256('8801712345678')]);
    assert.equal(e.user_data.em, undefined);
    assert.deepEqual(e.custom_data, { content_ids: ['7'] });
});

test('phone: every spelling of one number hashes the same', () => {
    for (const p of ['01712345678', '+880 1712-345678', '8801712345678', '008801712345678', '1712345678', '০১৭১২৩৪৫৬৭৮']) {
        assert.equal(M.normalizePhone(p), '8801712345678', p);
    }
    assert.equal(M.normalizePhone('09876543210', '91'), '919876543210');
    assert.equal(M.normalizePhone(''), '');
});

test('user_data: identity is hashed, browser ids travel raw', () => {
    const u = M.buildUserData({ email: ' Rahim@Mail.Test ', phone: '01712345678', name: 'Rahim Uddin', externalId: 42, country: 'BD' }, ATTR);
    assert.deepEqual(u.em, [M.sha256('rahim@mail.test')]);
    assert.deepEqual(u.ph, [M.sha256('8801712345678')]);
    assert.deepEqual(u.fn, [M.sha256('rahim')]);
    assert.deepEqual(u.ln, [M.sha256('uddin')]);
    assert.deepEqual(u.country, [M.sha256('bd')]);
    assert.deepEqual(u.external_id, [M.sha256('42')]);
    assert.equal(u.fbp, ATTR.fbp);
    assert.equal(u.fbc, ATTR.fbc);
    assert.equal(u.client_user_agent, 'Mozilla/5.0');
    assert.ok(!JSON.stringify(u).includes('rahim@'));
});

test('user_data: a city with no latin letters is left out, not hashed empty', () => {
    assert.equal(M.buildUserData({ city: 'ঢাকা' }).ct, undefined);
    assert.deepEqual(M.buildUserData({ city: 'Dhaka ' }).ct, [M.sha256('dhaka')]);
});

test('attribution: only cookies the pixel could have written are kept', () => {
    const a = M.readAttribution({ fbp: ATTR.fbp, fbc: '<script>', url: 'javascript:alert(1)' }, { ip: '203.0.113.9', userAgent: 'UA', now: new Date(0) });
    assert.deepEqual(a, { at: '1970-01-01T00:00:00.000Z', fbp: ATTR.fbp, ua: 'UA', ip: '203.0.113.9' });
    assert.equal(M.readAttribution(null, { ip: '1.1.1.1' }), null);
});

test('purchase: value, currency, one id per order', () => {
    const e = M.buildPurchaseEvent({ order: ORDER, person: { phone: '01712345678' }, attribution: ATTR, time: 1727000000000 });
    assert.equal(e.event_name, 'Purchase');
    assert.equal(e.event_id, 'purchase.A-1001');
    assert.equal(e.action_source, 'website');
    assert.equal(e.event_source_url, ATTR.url);
    assert.equal(e.custom_data.value, 1900);
    assert.equal(e.custom_data.currency, 'BDT');
    assert.equal(e.custom_data.order_id, 'A-1001');
    assert.deepEqual(e.custom_data.content_ids, ['7']);
    assert.deepEqual(e.custom_data.contents, [{ id: '7', quantity: 2, item_price: 950 }]);
    assert.equal(e.custom_data.num_items, 2);
    assert.equal(e.custom_data.payment_method, 'cod');
});

test('purchase: no browser on file → still sent, filed as "other"', () => {
    const e = M.buildPurchaseEvent({ order: ORDER, person: { phone: '01712345678' }, attribution: null });
    assert.equal(e.action_source, 'other');
    assert.equal(e.event_source_url, undefined);
    assert.equal(e.user_data.client_user_agent, undefined);
});

test('purchase: without a value or an order it is a bug, not an event', () => {
    assert.throws(() => M.buildPurchaseEvent({ order: { ...ORDER, value: 0 } }));
    assert.throws(() => M.buildPurchaseEvent({ order: { ...ORDER, ref: '' } }));
});

test('funnel events can leave the value off (on_confirm)', () => {
    const c = M.orderCustomData(ORDER, { withValue: false });
    assert.equal(c.value, undefined);
    assert.equal(c.currency, undefined);
    assert.equal(c.num_items, 2);
});

test('event ids: stable per order, readable', () => {
    assert.equal(M.purchaseEventId('A-1001'), 'purchase.A-1001');
    assert.equal(M.eventIdFor('AddPaymentInfo', 'A-1001'), 'add_payment_info.A-1001');
    assert.equal(M.eventIdFor('Lead', 9), 'lead.9');
});

test('send: token in the body, never the URL; test code only when set', async () => {
    let seen;
    const fetch = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({}) }; };
    const r = await M.sendEvents([{ event_name: 'Lead' }], { pixelId: '111', accessToken: 'SECRET', version: 'v23.0', fetch });
    assert.deepEqual(r, { ok: true, status: 'sent' });
    assert.equal(seen.url, 'https://graph.facebook.com/v23.0/111/events');
    assert.ok(!seen.url.includes('SECRET'));
    assert.equal(seen.body.access_token, 'SECRET');
    assert.equal(seen.body.test_event_code, undefined);
    await M.sendEvents([{ event_name: 'Lead' }], { pixelId: '111', accessToken: 'SECRET', testEventCode: 'TEST123', fetch });
    assert.equal(seen.body.test_event_code, 'TEST123');
});

test('send: never throws — not configured, rejected, unreachable', async () => {
    assert.equal((await M.sendEvents([{}], {})).status, 'disabled');
    assert.equal((await M.sendEvents([{}], { pixelId: '1', accessToken: 't', enabled: false })).status, 'disabled');
    assert.equal((await M.sendEvents([], { pixelId: '1', accessToken: 't' })).status, 'empty');
    const rejected = await M.sendEvents([{}], { pixelId: '1', accessToken: 't', fetch: async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid parameter' } }) }) });
    assert.deepEqual(rejected, { ok: false, status: 'rejected', error: 'Invalid parameter' });
    const down = await M.sendEvents([{}], { pixelId: '1', accessToken: 't', fetch: async () => { throw new Error('ECONNRESET'); } });
    assert.equal(down.status, 'unreachable');
});
