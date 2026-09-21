<?php
/**
 * Plugin Name: SmartPay Verify (send-money checkout)
 * Description: Receives payments from the SmartPay Auto Verify app, matches them to WooCommerce orders, and answers the send-money popup's "did the money arrive?".
 * Version: 2.0.0
 *
 * Save as wp-content/plugins/smartpay-verify/smartpay-verify.php and activate.
 *
 * Endpoints:
 *   POST /wp-json/smartpay/v1/payment      ← the SmartPay app (Bearer SMARTPAY_SECRET)
 *   POST /wp-json/smartpay/v1/claim        ← the popup's submit (order id in popupKey)
 *   POST /wp-json/smartpay/v1/claim/check  ← the popup's poll
 *
 * The matching, tolerance and reply logic is the SmartPay app's own
 * reference plugin (its developer guide §5), kept line for line; this file
 * adds the pool of unmatched payments and the two claim routes the popup
 * needs. In a WooCommerce shop the ORDER is the claim: the popup runs on
 * the order-pay / thank-you page with popupKey = the order id, and its
 * submit writes the sender number / TrxID onto the order's meta.
 */

if (!defined('ABSPATH')) exit;

// PHP 7.4 shims — str_starts_with / str_ends_with are PHP 8.
if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle) { return $needle === '' || strpos($haystack, $needle) === 0; }
}
if (!function_exists('str_ends_with')) {
    function str_ends_with($haystack, $needle) { return $needle === '' || substr($haystack, -strlen($needle)) === $needle; }
}

// ── Config ─────────────────────────────────────────────────────────────
define('SMARTPAY_SECRET',       'CHANGE-ME-to-a-long-random-token');   // same value in the app: Config → Auth Key
// Amount tolerances — the app sends its own on every request (tolerance_*),
// and those are used. These are the fallback when the fields are absent (§4.5).
define('SMARTPAY_OVER_FLAT',    30);    // ৳ over, at most
define('SMARTPAY_OVER_PERCENT', 0.02);  // or this fraction over, whichever is larger
define('SMARTPAY_UNDER_FLAT',   1);     // ৳ under, at most

// The order meta keys that hold what the customer typed (§3ক). If your
// checkout already saves them under other names, change ONLY these two.
define('SMARTPAY_META_SENDER', '_billing_payment_number'); // bKash / Nagad sender number
define('SMARTPAY_META_TXNID',  '_billing_payment_txnid');  // Rocket / bank TrxID

define('SMARTPAY_POOL_OPTION', 'smartpay_unmatched_pool'); // unmatched payments, waiting for a claim
define('SMARTPAY_POOL_DAYS',   14);

add_action('rest_api_init', function () {
    register_rest_route('smartpay/v1', '/payment', [
        'methods'             => 'POST',
        'callback'            => 'smartpay_handle_payment',
        'permission_callback' => '__return_true', // auth is done by hand below
    ]);
    register_rest_route('smartpay/v1', '/claim', [
        'methods'             => 'POST',
        'callback'            => 'smartpay_handle_claim',
        'permission_callback' => '__return_true', // an anonymous buyer; the order id + a valid reference is the key
    ]);
    register_rest_route('smartpay/v1', '/claim/check', [
        'methods'             => 'POST',
        'callback'            => 'smartpay_handle_claim_check',
        'permission_callback' => '__return_true',
    ]);
});

