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
// 5. The register view needs the pending profile
// =============================================================================
//
// Fortify: in app/Providers/FortifyServiceProvider.php boot() —
//
//     Fortify::loginView(fn () => view('auth.index', ['activeTab' => 'login']));
//
//     // A visitor sent here by "Continue with Google" arrives with a name and
//     // email Google has verified, so the form starts filled in instead of
//     // asking for what was just handed over.
//     Fortify::registerView(fn () => view('auth.index', [
//         'activeTab' => 'register',
//         'googlePrefill' => \App\Support\GoogleAuth::pending(),
//     ]));
//
// Breeze / a hand-rolled controller: pass the same 'googlePrefill' from
// whichever action renders the registration page. The Blade defaults it to
// null, so a login-only render needs no change.

// =============================================================================
// 6. The admin settings endpoint
// =============================================================================
//
// See SettingsGoogleRules.example.php in this folder: the validation, the
// secret masking, and the two computed keys the setup guide reads.
