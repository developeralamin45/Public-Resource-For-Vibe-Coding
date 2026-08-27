<?php

/*
|--------------------------------------------------------------------------
| routes/web.php — trigger 3 (external pinger)
|--------------------------------------------------------------------------
| For hosts with no shell and no cron. Point cron-job.org or UptimeRobot at
| this URL every 15 minutes. The token derives from APP_KEY, so there is
| nothing to configure and no second secret to store:
|
|   php artisan tinker --execute='echo url("/_housekeeping/".App\Support\Housekeeping::token());'
|
| Skip this file entirely if you have cron (trigger 2) or are happy with web
| traffic alone (trigger 1).
*/

use App\Support\Housekeeping;
use Illuminate\Support\Facades\Route;

Route::get('/_housekeeping/{token}', function (string $token) {
    // hash_equals, not ===: constant-time, so the token cannot be guessed a
    // character at a time by timing the 404.
    abort_unless(hash_equals(Housekeeping::token(), $token), 404);

    return response()->json(['ran' => Housekeeping::run()]);
})->middleware('throttle:12,1')->name('housekeeping.run');
