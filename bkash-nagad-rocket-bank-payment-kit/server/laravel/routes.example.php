<?php

// routes/api.php — the four endpoints the checkout and the SmartPay app call.
// All four are public by design (an anonymous visitor; a phone with a secret).
// The webhook needs CSRF off (routes/api.php has none) and the exact final
// URL in the app — no redirects, HTTPS only.

use App\Http\Controllers\PaymentClaimController;
use App\Http\Controllers\PaymentLeadController;
use App\Http\Controllers\SmartPayWebhookController;
use Illuminate\Support\Facades\Route;

Route::post('/lead', [PaymentLeadController::class, 'store'])->middleware('throttle:60,1');
Route::post('/payment-claim', [PaymentClaimController::class, 'store'])->middleware('throttle:30,1');
Route::post('/payment-claim/check', [PaymentClaimController::class, 'check'])->middleware('throttle:120,1');
Route::post('/smartpay/payment', SmartPayWebhookController::class);

// The page needs the merchant numbers. Either pass them into the Blade view
// (`@json(config('smartpay.receivers'))`) or expose them read-only:
Route::get('/payment-config', fn () => response()->json(config('smartpay.receivers')));
