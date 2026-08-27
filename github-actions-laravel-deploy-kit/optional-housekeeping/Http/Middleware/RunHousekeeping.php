<?php

namespace App\Http\Middleware;

use App\Support\Housekeeping;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Runs background maintenance off the back of ordinary web traffic, so the site
 * keeps itself tidy on a host where nobody ever set up cron.
 *
 * Three rules keep this invisible to visitors:
 *
 *  1. It runs in terminate(), after the response has been sent. Under PHP-FPM
 *     the browser is already done; nobody waits for it.
 *  2. A cache lock lets one request per tick through, so twenty simultaneous
 *     visitors do not start twenty prunes.
 *  3. Anything that throws is logged and swallowed. Cleanup failing must never
 *     be visible on a page.
 *
 * A real cron entry is still better — it works at 3am with zero visitors, and
 * it does not borrow a PHP-FPM worker. This is the safety net, not the plan.
 */
class RunHousekeeping
{
    /** One request per this many seconds may attempt maintenance. */
    private const TICK_SECONDS = 300;

    public function handle(Request $request, Closure $next): Response
    {
        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        // Never piggyback on something a person is waiting on interactively,
        // and never on a request that is already doing work.
        //
        // `ajax()` alone was not enough: it looks for X-Requested-With, which
        // fetch and axios do not send, so every dashboard JSON call was still
        // eligible to become the request that borrows a worker for cleanup.
        // A JSON response is by definition something a screen is waiting on,
        // so the whole API is out — page views carry the tick.
        if (! $request->isMethod('GET') || $request->ajax() || $request->expectsJson() || $request->is('api/*')) {
            return;
        }

        try {
            // add() is atomic: exactly one request wins each tick window.
            if (! Cache::add('housekeeping:tick', true, self::TICK_SECONDS)) {
                return;
            }

            Housekeeping::run();
        } catch (\Throwable $e) {
            Log::warning('Housekeeping tick failed: '.$e->getMessage());
        }
    }
}
