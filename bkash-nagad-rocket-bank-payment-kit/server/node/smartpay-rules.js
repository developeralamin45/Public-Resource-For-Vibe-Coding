/**
 * smartpay-rules.js — the server side of the checkout, as pure functions.
 *
 * Two things arrive at your server:
 *
 *   1. From the popup: a CLAIM — "I sent ৳2,950 from 01712345678" (or a
 *      Rocket TrxID / a bank reference), then "did it arrive?" every 8 s.
 *   2. From the SmartPay Auto Verify app on the receiving phone: a PAYMENT —
 *      the parsed bKash/Nagad/Rocket SMS, seconds after the money lands.
 *
 * This module decides how they meet. It touches no database and no HTTP —
 * bind it to yours with the store interface described in CONTRACT.md
 * (express.example.js does it in memory, laravel/ in Eloquent). Every rule
 * here mirrors the SmartPay app's own developer guide (§3, §3ক, §4) and
 * the production checkout this kit is copied from.
 *
 * Zero dependencies. CommonJS and ESM both work (`module.exports`).
 */
'use strict';

// ─── Phone numbers: the SAME rules as the browser (react/bdPhone.ts) ────
function toAsciiDigits(s) {
    return String(s == null ? '' : s).replace(/[০-৯٠-٩۰-۹]/g, (d) => {
        const c = d.charCodeAt(0);
        const base = c >= 0x09E6 ? 0x09E6 : c >= 0x06F0 ? 0x06F0 : 0x0660;
        return String(c - base);
    });
}
function normalizeBdPhone(raw) {
    let d = toAsciiDigits(raw).replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('8801')) d = d.slice(2);
    else if (d.startsWith('881')) d = '0' + d.slice(2);
    else if (/^1[3-9]/.test(d)) d = '0' + d;
    return d.slice(0, 11);
}
function isValidBdPhone(phone) { return /^01[3-9]\d{8}$/.test(phone); }
/** The last ten digits — what two spellings of one number always share. */
function phoneTail(phone) { const d = String(phone || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }
/** TrxIDs are compared without spaces, dashes or case: the customer typed it. */
function normalizeTxn(value) { return String(value == null ? '' : value).replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }
function normalizeBankRef(value) { return String(value == null ? '' : value).replace(/[^A-Za-z0-9/-]/g, '').toUpperCase().slice(0, 40); }

const WALLETS = ['bkash', 'nagad', 'rocket'];
const METHODS = ['bkash', 'nagad', 'rocket', 'bank'];
const isTrxMethod = (m) => m === 'rocket' || m === 'bank';

// ─── 1. The claim from the popup ────────────────────────────────────────
/**
 * Validate what the popup posted. Returns { ok: true, claim } with the
 * reference in canonical form, or { ok: false, error } in Bangla — the same
 * words the popup would have shown, for a client that skipped its checks.
 */
function parseClaim(body) {
    const b = body || {};
    const method = METHODS.includes(String(b.method)) ? String(b.method) : null;
    if (!method) return { ok: false, error: 'পেমেন্ট মেথড দিন।' };
    let reference = String(b.reference || '').trim();
    if (method === 'bank') {
        reference = normalizeBankRef(reference);
        if (!/^[A-Z0-9/-]{4,40}$/.test(reference)) return { ok: false, error: 'সঠিক ট্রানজেকশন আইডি / রেফারেন্স দিন (৪–৪০ অক্ষর)।' };
    } else if (method === 'rocket') {
        reference = normalizeTxn(reference);
        if (reference.length !== 10) return { ok: false, error: 'সঠিক ১০ সংখ্যার ট্রানজেকশন আইডি লিখুন।' };
    } else {
        reference = normalizeBdPhone(reference);
        if (!isValidBdPhone(reference)) return { ok: false, error: 'যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি দিন।' };
    }
    const amount = Number(b.amount);
    const lead = b.lead && typeof b.lead === 'object' ? b.lead : {};
    const phone = normalizeBdPhone(lead.phone || '');
    return {
        ok: true,
        claim: {
            method,
            reference,
            amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0,
            lead: { name: String(lead.name || '').trim().slice(0, 120), phone: isValidBdPhone(phone) ? phone : '' },
            popupKey: String(b.popupKey || 'default').slice(0, 80),
        },
    };
}

// ─── 2. The payment from the SmartPay app ───────────────────────────────
/** Default amount tolerances, used only when the app did not send its own. */
const DEFAULT_TOLERANCE = { overFlat: 30, overPercent: 0.02, underFlat: 1 };

/**
 * Parse the app's webhook body (its developer guide §3.2). Returns
 * { ok: true, payment } or { ok: false, status, error }.
 *
 * `test` payloads (the app's "test connection" button) come back as
 * { ok: true, test: true } — answer them 200 with a friendly message.
 */
function parseWebhook(body) {
    const b = body || {};
    if (b.test || b.isTest || b.type === 'test' || (!b.amount && !b.txn_id && !b.gateway)) return { ok: true, test: true };
    const amount = Number(b.amount);
    const txnId = String(b.txn_id || '').trim();
    const gateway = String(b.gateway || '').toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0 || !txnId || !gateway) {
        return { ok: false, status: 400, error: 'Missing required fields (amount, txn_id, gateway)' };
    }
    const digits = (v) => String(v == null ? '' : v).replace(/\D/g, '');
    const sender = normalizeBdPhone(b.sender || '');
    return {
        ok: true,
        payment: {
            amount: Math.round(amount * 100) / 100,
            txnId,
            txnSynthetic: !!b.txn_id_synthetic,
            gateway,                                   // BKASH | NAGAD | ROCKET | UNKNOWN
            method: gateway === 'BKASH' ? 'bkash' : gateway === 'NAGAD' ? 'nagad' : gateway === 'ROCKET' ? 'rocket' : 'bank',
            sender: isValidBdPhone(sender) ? sender : '',
            senderMasked: String(b.sender_masked || ''),
            senderPrefix: digits(b.sender_prefix),
            senderSuffix: digits(b.sender_suffix),
            reference: String(b.reference || ''),      // never used for matching — guide §3ক.2
            timestamp: Number(b.timestamp) || Math.floor(Date.now() / 1000),
            tolerance: {
                overFlat: b.tolerance_over_flat != null ? Number(b.tolerance_over_flat) : DEFAULT_TOLERANCE.overFlat,
                overPercent: b.tolerance_over_percent != null ? Number(b.tolerance_over_percent) / 100 : DEFAULT_TOLERANCE.overPercent,
                underFlat: b.tolerance_under_flat != null ? Number(b.tolerance_under_flat) : DEFAULT_TOLERANCE.underFlat,
            },
        },
    };
}