// ── The app's webhook (§5 of the app's guide, verbatim logic) ──────────
function smartpay_handle_payment(WP_REST_Request $request) {
    // 1. Authentication
    $auth = $request->get_header('authorization');
    if (!is_string($auth) || !hash_equals('Bearer ' . SMARTPAY_SECRET, $auth)) {
        return new WP_REST_Response(['action' => 'rejected', 'note' => 'unauthorized'], 401);
    }
    update_option('smartpay_last_event_at', time(), false);   // the forwarder is alive (the popup reads this)

    $data    = $request->get_json_params();
    if (!empty($data['test']) || !empty($data['isTest']) || (($data['type'] ?? '') === 'test')) {
        return new WP_REST_Response(['status' => 'success', 'message' => 'Test connection successful. Webhook is active!'], 200);
    }
    $txn_id  = sanitize_text_field($data['txn_id']        ?? '');
    $amount  = (float) ($data['amount']                   ?? 0);
    $sender  = preg_replace('/\D/', '', $data['sender']   ?? '');
    $gateway = strtoupper(sanitize_text_field($data['gateway'] ?? ''));
    // bKash merchant payments arrive with the number masked — §3ক.4
    $prefix  = preg_replace('/\D/', '', $data['sender_prefix'] ?? '');
    $suffix  = preg_replace('/\D/', '', $data['sender_suffix'] ?? '');
    // The gateway printed no TxnID and the app made one — the customer never saw it (§3ক.5)
    $synthetic = !empty($data['txn_id_synthetic']);
    $tol = smartpay_tolerance($data);
    // 'reference' is deliberately not read — §3ক.2.

    if ($txn_id === '' || $amount <= 0) {
        return new WP_REST_Response(['action' => 'rejected', 'note' => 'bad payload'], 400);
    }

    // 2. Idempotency: the same txn_id again gets the same result
    $cached = get_transient('smartpay_' . $txn_id);
    if ($cached) {
        return new WP_REST_Response($cached, 200);
    }

    // 3. Find the order (a synthetic id is never looked up)
    $order = smartpay_find_order($sender, $synthetic ? '' : $txn_id, $amount, $prefix, $suffix);

    if (!$order) {
        // Keep it: the buyer may type their number in the popup a moment from
        // now, and the poll will find it here (not_found is not cached).
        smartpay_pool_add([
            'txn_id' => $txn_id, 'synthetic' => $synthetic, 'gateway' => $gateway, 'amount' => $amount,
            'sender' => $sender, 'prefix' => $prefix, 'suffix' => $suffix, 'tolerance' => $tol, 'at' => time(), 'used' => false,
        ]);
        return new WP_REST_Response([
            'matched' => false,
            'site'    => get_bloginfo('name'),
            'action'  => 'not_found',
            'note'    => 'এই নম্বর/TxnID-তে কোনো pending অর্ডার নেই — জমা রাখা হলো, কাস্টমার নম্বর দিলেই মিলবে',
        ], 200);
    }

    // 4. Amount check
    $judged = smartpay_judge_amount((float) $order->get_total(), $amount, $tol);
    $out = smartpay_settle_order($order, $judged['action'], $judged['note'], $txn_id, $amount);

    // Remember for 24 h so a retry never approves twice
    set_transient('smartpay_' . $txn_id, $out, DAY_IN_SECONDS);
    return new WP_REST_Response($out, 200);
}

/** Tolerances from the request, else the constants (§4.5). */
function smartpay_tolerance($data) {
    return [
        'over_flat'    => isset($data['tolerance_over_flat'])    ? (float) $data['tolerance_over_flat']            : SMARTPAY_OVER_FLAT,
        'over_percent' => isset($data['tolerance_over_percent']) ? (float) $data['tolerance_over_percent'] / 100.0 : SMARTPAY_OVER_PERCENT,
        'under_flat'   => isset($data['tolerance_under_flat'])   ? (float) $data['tolerance_under_flat']           : SMARTPAY_UNDER_FLAT,
    ];
}

/** §4.2: ceiling = expected + max(flat, expected × percent); floor = expected − under. */
function smartpay_judge_amount($expected, $amount, $tol) {
    $ceiling = $expected + max($tol['over_flat'], $expected * $tol['over_percent']);
    $floor   = $expected - $tol['under_flat'];
    if ($amount > $ceiling) {
        return ['action' => 'hold_excess', 'note' => sprintf('৳%s বেশি এসেছে — অন্য অর্ডারের টাকা কি না দেখুন', $amount - $expected)];
    }
    if ($amount < $floor) {
        return ['action' => 'hold_short', 'note' => sprintf('৳%s কম এসেছে — দরকার ৳%s, এসেছে ৳%s', $expected - $amount, $expected, $amount)];
    }
    return ['action' => 'approved', 'note' => $amount > $expected
        ? sprintf('৳%s বেশি (খরচ ধরে) — অনুমোদিত', $amount - $expected)
        : 'সঠিক পরিমাণ — অনুমোদিত'];
}

/** Write the outcome onto the order and build the reply the app reads (§3.3). */
function smartpay_settle_order($order, $action, $note, $txn_id, $amount) {
    $order->add_order_note("SmartPay: {$note} | TxnID: {$txn_id}");
    $order->update_meta_data('_smartpay_txn_id', $txn_id);
    $order->update_meta_data('_smartpay_amount', $amount);
    if ($action === 'approved') {
        $order->payment_complete($txn_id);
    } else {
        $order->update_status('on-hold');
    }
    $order->save();
    return [
        'matched'         => true,
        'site'            => get_bloginfo('name'),
        'order_id'        => $order->get_id(),
        'order_number'    => (string) $order->get_order_number(),
        'order_status'    => $order->get_status(),
        'action'          => $action,
        'expected_amount' => (float) $order->get_total(),
        'note'            => $note,
    ];
}

/** TrxIDs are compared without spaces, dashes or case — the customer typed it. */
function smartpay_norm_txn($value) {
    return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $value));
}

