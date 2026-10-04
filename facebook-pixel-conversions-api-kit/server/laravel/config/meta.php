<?php

/*
| Meta (Facebook) Pixel + Conversions API.
|
| The pixel id is public (it is in every page's source). The access token is
| a secret: .env or the project's admin settings table, never the repository
| and never the browser. If the owner should be able to swap them without a
| deploy, read both from the settings table instead — MetaCapi::credentials()
| is the one place to change.
*/

return [

    'pixel_id' => env('META_PIXEL_ID', ''),
    'access_token' => env('META_CAPI_TOKEN', ''),

    // Events Manager → Test events. While set, every server event shows up
    // there live and is NOT counted. Empty it before running ads.
    'test_event_code' => env('META_TEST_EVENT_CODE', ''),

    // Master off switch, independent of the credentials.
    'enabled' => (bool) env('META_CAPI_ENABLED', true),

    /*
    | WHEN IS AN ORDER A SALE? The one decision this kit cannot make for you
    | (RECIPE.md Phase 1 is how to make it).
    |
    |   on_order    cash on delivery — the placed order is the sale
    |   on_payment  online gateway — the verified callback is the sale
    |   on_confirm  money sent by hand / an order a human confirms — the
    |               confirmation is the sale; the browser never fires Purchase
    |
    | A shop with several payment methods has several policies: `methods`
    | maps the project's own payment-method values to a policy, `default`
    | covers the rest. An unknown name behaves as on_confirm.
    */
    'purchase' => [
        'default' => env('META_PURCHASE_POLICY', 'on_confirm'),
        'methods' => [
            // 'cod' => 'on_order',
            // 'sslcommerz' => 'on_payment',
            // 'bkash_manual' => 'on_confirm',
        ],
    ],

    // Home market for phone matching: 01712345678 → 8801712345678.
    'phone_country_code' => env('META_PHONE_COUNTRY_CODE', '880'),
    'currency' => env('META_CURRENCY', 'BDT'),

    // Pinned, not floating: Meta retires a Graph version about two years
    // after release, and an unpinned call starts failing on a date nobody has
    // in a calendar. Check the changelog when you install the kit.
    'base_url' => env('META_GRAPH_BASE_URL', 'https://graph.facebook.com'),
    'version' => env('META_GRAPH_VERSION', 'v23.0'),

    // A marketing call must never hold a request for long.
    'timeout' => (int) env('META_CAPI_TIMEOUT', 8),
    'connect_timeout' => (int) env('META_CAPI_CONNECT_TIMEOUT', 4),

];
