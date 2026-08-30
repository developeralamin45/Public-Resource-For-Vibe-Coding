<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Flat key/value store for anything an admin configures at runtime.
 * This kit uses it for mail credentials, sender identity and the send schedule.
 *
 * If your project already has a settings model, DELETE this file and point the
 * kit at yours — it only ever calls whereIn('key', ...)->pluck('value','key')
 * and updateOrCreate(['key' => ...], ['value' => ...]).
 */
class SystemSetting extends Model
{
    protected $fillable = ['key', 'value'];

    public static function get(string $key, ?string $default = null): ?string
    {
        $v = static::where('key', $key)->value('value');

        return ($v === null || $v === '') ? $default : $v;
    }

    public static function put(string $key, ?string $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
