<?php

namespace App\Support;

/**
 * The server side of the send-money checkout, as pure functions — a port of
 * server/node/smartpay-rules.js (which carries the tests). Same rules as
 * the browser for phone numbers, same rules as the SmartPay Auto Verify
 * app's guide (§3, §3ক, §4) for matching and amounts.
 *
 * No Eloquent, no HTTP: the controllers bind it to the tables.
 */
final class SmartPayRules
{
    public const METHODS = ['bkash', 'nagad', 'rocket', 'bank'];
    public const DEFAULT_TOLERANCE = ['overFlat' => 30.0, 'overPercent' => 0.02, 'underFlat' => 1.0];
    public const VERIFIER_STALE_SECONDS = 12 * 60 * 60;
    public const CLAIM_CHECKS_PER_HOUR = 60;

    // ── Phone numbers: the SAME rules as the browser ───────────────────
    public static function toAsciiDigits(string $s): string
    {
        return preg_replace_callback('/[০-৯٠-٩۰-۹]/u', function ($m) {
            $c = mb_ord($m[0], 'UTF-8');
            $base = $c >= 0x09E6 ? 0x09E6 : ($c >= 0x06F0 ? 0x06F0 : 0x0660);
            return (string) ($c - $base);
        }, $s);
    }

    public static function normalizeBdPhone(?string $raw): string
    {
        $d = preg_replace('/\D/', '', self::toAsciiDigits((string) $raw));
        if (str_starts_with($d, '00')) $d = substr($d, 2);
        if (str_starts_with($d, '8801')) $d = substr($d, 2);
        elseif (str_starts_with($d, '881')) $d = '0' . substr($d, 2);
        elseif (preg_match('/^1[3-9]/', $d)) $d = '0' . $d;
        return substr($d, 0, 11);
    }

    public static function isValidBdPhone(string $phone): bool
    {
        return (bool) preg_match('/^01[3-9]\d{8}$/', $phone);
    }

    /** The last ten digits — what two spellings of one number always share. */
    public static function phoneTail(?string $phone): string
    {
        $d = preg_replace('/\D/', '', (string) $phone);
        return strlen($d) >= 10 ? substr($d, -10) : '';
    }

