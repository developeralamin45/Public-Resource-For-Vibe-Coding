<?php

/**
 * EXAMPLE — every wiring change this kit needs, in one file.
 *
 * Nothing here is copied wholesale. Each block goes into the project file named
 * above it. Read RECIPE.md first; this is the reference for the small edits.
 */

// =============================================================================
// 1. routes/web.php
// =============================================================================
//
// The browser posts a Google access token here. Public (nobody is signed in
// yet) and throttled, because it is an unauthenticated endpoint that makes an
// outbound HTTP call.

use App\Http\Controllers\GoogleAuthController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/google', [GoogleAuthController::class, 'handle'])
    ->middleware('throttle:20,1')
    ->name('auth.google');

// It must sit in the *web* middleware group, not api: the whole flow depends on
// the session (Auth::login, and the pending profile carried to registration).

// =============================================================================
// 2. config/services.php
// =============================================================================
//
// Merge this into the array that file returns. It is the .env fallback —
// App\Support\GoogleAuth prefers the value stored by the admin panel.

return [
    // ...

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
    ],
];

// =============================================================================
// 3. .env / .env.example
// =============================================================================
//
// Optional once the admin panel is in place, but keep the keys documented so a
// server can be configured without a browser.
//
//     # Google OAuth ("Continue with Google"). Create credentials at
//     # https://console.cloud.google.com/auth/clients (Web application).
//     GOOGLE_CLIENT_ID=
//     GOOGLE_CLIENT_SECRET=

// =============================================================================
// 4. app/Models/User.php
// =============================================================================
//
// Add 'google_id' to $fillable. Nothing else changes.

// =============================================================================
// 5. The register route decides which page a visitor sees
// =============================================================================
//
// Fortify: in app/Providers/FortifyServiceProvider.php boot() —
//
//     Fortify::loginView(fn () => view('auth.index', ['activeTab' => 'login']));
//
//     Fortify::registerView(function (Request $request) {
//         // "Use a different email" on the last step: they would rather
//         // register some other address, so the Google profile is let go and
//         // the ordinary form comes back.
//         if ($request->boolean('manual')) {
//             \App\Support\GoogleAuth::forgetPending();
//         }
//
//         // A visitor sent here by "Continue with Google" has already given a
//         // name and an email Google verified. All that is left to ask is the
//         // phone number, so that is all the page asks.
//         if ($google = \App\Support\GoogleAuth::pending()) {
//             return view('auth.google-phone', ['google' => $google]);
//         }
//
//         return view('auth.index', ['activeTab' => 'register']);
//     });
//
// Breeze / a hand-rolled controller: put the same three branches in whichever
// action renders the registration page. The ordinary form itself knows nothing
// about Google.

// =============================================================================
// 5b. The keyboard script is a static file
// =============================================================================
//
// frontend-blade/js/keyboard-aware.js → public/js/keyboard-aware.js
// (layouts/auth.blade.php loads it with asset('js/keyboard-aware.js')). If the
// project bundles its JS, import it from the bundle instead and drop that tag.

// =============================================================================
// 5c. A token-based SPA instead of Blade
// =============================================================================
//
// Skip blocks 1 and 5. Use GoogleAuthApiController.example.php, in routes/api.php:
//
//     Route::post('/auth/google', [GoogleAuthApiController::class, 'auth'])
//         ->middleware('throttle:20,1');
//     Route::post('/auth/google/register', [GoogleAuthApiController::class, 'register'])
//         ->middleware('throttle:10,1');
//
// and frontend-react/ for the button, the phone field and the in-app check.

// =============================================================================
// 6. The admin settings endpoint
// =============================================================================
//
// See SettingsGoogleRules.example.php in this folder: the validation, the
// secret masking, and the two computed keys the setup guide reads.