/** Constant-time-ish bearer check. The app sends `Authorization: Bearer <secret>`. */
function authorized(authorizationHeader, secret) {
    const given = String(authorizationHeader || '').replace(/^Bearer\s+/i, '').trim();
    if (!secret || !given || given.length !== secret.length) return false;
    let diff = 0;
    for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ secret.charCodeAt(i);
    return diff === 0;
}

// ─── 3. Which claim is this payment for? ────────────────────────────────
/**
 * The order of trust, from the app's guide §3ক and §5:
 *
 *   1. the TrxID the customer typed        (Rocket / bank)
 *   2. the sender number the customer typed (bKash / Nagad) — last 10 digits
 *   3. a masked bKash merchant number: prefix AND suffix must match, and
 *      exactly ONE claim may — with two, hold; money cannot be un-sent
 *   4. the buyer's own phone from the order form (they paid from their own
 *      SIM and typed nothing, or the wrong thing)
 *
 * Several claims in one tier → the one closest in amount. Amount is never
 * the key, only the tie-break (§3ক.3). A synthetic TxnID (the gateway
 * printed none) is never looked up (§3ক.5).
 *
 * `claims` is every open claim you hold (status pending). Returns the claim
 * or null.
 */
function findClaimForPayment(payment, claims) {
    const txn = payment.txnSynthetic ? '' : normalizeTxn(payment.txnId);
    const tail = phoneTail(payment.sender);
    const { senderPrefix: prefix, senderSuffix: suffix } = payment;
    const byTxn = [], byNumber = [], byMasked = [], byOwnPhone = [];

    for (const c of claims) {
        if (!c || c.status !== 'pending') continue;
        if (isTrxMethod(c.method)) {
            if (txn && normalizeTxn(c.reference) === txn) byTxn.push(c);
            continue;
        }
        const typed = String(c.reference || '').replace(/\D/g, '');
        if (tail && typed && phoneTail(typed) === tail) { byNumber.push(c); continue; }
        if (prefix && suffix && typed && typed.startsWith(prefix) && typed.endsWith(suffix)) { byMasked.push(c); continue; }
        const own = phoneTail(c.lead && c.lead.phone);
        if (tail && own && own === tail) byOwnPhone.push(c);
    }

    // A masked number matching more than one claim is not a match: which one
    // is real is unknown, a wrong approval cannot be refunded, and one right
    // approval by hand can.
    if (!byTxn.length && !byNumber.length && byMasked.length > 1) return null;

    const tier = byTxn.length ? byTxn : byNumber.length ? byNumber : byMasked.length ? byMasked : byOwnPhone;
    if (!tier.length) return null;
    if (tier.length === 1) return tier[0];
    return tier.slice().sort((a, b) => Math.abs(Number(a.amount) - payment.amount) - Math.abs(Number(b.amount) - payment.amount))[0];
}

// ─── 4. Is the amount right? ────────────────────────────────────────────
/**
 * The app's rule (§4.2), with its own tolerances when it sent them:
 *
 *   ceiling = expected + max(overFlat, expected × overPercent)
 *   floor   = expected − underFlat
 *   above the ceiling → hold_excess; below the floor → hold_short; else approved
 *
 * Under is never silently accepted (§4.3) and over is held too (§4.4): a
 * much bigger amount is usually someone else's payment.
 */
