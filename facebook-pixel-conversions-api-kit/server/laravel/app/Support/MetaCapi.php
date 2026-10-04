<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * The server half of the pixel. The same rules as server/node/meta-capi.js,
 * function for function — read that file's header for the why.
 *
 *   policyFor() / purchaseDue()   when is an order a sale?
 *   readAttribution()             what to keep with the order while the
 *                                 buyer's browser is still there
 *   purchaseEvent() / event()     the Conversions API payload
 *   send()                        the call. NEVER THROWS: a marketing call
 *                                 that can fail an order is not worth having.
 *
 * It knows nothing about your models. An "order" here is a plain array:
 *
 *   ['ref' => 'A-1001', 'value' => 1900.0, 'currency' => 'BDT', 'method' => 'cod',
 *    'items' => [['id' => 7, 'quantity' => 2, 'price' => 950]], 'content_name' => null]
 *
 * and a "person" is ['email' =>, 'phone' =>, 'name' =>, 'city' =>,
 * 'country' =>, 'external_id' =>]. wiring.example.php shows the adapters.
 */
class MetaCapi
{
    public const STANDARD_EVENTS = [
        'PageView', 'ViewContent', 'Search', 'AddToCart', 'AddToWishlist',
        'InitiateCheckout', 'AddPaymentInfo', 'Purchase', 'Lead',
        'CompleteRegistration', 'Contact', 'CustomizeProduct', 'Donate',
        'FindLocation', 'Schedule', 'StartTrial', 'SubmitApplication', 'Subscribe',
    ];

    public const POLICIES = ['on_order', 'on_payment', 'on_confirm'];

    /** The one moment each policy treats as the sale. */
    public const PURCHASE_MOMENT = [
        'on_order' => 'order_placed',
        'on_payment' => 'payment_verified',
        'on_confirm' => 'confirmed',
    ];

    private const FB_COOKIE = '/^fb\.\d\.\d{10,16}\.[A-Za-z0-9_-]{1,500}$/';

    // ─── The purchase policy ────────────────────────────────────────────

    /** The policy for one order, by its payment method (config/meta.php). */
    public static function policyFor(?string $method = null, ?array $config = null): string
    {
        $config ??= (array) config('meta.purchase', []);
        $key = strtolower(trim((string) $method));
        $picked = ($key !== '' ? ($config['methods'][$key] ?? null) : null) ?? ($config['default'] ?? null);

        // A typo falls back to the policy that can only under-report.
        return in_array($picked, self::POLICIES, true) ? $picked : 'on_confirm';
    }

    /**
     * Is this the moment the Purchase goes out? Call it at every moment the
     * project has; it is true at exactly one. `$alreadySent` is the order's
     * own stamp, so a retried webhook or a second confirm sends nothing.
     */
    public static function purchaseDue(string $policy, string $moment, bool $alreadySent = false): bool
    {
        return ! $alreadySent && (self::PURCHASE_MOMENT[$policy] ?? null) === $moment;
    }

    /** May the browser fire Purchase too (thank-you / gateway success page)? */
    public static function browserMayFirePurchase(string $policy): bool
    {
        return $policy === 'on_order' || $policy === 'on_payment';
    }

    /** Every standard event except Purchase may come through the public relay. */
    public static function relayAllowed(string $eventName): bool
    {
        return $eventName !== 'Purchase' && in_array($eventName, self::STANDARD_EVENTS, true);
    }

    /** One id per order — the same on the server and on the thank-you page. */
    public static function purchaseEventId(string|int $orderRef): string
    {
        return 'purchase.'.$orderRef;
    }

    public static function eventIdFor(string $eventName, string|int $ref): string
    {
        return strtolower((string) preg_replace('/([a-z])([A-Z])/', '$1_$2', $eventName)).'.'.$ref;
    }

    // ─── Identity ───────────────────────────────────────────────────────

    /** Digits only, country code in front — the same rule as the browser. */
    public static function normalizePhone(?string $phone, ?string $countryCode = null): string
    {
        $p = strtr((string) $phone, [
            '০' => '0', '১' => '1', '২' => '2', '৩' => '3', '৪' => '4', '৫' => '5', '৬' => '6', '৭' => '7', '৮' => '8', '৯' => '9',
            '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9',
            '۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9',
        ]);
        $p = (string) preg_replace('/\D/', '', $p);
        if ($p === '') {
            return '';
        }
        if (str_starts_with($p, '00')) {
            $p = substr($p, 2);
        }
        $cc = (string) preg_replace('/\D/', '', $countryCode ?? (string) config('meta.phone_country_code', '880'));
        if ($cc === '' || str_starts_with($p, $cc)) {
            return $p;
        }
        if (str_starts_with($p, '0')) {
            return $cc.ltrim($p, '0');
        }

        return strlen($p) <= 10 ? $cc.$p : $p;
    }

