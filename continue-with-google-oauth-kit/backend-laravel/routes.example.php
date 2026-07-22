<?php

/**
 * Add to routes/api.php. These are PUBLIC (unauthenticated) — they issue the
 * session — so throttle them. `register` is only reachable with a valid Google
 * token, so it's safe to leave public too.
 */

use App\Http\Controllers\GoogleAuthController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/google',          [GoogleAuthController::class, 'auth'])->middleware('throttle:10,1');
Route::post('/auth/google/register', [GoogleAuthController::class, 'register'])->middleware('throttle:10,1');

// Frontend defaults match these paths. Change them → pass `endpoint` to
// <GoogleButton /> and use your own path for the register POST.
