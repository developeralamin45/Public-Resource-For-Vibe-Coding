<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Simple key/value store for app-wide settings (mail credentials, feature
 * toggles, etc.). If your project already has an equivalent settings table,
 * reuse it and skip this model + its migration.
 */
class SystemSetting extends Model
{
    protected $fillable = ['key', 'value'];
}
