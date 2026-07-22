<?php

/**
 * Merge this into config/services.php (inside the returned array).
 * It reads the Client ID/Secret from your .env so verifyGoogleToken() can do the
 * audience check.
 *
 *   'google' => [
 *       'client_id'     => env('GOOGLE_CLIENT_ID'),
 *       'client_secret' => env('GOOGLE_CLIENT_SECRET'),
 *   ],
 *
 * .env (backend):
 *   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
 *   GOOGLE_CLIENT_SECRET=GOCSPX-...
 *
 * .env (frontend — Vite):
 *   VITE_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com   (same Client ID)
 */

return [
    'google' => [
        'client_id'     => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
    ],
];
