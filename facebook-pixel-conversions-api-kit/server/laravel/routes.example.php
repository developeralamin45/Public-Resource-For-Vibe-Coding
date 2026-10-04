<?php

// Paste into routes/api.php (or routes/web.php — then exempt the path from
// CSRF, the browser posts it with fetch + keepalive and no token).

use App\Http\Controllers\MetaEventController;
use Illuminate\Support\Facades\Route;

// Public, so throttled: one visitor fires a handful of events per page.
Route::post('/meta/event', [MetaEventController::class, 'store'])->middleware('throttle:120,1');