    /** TrxIDs are compared without spaces, dashes or case: the customer typed it. */
    public static function normalizeTxn(?string $value): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $value));
    }

    public static function normalizeBankRef(?string $value): string
    {
        return substr(strtoupper(preg_replace('#[^A-Za-z0-9/-]#', '', (string) $value)), 0, 40);
    }

    public static function isTrxMethod(string $method): bool
    {
        return $method === 'rocket' || $method === 'bank';
    }

    // ── 1. The claim from the popup ────────────────────────────────────
    /** @return array{ok: bool, claim?: array, error?: string} */
    public static function parseClaim(array $body): array
    {
        $method = in_array($body['method'] ?? null, self::METHODS, true) ? $body['method'] : null;
        if (!$method) return ['ok' => false, 'error' => 'পেমেন্ট মেথড দিন।'];
        $reference = trim((string) ($body['reference'] ?? ''));
        if ($method === 'bank') {
            $reference = self::normalizeBankRef($reference);
            if (!preg_match('#^[A-Z0-9/-]{4,40}$#', $reference)) return ['ok' => false, 'error' => 'সঠিক ট্রানজেকশন আইডি / রেফারেন্স দিন (৪–৪০ অক্ষর)।'];
        } elseif ($method === 'rocket') {
            $reference = self::normalizeTxn($reference);
            if (strlen($reference) !== 10) return ['ok' => false, 'error' => 'সঠিক ১০ সংখ্যার ট্রানজেকশন আইডি লিখুন।'];
        } else {
            $reference = self::normalizeBdPhone($reference);
            if (!self::isValidBdPhone($reference)) return ['ok' => false, 'error' => 'যে নম্বর থেকে টাকা পাঠিয়েছেন সেটি দিন।'];
        }
        $amount = (float) ($body['amount'] ?? 0);
        $lead = is_array($body['lead'] ?? null) ? $body['lead'] : [];
        $phone = self::normalizeBdPhone($lead['phone'] ?? '');
        return ['ok' => true, 'claim' => [
            'method' => $method,
            'reference' => $reference,
            'amount' => $amount > 0 ? round($amount, 2) : 0.0,
            'lead_name' => mb_substr(trim((string) ($lead['name'] ?? '')), 0, 120),
            'lead_phone' => self::isValidBdPhone($phone) ? $phone : '',
            'popup_key' => substr((string) ($body['popupKey'] ?? 'default'), 0, 80),
        ]];
    }

    // ── 2. The payment from the SmartPay app ───────────────────────────
    /** @return array{ok: bool, test?: bool, payment?: array, status?: int, error?: string} */
    public static function parseWebhook(array $b): array
    {
        if (!empty($b['test']) || !empty($b['isTest']) || ($b['type'] ?? null) === 'test'
            || (empty($b['amount']) && empty($b['txn_id']) && empty($b['gateway']))) {
            return ['ok' => true, 'test' => true];
        }
        $amount = (float) ($b['amount'] ?? 0);
        $txnId = trim((string) ($b['txn_id'] ?? ''));
        $gateway = strtoupper((string) ($b['gateway'] ?? ''));
        if ($amount <= 0 || $txnId === '' || $gateway === '') {
            return ['ok' => false, 'status' => 400, 'error' => 'Missing required fields (amount, txn_id, gateway)'];
        }
        $digits = fn ($v) => preg_replace('/\D/', '', (string) ($v ?? ''));
        $sender = self::normalizeBdPhone($b['sender'] ?? '');
        $method = match ($gateway) { 'BKASH' => 'bkash', 'NAGAD' => 'nagad', 'ROCKET' => 'rocket', default => 'bank' };
        return ['ok' => true, 'payment' => [
            'amount' => round($amount, 2),
            'txn_id' => $txnId,
            'txn_synthetic' => !empty($b['txn_id_synthetic']),
            'gateway' => $gateway,
            'method' => $method,
            'sender' => self::isValidBdPhone($sender) ? $sender : '',
            'sender_masked' => (string) ($b['sender_masked'] ?? ''),
            'sender_prefix' => $digits($b['sender_prefix'] ?? ''),
            'sender_suffix' => $digits($b['sender_suffix'] ?? ''),
            'reference' => (string) ($b['reference'] ?? ''),   // never used for matching — guide §3ক.2
            'timestamp' => (int) ($b['timestamp'] ?? time()) ?: time(),
            'tolerance' => [
                'overFlat' => isset($b['tolerance_over_flat']) ? (float) $b['tolerance_over_flat'] : self::DEFAULT_TOLERANCE['overFlat'],
                'overPercent' => isset($b['tolerance_over_percent']) ? (float) $b['tolerance_over_percent'] / 100.0 : self::DEFAULT_TOLERANCE['overPercent'],
                'underFlat' => isset($b['tolerance_under_flat']) ? (float) $b['tolerance_under_flat'] : self::DEFAULT_TOLERANCE['underFlat'],
            ],
        ]];
    }

    /** `Authorization: Bearer <secret>`, compared in constant time. */
    public static function authorized(?string $authorizationHeader, string $secret): bool
    {
        $given = trim(preg_replace('/^Bearer\s+/i', '', (string) $authorizationHeader));
        return $secret !== '' && $given !== '' && hash_equals($secret, $given);
    }

    // ── 3. Which claim is this payment for? ────────────────────────────
    /**
     * The order of trust (guide §3ক, §5): the typed TrxID; the typed sender
     * number by its last ten digits; a masked bKash merchant number where
     * prefix AND suffix match and exactly ONE claim fits; the buyer's own
     * phone from the order form. Several in one tier → closest amount.
     * Amount is never the key. A synthetic TxnID is never looked up.
     *
     * @param array $payment  from parseWebhook
     * @param iterable $claims  open claims: objects/arrays with id, status, method, reference, amount, lead_phone
     */
    public static function findClaimForPayment(array $payment, iterable $claims): mixed
    {
        $txn = $payment['txn_synthetic'] ? '' : self::normalizeTxn($payment['txn_id']);
        $tail = self::phoneTail($payment['sender']);
        $prefix = $payment['sender_prefix'];
        $suffix = $payment['sender_suffix'];
        $byTxn = $byNumber = $byMasked = $byOwn = [];
        $get = fn ($c, $k) => is_array($c) ? ($c[$k] ?? null) : ($c->$k ?? null);

        foreach ($claims as $c) {
            if ($get($c, 'status') !== 'pending') continue;
            if (self::isTrxMethod((string) $get($c, 'method'))) {
                if ($txn !== '' && self::normalizeTxn((string) $get($c, 'reference')) === $txn) $byTxn[] = $c;
                continue;
            }
            $typed = preg_replace('/\D/', '', (string) $get($c, 'reference'));
            if ($tail !== '' && $typed !== '' && self::phoneTail($typed) === $tail) { $byNumber[] = $c; continue; }
            if ($prefix !== '' && $suffix !== '' && $typed !== '' && str_starts_with($typed, $prefix) && str_ends_with($typed, $suffix)) { $byMasked[] = $c; continue; }
            $own = self::phoneTail((string) $get($c, 'lead_phone'));
            if ($tail !== '' && $own !== '' && $own === $tail) $byOwn[] = $c;
        }

        // A masked number matching more than one claim is not a match: a
        // wrong approval cannot be refunded, one right approval by hand can.
        if (!$byTxn && !$byNumber && count($byMasked) > 1) return null;

        $tier = $byTxn ?: ($byNumber ?: ($byMasked ?: $byOwn));
        if (!$tier) return null;
        if (count($tier) === 1) return $tier[0];
        usort($tier, fn ($a, $b) => abs((float) $get($a, 'amount') - $payment['amount']) <=> abs((float) $get($b, 'amount') - $payment['amount']));
        return $tier[0];
    }

    // ── 4. Is the amount right? (guide §4.2) ───────────────────────────
    /** @return array{action: string, note: string} */
    public static function judgeAmount(float $expected, float $received, ?array $tolerance = null): array
    {
        $t = array_merge(self::DEFAULT_TOLERANCE, $tolerance ?? []);
        if ($expected <= 0) return ['action' => 'approved', 'note' => 'পরিমাণ যাচাই করা হয়নি (প্রত্যাশিত পরিমাণ অজানা)'];
        $ceiling = $expected + max($t['overFlat'], $expected * $t['overPercent']);
        $floor = $expected - $t['underFlat'];
        $fmt = fn (float $n) => rtrim(rtrim(number_format($n, 2, '.', ''), '0'), '.');
        if ($received > $ceiling) return ['action' => 'hold_excess', 'note' => '৳' . $fmt($received - $expected) . ' বেশি এসেছে — অন্য অর্ডারের টাকা কি না দেখুন'];
        if ($received < $floor) return ['action' => 'hold_short', 'note' => '৳' . $fmt($expected - $received) . ' কম এসেছে — দরকার ৳' . $fmt($expected) . ', এসেছে ৳' . $fmt($received)];
        return ['action' => 'approved', 'note' => $received > $expected ? '৳' . $fmt($received - $expected) . ' বেশি (খরচ ধরে) — অনুমোদিত' : 'সঠিক পরিমাণ — অনুমোদিত'];
    }

    /** The JSON the app reads (guide §3.3). Always HTTP 200. */
    public static function webhookReply(string $site, mixed $claim, string $action = 'not_found', string $note = '', ?float $expected = null): array
    {
        if (!$claim) {
            return ['matched' => false, 'site' => $site, 'action' => 'not_found', 'note' => $note ?: 'এই নম্বর/TxnID-তে কোনো pending ক্লেইম নেই — জমা রাখা হলো, কাস্টমার নম্বর দিলেই মিলবে'];
        }
        $get = fn ($k) => is_array($claim) ? ($claim[$k] ?? null) : ($claim->$k ?? null);
        return [
            'matched' => true,
            'site' => $site,
            'order_id' => $get('id'),
            'order_number' => (string) ($get('order_number') ?: $get('id')),
            'order_status' => $action === 'approved' ? 'approved' : 'on-hold',
            'action' => $action,
            'expected_amount' => (float) ($expected ?? $get('amount') ?? 0),
            'note' => $note,
        ];
    }

    // ── 5. "Did the money arrive?" ─────────────────────────────────────
    /** 'off' | 'stale' | null — when not null the popup says "being checked", never "not paid". */
    public static function verifierState(bool $enabled, ?\DateTimeInterface $lastEventAt, ?int $now = null): ?string
    {
        if (!$enabled) return 'off';
        $now ??= time();
        if ($lastEventAt && $now - $lastEventAt->getTimestamp() > self::VERIFIER_STALE_SECONDS) return 'stale';
        return null;
    }

    /** Does an unused pooled payment belong to this claim? Same keys as §3. */
    public static function paymentMatchesClaim(array $payment, array $claim): bool
    {
        if (self::isTrxMethod($claim['method'])) {
            return !$payment['txn_synthetic'] && self::normalizeTxn($payment['txn_id']) === self::normalizeTxn($claim['reference']);
        }
        $typed = preg_replace('/\D/', '', (string) $claim['reference']);
        $tail = self::phoneTail($payment['sender']);
        if ($tail !== '' && self::phoneTail($typed) === $tail) return true;
        return $payment['sender_prefix'] !== '' && $payment['sender_suffix'] !== ''
            && str_starts_with($typed, $payment['sender_prefix']) && str_ends_with($typed, $payment['sender_suffix']);
    }
}