/**
 * Order lookup priority (§3ক):
 *   1. the TrxID the customer typed   — Rocket / bank, the surest
 *   2. the number the customer typed   — bKash / Nagad
 *   3. a masked number: prefix AND suffix, exactly one order
 *   4. the billing phone               — fallback, when the field was left empty
 * Several in one tier → closest in amount. Amount is never the key.
 */
function smartpay_find_order($sender, $txn_id, $amount = 0.0, $prefix = '', $suffix = '') {
    $orders = wc_get_orders([
        'limit'   => 30,
        'status'  => ['pending', 'on-hold'],
        'orderby' => 'date',
        'order'   => 'DESC',
    ]);

    $tail       = $sender !== '' ? substr($sender, -10) : '';
    $txn_norm   = smartpay_norm_txn($txn_id);
    $by_txn = $by_number = $by_masked = $by_billing = [];

    foreach ($orders as $o) {
        $typed_txn = smartpay_norm_txn($o->get_meta(SMARTPAY_META_TXNID));
        if ($typed_txn !== '' && $txn_norm !== '' && $typed_txn === $txn_norm) { $by_txn[] = $o; continue; }

        $typed_number = preg_replace('/\D/', '', (string) $o->get_meta(SMARTPAY_META_SENDER));
        if ($tail !== '' && $typed_number !== '' && substr($typed_number, -10) === $tail) { $by_number[] = $o; continue; }

        if ($prefix !== '' && $suffix !== '' && $typed_number !== ''
            && str_starts_with($typed_number, $prefix) && str_ends_with($typed_number, $suffix)) { $by_masked[] = $o; continue; }

        $billing = preg_replace('/\D/', '', (string) $o->get_billing_phone());
        if ($tail !== '' && $billing !== '' && substr($billing, -10) === $tail) $by_billing[] = $o;
    }

    // A masked number fitting several orders: which is real is unknown, and a
    // wrong approval cannot be refunded — hold, approve one by hand.
    if (empty($by_txn) && empty($by_number) && count($by_masked) > 1) return null;

    $candidates = !empty($by_txn) ? $by_txn : (!empty($by_number) ? $by_number : (!empty($by_masked) ? $by_masked : $by_billing));
    if (empty($candidates)) return null;
    if (count($candidates) === 1) return $candidates[0];

    usort($candidates, function ($a, $b) use ($amount) {
        return abs((float) $a->get_total() - $amount) <=> abs((float) $b->get_total() - $amount);
    });
    return $candidates[0];
}

// ── The pool of unmatched payments ─────────────────────────────────────
function smartpay_pool() {
    $pool = get_option(SMARTPAY_POOL_OPTION, []);
    if (!is_array($pool)) $pool = [];
    $cutoff = time() - SMARTPAY_POOL_DAYS * DAY_IN_SECONDS;
    return array_values(array_filter($pool, function ($p) use ($cutoff) { return ($p['at'] ?? 0) >= $cutoff; }));
}
function smartpay_pool_add($payment) {
    $pool = smartpay_pool();
    foreach ($pool as $p) if ($p['txn_id'] === $payment['txn_id']) return;   // already there
    $pool[] = $payment;
    update_option(SMARTPAY_POOL_OPTION, $pool, false);
}
function smartpay_pool_take($txn_id) {
    $pool = smartpay_pool();
    foreach ($pool as &$p) if ($p['txn_id'] === $txn_id) $p['used'] = true;
    unset($p);
    update_option(SMARTPAY_POOL_OPTION, $pool, false);
}

// ── The popup: its claim, and its poll ─────────────────────────────────
/** Normalise the reference the popup sent, per method. '' when invalid. */
function smartpay_norm_reference($method, $raw) {
    if ($method === 'bank') {
        $r = substr(strtoupper(preg_replace('#[^A-Za-z0-9/-]#', '', (string) $raw)), 0, 40);
        return preg_match('#^[A-Z0-9/-]{4,40}$#', $r) ? $r : '';
    }
    if ($method === 'rocket') {
        $r = smartpay_norm_txn($raw);
        return strlen($r) === 10 ? $r : '';
    }
    $d = preg_replace('/\D/', '', (string) $raw);
    if (str_starts_with($d, '00')) $d = substr($d, 2);
    if (str_starts_with($d, '8801')) $d = substr($d, 2);
    elseif (str_starts_with($d, '881')) $d = '0' . substr($d, 2);
    elseif (preg_match('/^1[3-9]/', $d)) $d = '0' . $d;
    $d = substr($d, 0, 11);
    return preg_match('/^01[3-9]\d{8}$/', $d) ? $d : '';
}

