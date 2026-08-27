# Optional — self-driving background maintenance

**Skip this whole folder if you only want deploys.** Nothing in the deploy
pipeline depends on it.

## What it solves

The usual way to run Laravel's scheduler is one crontab line on the server.
That is still the best way — but it needs shell access, it silently does
nothing when a site moves host, and most people never find out it is missing.
Then one day the `failed_jobs` table is 4 GB.

So maintenance here does not depend on the clock at all. Each task carries its
own "run at most this often" interval and its own last-run stamp, which means
it can be triggered from **anywhere** and still runs exactly as often as it
should. Trigger it every minute or once a day; the outcome is the same.

## Three triggers, any one of which is enough

| # | Trigger | Setup | When it wins |
|---|---|---|---|
| 1 | **Web traffic** — `RunHousekeeping` middleware | none, always on | Shared hosting, no shell. The safety net that makes 2 and 3 optional. |
| 2 | **OS cron** — `schedule:run` every minute | `./server/setup-cron.sh` | Production. Runs at 3am with no visitors, borrows no PHP-FPM worker. |
| 3 | **External pinger** — `GET /_housekeeping/{token}` | point cron-job.org at the URL | Hosts with no shell at all. |

Trigger 1 is invisible to visitors by construction: it runs in `terminate()`
after the response has been sent, at most once every five minutes, behind an
atomic cache lock, and anything that throws is logged and swallowed. It also
skips JSON/AJAX requests — those are things a screen is waiting on.

## Install

```
Support/Housekeeping.php              → app/Support/
Http/Middleware/RunHousekeeping.php   → app/Http/Middleware/
console.example.php                   → merge into routes/console.php
routes-web.example.php                → merge into routes/web.php   (trigger 3 only)
```

Then register the middleware (see `../laravel/bootstrap-app.example.php`) and
**edit `Housekeeping::TASKS`** — it ships with only `queue:prune-failed`, and
a task list that names commands your app does not have will log a warning on
every tick.

## Verify

```bash
php artisan system:housekeeping     # "Nothing due." or "Ran: queue:prune-failed"
php artisan schedule:list
```

State lives in `storage/app/housekeeping.json` — a plain JSON file, not the
database, because it is written constantly and must not add a write to every
page view. Delete it to force everything to run once.

## Surfacing it in an admin panel

`Housekeeping::status()` returns `['ok' => bool, 'last_run' => ?string]`.
`ok` goes false only when *nothing at all* has run for over 25 hours — which,
on a site with visitors, should never happen. Worth a banner.
