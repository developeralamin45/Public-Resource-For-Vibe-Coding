<?php

// config/smartpay.php — copy, then set the values in .env (never in git).
return [
    // The Bearer token the SmartPay app sends. Long and random; paste the same
    // value into the app: Config → new integration → Auth Key.
    'secret' => env('SMARTPAY_SECRET', ''),

    // What the app shows beside every payment from this site.
    'site_name' => env('SMARTPAY_SITE_NAME', env('APP_NAME', 'My Site')),

    // Auto-verify on at all? Off → the popup never says "not received", only "being checked".
    'enabled' => env('SMARTPAY_ENABLED', true),

    // Fallback amount tolerances — the app sends its own on every request (§4.5).
    'tolerance' => ['overFlat' => 30.0, 'overPercent' => 0.02, 'underFlat' => 1.0],

    // Where the merchant numbers live. Serve these to the page; never hardcode
    // them in a template twice. An admin-editable settings row beats .env.
    'receivers' => [
        'bkash' => env('PAY_BKASH', ''),
        'nagad' => env('PAY_NAGAD', ''),
        'rocket' => env('PAY_ROCKET', ''),
        'bank' => [
            'bankName' => env('PAY_BANK_NAME', ''),
            'accountName' => env('PAY_BANK_ACCOUNT_NAME', ''),
            'accountNumber' => env('PAY_BANK_ACCOUNT_NUMBER', ''),
            'branch' => env('PAY_BANK_BRANCH', ''),
            'routingNumber' => env('PAY_BANK_ROUTING', ''),
        ],
    ],
];
