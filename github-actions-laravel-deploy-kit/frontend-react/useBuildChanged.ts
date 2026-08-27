/**
 * "A new version is available" for a single-page app.
 *
 * An admin tab can sit open for days. After a deploy it is running yesterday's
 * JavaScript against today's API — usually harmless, occasionally the reason a
 * save mysteriously fails. Rather than reloading under someone's hands (which
 * would throw away a half-typed post), offer the reload and let them pick the
 * moment.
 *
 * The `build` string comes from the server: expose App\Support\BuildVersion in
 * any JSON endpoint your shell already polls, e.g.
 *
 *   // app/Http/Controllers/Api/.../NavStateController.php
 *   return ['unread' => …, 'build' => \App\Support\BuildVersion::current()];
 *
 * It is a hash of Vite's build/manifest.json, so it changes exactly when new
 * assets ship and never otherwise. No extra request, no polling of your own.
 */
import { useRef } from 'react';

/** True once a deploy has replaced the frontend this tab booted with. */
export function useBuildChanged(build: string): boolean {
    const booted = useRef<string | null>(null);

    // First non-empty value we ever see is what this tab is running.
    if (build !== '' && booted.current === null) {
        booted.current = build;
    }

    return build !== '' && booted.current !== null && booted.current !== build;
}
