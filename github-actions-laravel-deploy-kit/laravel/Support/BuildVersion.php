<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * A short fingerprint of the currently deployed frontend build.
 *
 * Vite rewrites `public/build/manifest.json` on every build, so hashing it
 * gives a value that changes exactly when new assets ship and never otherwise.
 * The SPA reads it once at boot and again on each navigation; a change means
 * the tab is running code that no longer matches the server.
 */
class BuildVersion
{
    public static function current(): string
    {
        // Cached forever and busted by the deploy's `cache:clear`, so this
        // never touches the disk on a normal request.
        return Cache::rememberForever('build_version', function () {
            $manifest = public_path('build/manifest.json');

            if (! is_file($manifest)) {
                return 'dev';
            }

            return substr(md5_file($manifest) ?: 'dev', 0, 12);
        });
    }
}