    /**
     * What the browser sent about itself (MetaPixel.attribution()) plus what
     * only the server sees. Store the result WITH the order / lead / user —
     * a json column. Null when the client sent nothing (a native app, an old
     * bundle): record nothing.
     *
     * @return array<string, string>|null
     */
    public static function readAttribution(mixed $raw, ?Request $request = null): ?array
    {
        if (! is_array($raw)) {
            return null;
        }
        $out = ['at' => now()->toIso8601String()];
        $fbp = self::str($raw['fbp'] ?? null, 200);
        $fbc = self::str($raw['fbc'] ?? null, 600);
        $url = self::str($raw['url'] ?? null, 500);
        if (preg_match(self::FB_COOKIE, $fbp)) {
            $out['fbp'] = $fbp;
        }
        if (preg_match(self::FB_COOKIE, $fbc)) {
            $out['fbc'] = $fbc;
        }
        if (preg_match('/^https?:\/\//', $url)) {
            $out['url'] = $url;
        }
        if ($request && ($ua = self::str($request->userAgent(), 400)) !== '') {
            $out['ua'] = $ua;
        }
        if ($request && ($ip = self::str($request->ip(), 64)) !== '') {
            $out['ip'] = $ip;
        }

        return $out;
    }

    /**
     * Match keys hashed (SHA-256 of the normalised value); ip, user agent,
     * fbp and fbc raw — Meta's rule. `em_hash` / `ph_hash` are accepted
     * already hashed, from the browser relay.
     *
     * @return array<string, mixed>
     */
    public static function userData(array $person = [], ?array $attribution = null, ?string $countryCode = null): array
    {
        $a = $attribution ?? [];
        $h = fn (string $v): string => hash('sha256', $v);
        $isHash = fn (mixed $v): bool => is_string($v) && preg_match('/^[a-f0-9]{64}$/', $v) === 1;
        $out = [];

        $email = strtolower(trim((string) ($person['email'] ?? '')));
        $phone = self::normalizePhone($person['phone'] ?? null, $countryCode);
        if ($email !== '') {
            $out['em'] = [$h($email)];
        } elseif ($isHash($person['em_hash'] ?? null)) {
            $out['em'] = [$person['em_hash']];
        }
        if ($phone !== '') {
            $out['ph'] = [$h($phone)];
        } elseif ($isHash($person['ph_hash'] ?? null)) {
            $out['ph'] = [$person['ph_hash']];
        }

        $parts = preg_split('/\s+/', mb_strtolower(trim((string) ($person['name'] ?? ''))), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if ($parts) {
            $out['fn'] = [$h($parts[0])];
            if (count($parts) > 1) {
                $out['ln'] = [$h(end($parts))];
            }
        }
        $city = (string) preg_replace('/[^a-z]/', '', strtolower((string) ($person['city'] ?? '')));
        if ($city !== '') {
            $out['ct'] = [$h($city)];
        }
        if (! empty($person['country'])) {
            $out['country'] = [$h(strtolower(trim((string) $person['country'])))];
        }
        if (($person['external_id'] ?? '') !== '' && ($person['external_id'] ?? null) !== null) {
            $out['external_id'] = [$h((string) $person['external_id'])];
        }
        if (preg_match(self::FB_COOKIE, (string) ($a['fbp'] ?? ''))) {
            $out['fbp'] = $a['fbp'];
        }
        if (preg_match(self::FB_COOKIE, (string) ($a['fbc'] ?? ''))) {
            $out['fbc'] = $a['fbc'];
        }
        if (! empty($a['ip'])) {
            $out['client_ip_address'] = $a['ip'];
        }
        if (! empty($a['ua'])) {
            $out['client_user_agent'] = $a['ua'];
        }

        return $out;
    }

    // ─── Events ─────────────────────────────────────────────────────────

    /**
     * One Conversions API event. Meta requires a user agent on a `website`
     * event; a buyer with none on file is still real, and is filed as
     * `other` so the event is accepted rather than refused.
     *
     * @return array<string, mixed>
     */
    public static function event(
        string $name,
        string $eventId,
        array $person = [],
        ?array $attribution = null,
        array $customData = [],
        ?int $time = null,
        ?string $actionSource = null,
    ): array {
        $userData = self::userData($person, $attribution);
        $source = $actionSource ?? (isset($userData['client_user_agent']) ? 'website' : 'other');
        $event = [
            'event_name' => $name,
            'event_time' => $time ?? time(),
            'event_id' => $eventId,
            'action_source' => $source,
        ];
        if ($source === 'website' && ! empty($attribution['url'])) {
            $event['event_source_url'] = $attribution['url'];
        }
        $event['user_data'] = $userData;
        if ($customData) {
            $event['custom_data'] = $customData;
        }

        return $event;
    }

    /**
     * What an event says about an order. Under on_confirm leave the value
     * OFF everything before the Purchase ($withValue = false): an order that
     * never confirms must not teach Meta what your baskets are worth.
     *
     * @return array<string, mixed>
     */
    public static function orderCustomData(array $order, bool $withValue = true): array
    {
        $items = array_values($order['items'] ?? []);
        $out = [];
        if ($withValue) {
            $out['value'] = round((float) ($order['value'] ?? 0), 2);
            $out['currency'] = strtoupper((string) ($order['currency'] ?? config('meta.currency', 'BDT')));
        }
        if (isset($order['ref'])) {
            $out['order_id'] = (string) $order['ref'];
        }
        $out['content_type'] = $order['content_type'] ?? 'product';
        if (! empty($order['content_name'])) {
            $out['content_name'] = (string) $order['content_name'];
        }
        if ($items) {
            $out['content_ids'] = array_values(array_unique(array_map(fn ($i) => (string) $i['id'], $items)));
            $out['contents'] = array_map(fn ($i) => array_filter([
                'id' => (string) $i['id'],
                'quantity' => (int) ($i['quantity'] ?? 1) ?: 1,
                'item_price' => isset($i['price']) ? (float) $i['price'] : null,
            ], fn ($v) => $v !== null), $items);
            $out['num_items'] = array_sum(array_map(fn ($i) => (int) ($i['quantity'] ?? 1) ?: 1, $items));
        }

        return $out;
    }

    /** @return array<string, mixed> */
    public static function purchaseEvent(array $order, array $person = [], ?array $attribution = null, ?int $time = null): array
    {
        if (($order['ref'] ?? '') === '' || (float) ($order['value'] ?? 0) <= 0) {
            throw new \InvalidArgumentException('A Purchase needs an order ref and a positive value.');
        }
        $custom = self::orderCustomData($order, true);
        if (! empty($order['method'])) {
            $custom['payment_method'] = (string) $order['method'];
        }

        return self::event('Purchase', self::purchaseEventId($order['ref']), $person, $attribution, $custom, $time);
    }

    /**
     * A browser event arriving at the relay endpoint. Null when it must not
     * be forwarded (not a standard event, a Purchase, no event_id).
     *
     * @return array<string, mixed>|null
     */
    public static function relayedEvent(array $body, Request $request): ?array
    {
        $name = self::str($body['event_name'] ?? null, 40);
        $eventId = self::str($body['event_id'] ?? null, 100);
        if ($eventId === '' || ! self::relayAllowed($name)) {
            return null;
        }
        $attribution = self::readAttribution([
            'fbp' => $body['fbp'] ?? null,
            'fbc' => $body['fbc'] ?? null,
            'url' => $body['event_source_url'] ?? null,
        ], $request);
        $custom = is_array($body['custom_data'] ?? null) && $name !== 'PageView' ? $body['custom_data'] : [];

        return self::event(
            $name, $eventId,
            ['em_hash' => $body['em'] ?? null, 'ph_hash' => $body['ph'] ?? null],
            $attribution, $custom, null, 'website',
        );
    }

    // ─── The call ───────────────────────────────────────────────────────

    /** @return array{pixel_id: string, access_token: string, test_event_code: string} */
    public static function credentials(): array
    {
        // If the project keeps these in a settings table so the owner can
        // swap them without a deploy, read them from there instead.
        return [
            'pixel_id' => trim((string) config('meta.pixel_id')),
            'access_token' => trim((string) config('meta.access_token')),
            'test_event_code' => trim((string) config('meta.test_event_code')),
        ];
    }

    public static function enabled(): bool
    {
        $c = self::credentials();

        return config('meta.enabled', true) && $c['pixel_id'] !== '' && $c['access_token'] !== '';
    }

    /**
     * Send one or more events in one request. Returns true only when Meta
     * accepted them — stamp the order's purchase_sent_at on true, never
     * before. Every other outcome is logged and swallowed.
     *
     * @param  list<array<string, mixed>>  $events
     */
    public static function send(array $events, string $context = ''): bool
    {
        $events = array_values(array_filter($events));
        if (! $events || ! self::enabled()) {
            return false;
        }
        $c = self::credentials();
        $names = implode('+', array_column($events, 'event_name'));

        // The token rides in the body, never the query string, so it cannot
        // end up in an access log with the URL.
        $payload = ['data' => $events, 'access_token' => $c['access_token']];
        if ($c['test_event_code'] !== '') {
            $payload['test_event_code'] = $c['test_event_code'];
        }
        $endpoint = sprintf(
            '%s/%s/%s/events',
            rtrim((string) config('meta.base_url', 'https://graph.facebook.com'), '/'),
            trim((string) config('meta.version', 'v23.0'), '/'),
            $c['pixel_id'],
        );

        try {
            $response = Http::acceptJson()
                ->timeout((int) config('meta.timeout', 8))
                ->connectTimeout((int) config('meta.connect_timeout', 4))
                ->post($endpoint, $payload);
        } catch (\Throwable $e) {
            Log::warning('Meta CAPI unreachable.', ['event' => $names, 'context' => $context, 'error' => $e->getMessage()]);

            return false;
        }

        if (! $response->successful()) {
            Log::warning('Meta CAPI rejected an event.', [
                'event' => $names,
                'context' => $context,
                'status' => $response->status(),
                'error' => $response->json('error.message'),
            ]);

            return false;
        }

        return true;
    }

    private static function str(mixed $v, int $max): string
    {
        return is_string($v) ? mb_substr(trim($v), 0, $max) : '';
    }
}
