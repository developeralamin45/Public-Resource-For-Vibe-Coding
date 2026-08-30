<?php

namespace App\Console\Commands;

use App\Models\EmailOutbox;
use App\Services\EmailDispatcher;
use Illuminate\Console\Command;

/**
 * Releases mail that quiet hours held back.
 *
 * Register it on the scheduler (routes/console.php on Laravel 11+, or
 * app/Console/Kernel.php before that):
 *
 *     Schedule::command('email:flush-outbox')->everyFiveMinutes();
 *
 * Five minutes is deliberate: the window opens at, say, 08:00 and everyone
 * queued overnight goes out within five minutes of it — close enough to feel
 * immediate, spread out enough that you are not opening 400 SMTP connections
 * on the same second.
 */
class FlushEmailOutbox extends Command
{
    protected $signature = 'email:flush-outbox {--limit=200 : Maximum emails to release in one run}';

    protected $description = 'Send emails that were held back by quiet hours and are now due';

    public function handle(EmailDispatcher $dispatcher): int
    {
        $due = EmailOutbox::where('send_after', '<=', now())
            ->orderBy('send_after')
            ->limit((int) $this->option('limit'))
            ->get();

        if ($due->isEmpty()) {
            $this->info('Outbox is empty — nothing due.');
            return self::SUCCESS;
        }

        $sent = 0;
        foreach ($due as $row) {
            if ($dispatcher->deliverQueued($row)) {
                $sent++;
            }
        }

        $this->info("Released {$sent} of {$due->count()} due emails.");

        return self::SUCCESS;
    }
}
