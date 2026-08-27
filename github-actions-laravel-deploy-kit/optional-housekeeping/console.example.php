<?php

/*
|--------------------------------------------------------------------------
| routes/console.php — merge this in
|--------------------------------------------------------------------------
| One entry point for every maintenance task. Each task decides for itself
| whether enough time has passed (see App\Support\Housekeeping), so this can
| be triggered by cron, by Supervisor, by an external pinger or by ordinary
| web traffic — the result is identical either way, and nothing depends on
| landing on an exact minute.
*/

use App\Support\Housekeeping;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('system:housekeeping', function () {
    $ran = Housekeeping::run();

    $this->info($ran === [] ? 'Nothing due.' : 'Ran: '.implode(', ', $ran));
})->purpose('Run any background maintenance that is due');

// Harmless if cron is missing — the middleware picks it up from web traffic.
Schedule::command('system:housekeeping')->everyFiveMinutes();

/*
|--------------------------------------------------------------------------
| Your own cleanup commands
|--------------------------------------------------------------------------
| Business data (users, orders, payments) is never pruned. Only transient or
| audit rows that would otherwise grow forever. Register each one in
| Housekeeping::TASKS with an interval. Two rules for anything you add:
|
|   1. Safe to run at any moment (no "must be 3am" assumptions).
|   2. Safe to run twice.
|
| Use chunkById(), not get(): a normal night has one or two rows to clear, but
| a cron that has been down for a month must not load the whole backlog into
| memory at once.
*/

// Example — cancel checkout sessions abandoned over a day ago:
//
// Artisan::command('orders:expire-stale', function () {
//     $count = \App\Models\Order::where('status', 'pending')
//         ->where('created_at', '<', now()->subDay())
//         ->update(['status' => 'cancelled']);
//
//     $this->info("Expired {$count} stale pending order(s).");
// })->purpose('Cancel orders left pending for more than 24 hours');