/** The popup's submit: write the reference onto the order (popupKey = order id). */
function smartpay_handle_claim(WP_REST_Request $request) {
    $data = $request->get_json_params();
    $method = in_array($data['method'] ?? '', ['bkash', 'nagad', 'rocket', 'bank'], true) ? $data['method'] : '';
    $reference = $method ? smartpay_norm_reference($method, $data['reference'] ?? '') : '';
    $order = wc_get_order((int) ($data['popupKey'] ?? 0));
    if (!$method || $reference === '' || !$order) {
        return new WP_REST_Response(['error' => 'সঠিক তথ্য দিন।'], 400);
    }
    if ($method === 'rocket' || $method === 'bank') $order->update_meta_data(SMARTPAY_META_TXNID, $reference);
    else $order->update_meta_data(SMARTPAY_META_SENDER, $reference);
    $order->update_meta_data('_smartpay_method', $method);
    $order->save();
    return new WP_REST_Response(['ok' => true, 'claimId' => $order->get_id()], 200);
}

/** The popup's poll: already paid (the SMS beat the typing), or waiting in the pool (the typing beat the SMS)? */
function smartpay_handle_claim_check(WP_REST_Request $request) {
    $data = $request->get_json_params();
    $method = in_array($data['method'] ?? '', ['bkash', 'nagad', 'rocket', 'bank'], true) ? $data['method'] : '';
    $reference = $method ? smartpay_norm_reference($method, $data['reference'] ?? '') : '';
    $order = wc_get_order((int) ($data['popupKey'] ?? 0));
    if (!$method || $reference === '' || !$order) {
        return new WP_REST_Response(['error' => 'সঠিক তথ্য দিন।'], 400);
    }

    // Sixty looks an hour per order.
    $key = 'smartpay_checks_' . $order->get_id();
    $count = (int) get_transient($key);
    if ($count >= 60) return new WP_REST_Response(['found' => false, 'throttled' => true], 200);
    set_transient($key, $count + 1, HOUR_IN_SECONDS);

    if ($order->is_paid()) {
        return new WP_REST_Response(['found' => true, 'amount' => (float) $order->get_meta('_smartpay_amount') ?: (float) $order->get_total()], 200);
    }

    $by_txn = ($method === 'rocket' || $method === 'bank');
    foreach (smartpay_pool() as $p) {
        if (!empty($p['used'])) continue;
        $fits = $by_txn
            ? (empty($p['synthetic']) && smartpay_norm_txn($p['txn_id']) === $reference)
            : (($p['sender'] !== '' && substr($p['sender'], -10) === substr($reference, -10))
                || ($p['prefix'] !== '' && $p['suffix'] !== '' && str_starts_with($reference, $p['prefix']) && str_ends_with($reference, $p['suffix'])));
        if (!$fits) continue;
        $judged = smartpay_judge_amount((float) $order->get_total(), (float) $p['amount'], $p['tolerance']);
        $out = smartpay_settle_order($order, $judged['action'], $judged['note'], $p['txn_id'], (float) $p['amount']);
        set_transient('smartpay_' . $p['txn_id'], $out, DAY_IN_SECONDS);
        smartpay_pool_take($p['txn_id']);
        return new WP_REST_Response(['found' => true, 'amount' => (float) $p['amount'], 'gateway' => $p['gateway'], 'underpaid' => $judged['action'] === 'hold_short'], 200);
    }

    // Can we even say "not received"? Not if nobody is relaying payments.
    $last = (int) get_option('smartpay_last_event_at', 0);
    $verifier = $last === 0 ? null : (time() - $last > 12 * HOUR_IN_SECONDS ? 'stale' : null);
    return new WP_REST_Response(['found' => false] + ($verifier ? ['verifier' => $verifier] : []), 200);
}

// ── Classic-checkout fields (skip if your checkout already collects them) ──
add_action('woocommerce_after_order_notes', function ($checkout) {
    woocommerce_form_field('payment_number', [
        'type'        => 'tel',
        'label'       => 'যে বিকাশ/নগদ নম্বর থেকে টাকা পাঠিয়েছেন',
        'placeholder' => '01XXXXXXXXX',
        'required'    => false,
    ], $checkout->get_value('payment_number'));
    woocommerce_form_field('payment_txnid', [
        'type'        => 'text',
        'label'       => 'রকেট/ব্যাংকের ট্রানজেকশন আইডি',
        'placeholder' => 'SMS-এ যেটা এসেছে',
        'required'    => false,
    ], $checkout->get_value('payment_txnid'));
}, 20);

add_action('woocommerce_checkout_create_order', function ($order, $data) {
    if (!empty($_POST['payment_number'])) {
        $order->update_meta_data(SMARTPAY_META_SENDER, preg_replace('/\D/', '', wp_unslash($_POST['payment_number'])));
    }
    if (!empty($_POST['payment_txnid'])) {
        $order->update_meta_data(SMARTPAY_META_TXNID, sanitize_text_field(wp_unslash($_POST['payment_txnid'])));
    }
}, 10, 2);
