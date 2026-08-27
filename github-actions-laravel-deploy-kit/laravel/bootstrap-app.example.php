<?php

/*
|--------------------------------------------------------------------------
| bootstrap/app.php — the two lines this kit needs
|--------------------------------------------------------------------------
| This is NOT a drop-in replacement. Merge the two marked additions into your
| own bootstrap/app.php (Laravel 11/12 skeleton). On Laravel 10 or older,
| register the same middleware in app/Http/Kernel.php instead:
|
|   protected $middlewareGroups = [
|       'web' => [ ..., \App\Http\Middleware\FreshHtml::class ],
|   ];
|   protected $middleware = [ ..., \App\Http\Middleware\RunHousekeeping::class ];
*/

use App\Http\Middleware\FreshHtml;
use App\Http\Middleware\RunHousekeeping;   // optional-housekeeping only
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {

        // ---- ADDITION 1 (required) -------------------------------------
        // A deploy must be visible on the next page load, not whenever the
        // browser feels like re-checking its own copy.
        $middleware->web(append: [
            FreshHtml::class,
        ]);

        // ---- ADDITION 2 (optional-housekeeping) ------------------------
        // Keeps maintenance running on hosts with no cron. Terminable, so it
        // fires after the response has already gone out.
        $middleware->append(RunHousekeeping::class);

    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
