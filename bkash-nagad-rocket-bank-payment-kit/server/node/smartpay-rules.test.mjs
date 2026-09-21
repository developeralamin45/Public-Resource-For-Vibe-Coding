// Run: node --test server/node/
// The rules the server must never get wrong, each one a real failure the
// production system or the SmartPay app's guide has seen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const R = createRequire(import.meta.url)('./smartpay-rules.js');

const claim = (over) => ({ id: 'c1', status: 'pending', method: 'bkash', reference: '01712345678', amount: 2950, lead: { name: 'A', phone: '01712345678' }, ...over });
const payment = (over) => ({ amount: 2950, txnId: 'DIF8IFIRKK', txnSynthetic: false, gateway: 'BKASH', method: 'bkash', sender: '01712345678', senderPrefix: '', senderSuffix: '', tolerance: R.DEFAULT_TOLERANCE, ...over });

test('phone: every spelling folds to 01XXXXXXXXX', () => {
    for (const raw of ['+880 1712-345678', '০১৭১২৩৪৫৬৭৮', '8801712345678', '1712345678', '01712 345 678।'])
        assert.equal(R.normalizeBdPhone(raw), '01712345678', raw);
    assert.equal(R.isValidBdPhone('01212345678'), false);
});

test('parseClaim: canonical reference per method, Bangla errors', () => {
    assert.equal(R.parseClaim({ method: 'bkash', reference: '+8801712345678', amount: 2950 }).claim.reference, '01712345678');
    assert.equal(R.parseClaim({ method: 'rocket', reference: ' abc123 4567 ' }).claim.reference, 'ABC1234567');
    assert.equal(R.parseClaim({ method: 'bank', reference: 'ft26/ab-12' }).claim.reference, 'FT26/AB-12');
    assert.equal(R.parseClaim({ method: 'rocket', reference: '123' }).ok, false);
    assert.equal(R.parseClaim({ method: 'nagad', reference: '0171' }).ok, false);
    assert.equal(R.parseClaim({ method: 'card', reference: 'x' }).ok, false);
});

test('parseWebhook: the app\'s exact payload, and its test ping', () => {
    const p = R.parseWebhook({ amount: 500.0, txn_id: 'DIF8IFIRKK', sender: '01856189587', gateway: 'BKASH', reference: '', timestamp: 1789448820, sender_masked: '', sender_prefix: '', sender_suffix: '', txn_id_synthetic: false, tolerance_over_flat: 30.0, tolerance_over_percent: 2.0, tolerance_under_flat: 1.0 });
    assert.equal(p.ok, true);
    assert.equal(p.payment.method, 'bkash');
    assert.equal(p.payment.sender, '01856189587');
    assert.deepEqual(p.payment.tolerance, { overFlat: 30, overPercent: 0.02, underFlat: 1 });
    assert.deepEqual(R.parseWebhook({ test: true }), { ok: true, test: true });
    assert.equal(R.parseWebhook({ amount: 10 }).ok, false);
});

test('authorized: bearer secret, not a prefix of it', () => {
    assert.equal(R.authorized('Bearer s3cret', 's3cret'), true);
    assert.equal(R.authorized('Bearer s3cre', 's3cret'), false);
    assert.equal(R.authorized('', 's3cret'), false);
    assert.equal(R.authorized('Bearer x', ''), false);
});

test('match: the typed sender number, by its last ten digits', () => {
    assert.equal(R.findClaimForPayment(payment(), [claim()]).id, 'c1');
    assert.equal(R.findClaimForPayment(payment({ sender: '01799999999' }), [claim()]), null);
});

test('match: a Nagad SMS still matches a bKash-tab claim with the same number', () => {
    assert.equal(R.findClaimForPayment(payment({ gateway: 'NAGAD', method: 'nagad' }), [claim()]).id, 'c1');
});

test('match: Rocket and bank by TrxID, case and spaces ignored; never a synthetic id', () => {
    const c = claim({ method: 'rocket', reference: 'ABC1234567' });
    assert.equal(R.findClaimForPayment(payment({ gateway: 'ROCKET', method: 'rocket', sender: '', txnId: 'abc 1234567' }), [c]).id, 'c1');
    assert.equal(R.findClaimForPayment(payment({ gateway: 'ROCKET', method: 'rocket', sender: '', txnId: 'ABC1234567', txnSynthetic: true }), [c]), null);
});

