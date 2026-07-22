<?php

/**
 * Add these to routes/api.php, inside your ADMIN / super-admin middleware group
 * (these read & write mail credentials — never leave them public).
 */

use App\Http\Controllers\EmailSettingsController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'is_admin'])->prefix('system-core')->group(function () {
    Route::get('/email-analytics',  [EmailSettingsController::class, 'getAnalytics']);
    Route::post('/send-test-email', [EmailSettingsController::class, 'sendTestEmail']);
    Route::get('/email-settings',   [EmailSettingsController::class, 'getSettings']);
    Route::post('/email-settings',  [EmailSettingsController::class, 'updateSettings']);
});

// The frontend's default endpoint paths match the above (prefix "system-core").
// If you change them, pass matching `endpoints` to <EmailSettingsPanel />.
