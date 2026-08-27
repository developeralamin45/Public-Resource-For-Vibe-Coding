<?php

namespace App\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Self-driving background maintenance.
 *
 * The usual way to run Laravel's scheduler is one crontab line on the server.
 * That is still the best way — but it needs shell access, it silently does
 * nothing when a site moves host, and most people never find out it is missing.
 *
 * So maintenance here does not depend on the clock at all. Each task carries
 * its own "run at most this often" interval and its own last-run stamp, which
 * means it can be triggered from anywhere — cron, a Supervisor loop, an
 * external pinger, or ordinary web traffic — and still runs exactly as often
 * as it should. Trigger it every minute or once a day; the outcome is the same.
 *
 * Timestamps live in a JSON file on the private disk rather than the database:
 * this is written constantly and must not touch the site-settings cache or add
 * a write to every page view.
 */
class Housekeeping
{
    private const FILE = 'housekeeping.json';

    /**
     * command => minimum hours between runs.
     *
     * ---- REPLACE THIS LIST WITH YOUR APP'S OWN CLEANUP COMMANDS ----
     * Only `queue:prune-failed` ships with Laravel; the rest are examples of
     * the shape (see console.example.php). Anything here must be an Artisan
     * command that is safe to run at any moment and safe to run twice.
     *
     * Intervals are deliberately generous. Every one of these is cleanup: an
     * hour late costs nothing, so there is never a reason to run them often.
     */
    private const TASKS = [
        'queue:prune-failed' => 24,       // ships with Laravel
        // 'orders:expire-stale'    => 1,
        // 'support:prune'          => 24,
        // 'media:prune'            => 24,
        // 'payments:prune-attempts' => 168,   // weekly
    ];

    /** How long the whole system may go untouched before it counts as broken. */
    private const STALE_AFTER_HOURS = 25;

    /**
     * Run whatever is due. Safe to call as often as you like — tasks that are
     * not due are skipped without touching the database.
     *
     * @return array<int, string> the commands that actually ran
     */
    public static function run(): array
    {
        $state = self::state();
        $ran = [];

        foreach (self::TASKS as $command => $hours) {
            $last = isset($state[$command]) ? Carbon::parse($state[$command]) : null;

            if ($last !== null && $last->gt(now()->subHours($hours))) {
                continue;
            }

            try {
                Artisan::call($command, self::argumentsFor($command));
                $ran[] = $command;
            } catch (\Throwable $e) {
                // Maintenance must never take the site down with it.
                Log::warning("Housekeeping task {$command} failed: ".$e->getMessage());
            }

            // Stamped even on failure, so a permanently broken task cannot
            // retry on every single request.
            $state[$command] = now()->toIso8601String();
        }

        $state['_last_tick'] = now()->toIso8601String();
        self::write($state);

        return $ran;
    }

    /** True when nothing has driven maintenance for over a day. */
    public static function isStale(): bool
    {
        $last = self::lastTick();

        return $last === null || $last->lt(now()->subHours(self::STALE_AFTER_HOURS));
    }

    public static function lastTick(): ?Carbon
    {
        $state = self::state();

        if (! isset($state['_last_tick'])) {
            return null;
        }

        try {
            return Carbon::parse($state['_last_tick']);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @return array{ok: bool, last_run: string|null}
     */
    public static function status(): array
    {
        return [
            'ok' => ! self::isStale(),
            'last_run' => self::lastTick()?->toIso8601String(),
        ];
    }

    /**
     * Unguessable, stable URL token derived from APP_KEY — so an external cron
     * service (cron-job.org and friends) can drive maintenance over HTTP with
     * nothing to configure and no secret to store separately.
     */
    public static function token(): string
    {
        return substr(hash_hmac('sha256', 'housekeeping', (string) config('app.key')), 0, 32);
    }

    /**
     * @return array<string, mixed>
     */
    private static function argumentsFor(string $command): array
    {
        return $command === 'queue:prune-failed' ? ['--hours' => 720] : [];
    }

    /**
     * @return array<string, string>
     */
    private static function state(): array
    {
        $disk = Storage::disk('local');

        if (! $disk->exists(self::FILE)) {
            return [];
        }

        $decoded = json_decode((string) $disk->get(self::FILE), true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param  array<string, string>  $state
     */
    private static function write(array $state): void
    {
        Storage::disk('local')->put(self::FILE, json_encode($state, JSON_PRETTY_PRINT));
    }
}