test('match: a masked bKash merchant number needs prefix AND suffix, and exactly one claim', () => {
    const masked = payment({ sender: '', senderMasked: '0171XXXXX678', senderPrefix: '0171', senderSuffix: '678' });
    assert.equal(R.findClaimForPayment(masked, [claim()]).id, 'c1');
    assert.equal(R.findClaimForPayment(masked, [claim({ reference: '01722345678' })]), null, 'prefix differs');
    // Two claims fit the mask: which is real is unknown → no match, hold by hand.
    assert.equal(R.findClaimForPayment(masked, [claim(), claim({ id: 'c2', reference: '01718888678' })]), null);
});

test('match: falls back to the buyer\'s own phone, and breaks ties by amount', () => {
    const c = claim({ reference: '01555555555', lead: { phone: '01712345678' } });
    assert.equal(R.findClaimForPayment(payment(), [c]).id, 'c1');
    const two = [claim({ id: 'a', amount: 2950 }), claim({ id: 'b', amount: 950 })];
    assert.equal(R.findClaimForPayment(payment({ amount: 1000 }), two).id, 'b');
    assert.equal(R.findClaimForPayment(payment(), [claim({ status: 'approved' })]), null, 'only pending claims');
});

test('amount: the app\'s tolerance table (৳1,000 expected, ceiling ৳1,030)', () => {
    const t = R.DEFAULT_TOLERANCE;
    for (const [got, action] of [[1000, 'approved'], [1020, 'approved'], [1030, 'approved'], [1031, 'hold_excess'], [999.5, 'approved'], [950, 'hold_short'], [5000, 'hold_excess']])
        assert.equal(R.judgeAmount(1000, got, t).action, action, String(got));
    // The percentage carries big orders: ৳5,090 on a ৳5,000 order is fine.
    assert.equal(R.judgeAmount(5000, 5090, t).action, 'approved');
    // The app's own settings win over the defaults.
    assert.equal(R.judgeAmount(1000, 1100, { overFlat: 200, overPercent: 0.02, underFlat: 1 }).action, 'approved');
});

test('webhookReply: the shape the app reads', () => {
    const ok = R.webhookReply({ site: 'Demo', claim: claim({ id: 812 }), action: 'approved', note: 'n', expected: 2950 });
    assert.deepEqual(ok, { matched: true, site: 'Demo', order_id: 812, order_number: '812', order_status: 'approved', action: 'approved', expected_amount: 2950, note: 'n' });
    assert.equal(R.webhookReply({ site: 'Demo', claim: null }).action, 'not_found');
});

test('claimAnswer: the pooled payment for a claim, by number, mask or TrxID', () => {
    const pool = [payment({ sender: '01799999999' }), payment({ used: true }), payment({ sender: '', senderPrefix: '0171', senderSuffix: '678', amount: 2900 })];
    const a = R.claimAnswer(claim(), pool);
    assert.equal(a.found, true);
    assert.equal(a.amount, 2900);
    assert.equal(a.underpaid, true);
    assert.equal(R.claimAnswer(claim({ reference: '01500000000' }), pool).found, false);
    assert.equal(R.claimAnswer(claim({ method: 'rocket', reference: 'DIF8IFIRKK' }), [payment({ gateway: 'ROCKET', sender: '' })]).found, true);
});

test('verifierState: off, stale after 12 h, otherwise live', () => {
    const now = Date.parse('2026-09-22T10:00:00Z');
    assert.equal(R.verifierState({ enabled: false, lastEventAt: '2026-09-22T09:00:00Z' }, now), 'off');
    assert.equal(R.verifierState({ enabled: true, lastEventAt: '2026-09-21T09:00:00Z' }, now), 'stale');
    assert.equal(R.verifierState({ enabled: true, lastEventAt: '2026-09-22T09:00:00Z' }, now), null);
    assert.equal(R.verifierState({ enabled: true }, now), null, 'never heard yet is not stale');
});

test('nextClaimCheckCounter: sixty an hour, then null', () => {
    const now = Date.now();
    let c = null;
    for (let i = 0; i < 60; i++) { c = R.nextClaimCheckCounter(c, now); assert.ok(c); }
    assert.equal(R.nextClaimCheckCounter(c, now), null);
    assert.equal(R.nextClaimCheckCounter(c, now + 3600000).count, 1);
});
