<?php

/**
 * Routes for the email admin panel.
 *
 * ⚠️  KEEP THESE BEHIND ADMIN AUTH. They read and write MAIL CREDENTIALS —
 * exposed publicly, anyone could point your sending account at themselves or
 * read the refresh token straight out of the settings response. Use whatever
 * your project already has ('auth:sanctum' + an is-admin gate, a role
 * middleware, a super-admin guard) — just never leave them open.
 *
 * Copy this block into routes/api.php and adapt the middleware names.
 */

use App\Http\Controllers\EmailSettingsController;
use App\Http\Controllers\EmailTemplateController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'admin'])->prefix('admin')->group(function () {

    // ── Credentials, sender identity, schedule, analytics ──────────────────
    Route::get('/email/settings',   [EmailSettingsController::class, 'show']);
    Route::post('/email/settings',  [EmailSettingsController::class, 'update']);
    Route::get('/email/analytics',  [EmailSettingsController::class, 'analytics']);
    Route::get('/email/logs',       [EmailSettingsController::class, 'logs']);
    Route::post('/email/test',      [EmailSettingsController::class, 'sendTest']);

    // ── The event catalogue: per-event wording and on/off ──────────────────
    Route::get('/email/templates',                 [EmailTemplateController::class, 'index']);
    Route::put('/email/templates/{event}',         [EmailTemplateController::class, 'update']);
    Route::post('/email/templates/{event}/toggle', [EmailTemplateController::class, 'toggle']);
    Route::post('/email/templates/{event}/reset',  [EmailTemplateController::class, 'reset']);
    Route::post('/email/templates/{event}/preview',[EmailTemplateController::class, 'preview']);
    Route::post('/email/templates/{event}/test',   [EmailTemplateController::class, 'sendTest']);

    // ── Queued (quiet-hours) mail ─────────────────────────────────────────
    Route::get('/email/outbox',          [EmailSettingsController::class, 'outbox']);
    Route::delete('/email/outbox/{id}',  [EmailSettingsController::class, 'cancelQueued']);
});