function judgeAmount(expected, received, tolerance) {
    const t = { ...DEFAULT_TOLERANCE, ...(tolerance || {}) };
    const exp = Number(expected) || 0;
    const got = Number(received) || 0;
    if (exp <= 0) return { action: 'approved', note: 'পরিমাণ যাচাই করা হয়নি (প্রত্যাশিত পরিমাণ অজানা)' };
    const ceiling = exp + Math.max(t.overFlat, exp * t.overPercent);
    const floor = exp - t.underFlat;
    const fmt = (n) => (Math.round(n * 100) / 100).toString();
    if (got > ceiling) return { action: 'hold_excess', note: `৳${fmt(got - exp)} বেশি এসেছে — অন্য অর্ডারের টাকা কি না দেখুন` };
    if (got < floor) return { action: 'hold_short', note: `৳${fmt(exp - got)} কম এসেছে — দরকার ৳${fmt(exp)}, এসেছে ৳${fmt(got)}` };
    return { action: 'approved', note: got > exp ? `৳${fmt(got - exp)} বেশি (খরচ ধরে) — অনুমোদিত` : 'সঠিক পরিমাণ — অনুমোদিত' };
}

/**
 * The JSON the app reads (§3.3). `action` decides the colour on the
 * app's payment screen; `order_number` and `note` are what the person
 * holding the phone sees. Send it with HTTP 200 whether matched or not.
 */
function webhookReply({ site, claim, action, note, expected }) {
    if (!claim) {
        return { matched: false, site: site || '', action: 'not_found', note: note || 'এই নম্বর/TxnID-তে কোনো pending ক্লেইম নেই — জমা রাখা হলো, কাস্টমার নম্বর দিলেই মিলবে' };
    }
    return {
        matched: true,
        site: site || '',
        order_id: claim.id,
        order_number: String(claim.orderNumber || claim.id),
        order_status: action === 'approved' ? 'approved' : 'on-hold',
        action,
        expected_amount: Number(expected != null ? expected : claim.amount) || 0,
        note: note || '',
    };
}

// ─── 5. "Did the money arrive?" — the popup's poll ─────────────────────
const VERIFIER_STALE_MS = 12 * 60 * 60 * 1000;
const CLAIM_CHECKS_PER_HOUR = 60;

/**
 * Whether the server can say "not received" at all. Off in settings, or no
 * payment relayed for half a day (the phone is off, the app died) → the
 * page must not accuse; it says "being checked". Returns 'off' | 'stale' | null.
 */
function verifierState({ enabled, lastEventAt }, now = Date.now()) {
    if (!enabled) return 'off';
    const t = lastEventAt instanceof Date ? lastEventAt.getTime() : Date.parse(String(lastEventAt || ''));
    if (Number.isFinite(t) && now - t > VERIFIER_STALE_MS) return 'stale';
    return null;
}

/** Does an unused pooled payment belong to this claim? Same keys as §3. */
function paymentMatchesClaim(payment, claim) {
    if (isTrxMethod(claim.method)) {
        return !payment.txnSynthetic && normalizeTxn(payment.txnId) === normalizeTxn(claim.reference);
    }
    const typed = String(claim.reference || '').replace(/\D/g, '');
    const tail = phoneTail(payment.sender);
    if (tail && phoneTail(typed) === tail) return true;
    if (payment.senderPrefix && payment.senderSuffix && typed.startsWith(payment.senderPrefix) && typed.endsWith(payment.senderSuffix)) return true;
    return false;
}

/**
 * The popup's answer, from the pool of payments that matched nothing when
 * they arrived. `payments` = unused pooled payments (any gateway). A masked
 * number that fits more than one pooled payment is still fine here — the
 * claim is the one asking, so the first fit is taken.
 */
function claimAnswer(claim, payments) {
    const fit = (payments || []).find((p) => p && !p.used && paymentMatchesClaim(p, claim));
    if (!fit) return { found: false };
    const judged = judgeAmount(claim.amount, fit.amount, fit.tolerance);
    return { found: true, amount: fit.amount, gateway: fit.gateway || '', underpaid: judged.action === 'hold_short', payment: fit };
}

/** Sliding hourly counter for the poll: { hour, count } → the next value, or null when over. */
function nextClaimCheckCounter(counter, now = Date.now()) {
    const hour = Math.floor(now / 3600000);
    const count = counter && counter.hour === hour ? Number(counter.count) || 0 : 0;
    if (count >= CLAIM_CHECKS_PER_HOUR) return null;
    return { hour, count: count + 1 };
}

module.exports = {
    METHODS, WALLETS, isTrxMethod,
    toAsciiDigits, normalizeBdPhone, isValidBdPhone, phoneTail, normalizeTxn, normalizeBankRef,
    parseClaim, parseWebhook, authorized, DEFAULT_TOLERANCE,
    findClaimForPayment, judgeAmount, webhookReply,
    verifierState, paymentMatchesClaim, claimAnswer, nextClaimCheckCounter,
    VERIFIER_STALE_MS, CLAIM_CHECKS_PER_HOUR,
};
