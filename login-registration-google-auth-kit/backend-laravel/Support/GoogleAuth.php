<?php

namespace App\Support;

use App\Models\SiteSetting;
use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;

/**
 * Where the "Continue with Google" credentials come from.
 *
 * Two sources, deliberately. The admin panel writes them to site settings, and
 * `.env` stays as a fallback so a server configured before the panel existed
 * keeps working. The panel wins whenever it holds a value: an admin who types a
 * key into the UI expects that key to be the one in use, not to be silently
 * overruled by a file they cannot see.
 *
 * The client id is public by design — it is rendered into the login page for the
 * browser to use — so it is stored as typed. The secret is not: it is encrypted
 * with APP_KEY, which lives in `.env` rather than the database, so a leaked
 * database dump carries nothing usable.
 *
 * Everything reads through here. Two call sites resolving credentials their own
 * way is how a sign-in button ends up pointing at a different app than the
 * server verifies against.
 */
class GoogleAuth
{
    public const CLIENT_ID_KEY = 'google.client_id';

    public const CLIENT_SECRET_KEY = 'google.client_secret';

    /**
     * Stands in for the stored secret whenever it travels to the browser. The
     * form posts it back untouched, which means "keep what is saved".
     */
    public const SECRET_MASK = '********';

    /** Every Google OAuth client id ends this way; see validation in the admin API. */
    public const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

    /** Where a verified profile waits while its owner finishes registering. */
    public const PENDING_SESSION_KEY = 'google.pending';

    /**
     * How long that profile waits. Long enough to find a phone and type its
     * number; short enough that a shared computer does not offer yesterday's
     * visitor's Google identity to today's.
     */
    public const PENDING_TTL_SECONDS = 1800;

    /**
     * What an embedded browser calls itself. Matched case-insensitively against
     * the User-Agent, here and — rendered from this same list — in the button's
     * own script, so the two can never disagree.
     *
     * FBAN / FBAV / FB_IAB / FB4A / FBIOS — Facebook and Messenger, both platforms.
     * Instagram, Line/, MicroMessenger (WeChat), musical_ly / TikTok / BytedanceWebview,
     * Snapchat — the same kind of WebView under other names.
     * "; wv)" — the marker every Android WebView carries, whoever embeds it.
     *
     * A project whose own native app wraps the site in a WebView matches "; wv)"
     * too. That is correct unless the app hands sign-in to a native bridge — see
     * RECIPE.md, "Inside your own app".
     */
    public const EMBEDDED_BROWSER_MARKERS = [
        'FBAN', 'FBAV', 'FB_IAB', 'FB4A', 'FBIOS', 'Instagram', 'Line/',
        'MicroMessenger', 'musical_ly', 'TikTok', 'BytedanceWebview', 'Snapchat', '; wv)',
    ];

    /** The client id in force, panel first. Empty means Google sign-in is off. */
    public static function clientId(): string
    {
        return self::storedClientId() ?: trim((string) config('services.google.client_id'));
    }

    /**
     * The secret in force, panel first.
     *
     * Unused by the current sign-in flow — the browser-token flow proves nothing
     * with it — but stored for whatever needs it later, and kept out of logs and
     * responses meanwhile.
     */
    public static function clientSecret(): string
    {
        return self::storedSecret() ?: trim((string) config('services.google.client_secret'));
    }

    /** Whether the sign-in button has what it needs to work at all. */
    public static function configured(): bool
    {
        return self::clientId() !== '';
    }

    /**
     * Whether the button can actually finish a sign-in in this browser.
     *
     * Facebook, Messenger, Instagram and their kind open links in their own
     * embedded browser, and Google refuses to sign anyone in from one — the
     * popup ends on a "disallowed_useragent" error page with no way back. A
     * site whose visitors arrive from ads meets most of them exactly there, so
     * for them the button is a dead end sitting above a form that works.
     * Better not to offer it at all.
     *
     * The breakage cannot be feature-detected: nothing the page can query says
     * "Google will refuse me". So the hosts are named. A miss costs what it
     * cost before this existed — one failed tap — and nothing more.
     */
    public static function usableIn(?string $userAgent): bool
    {
        $userAgent = (string) $userAgent;

        foreach (self::EMBEDDED_BROWSER_MARKERS as $marker) {
            if (stripos($userAgent, $marker) !== false) {
                return false;
            }
        }

        return true;
    }

    /** The one question a view asks: show the button, and its divider, or neither. */
    public static function offeredTo(?string $userAgent): bool
    {
        return self::configured() && self::usableIn($userAgent);
    }

    /** Which of the two sources the live client id is coming from, for the panel to show. */
    public static function source(): string
    {
        if (self::storedClientId() !== '') {
            return 'panel';
        }

        return self::clientId() !== '' ? 'env' : 'none';
    }

    /** Whether the panel itself holds a secret — asked without revealing it. */
    public static function hasStoredSecret(): bool
    {
        return self::storedSecret() !== '';
    }

    public static function encryptSecret(string $plain): string
    {
        return Crypt::encryptString($plain);
    }

    /* ------------------------------------------------ a sign-in with no account yet */

    /**
     * Hold a Google profile between the sign-in popup and the registration form.
     *
     * Someone signing in with an address the site has never seen is asked for
     * the one thing Google could not supply — a phone number, usually — rather
     * than having an account invented for them without it.
     */
    public static function rememberPending(array $profile): void
    {
        session()->put(self::PENDING_SESSION_KEY, [
            'sub' => (string) ($profile['sub'] ?? ''),
            'email' => strtolower(trim((string) ($profile['email'] ?? ''))),
            'name' => trim((string) ($profile['name'] ?? '')),
            'at' => time(),
        ]);
    }

    /** @return array{sub:string,email:string,name:string,at:int}|null */
    public static function pending(): ?array
    {
        $pending = session(self::PENDING_SESSION_KEY);

        if (! is_array($pending) || ($pending['sub'] ?? '') === '' || ($pending['email'] ?? '') === '') {
            return null;
        }

        // Stale: treat it as never having happened, and tidy it away.
        if (time() - (int) ($pending['at'] ?? 0) > self::PENDING_TTL_SECONDS) {
            self::forgetPending();

            return null;
        }

        return $pending;
    }

    /**
     * The Google id to attach to an account being opened for this address.
     *
     * The email comparison is the whole point. The pending profile sits in the
     * session while a form the visitor controls is filled in, so an address
     * other than the one Google vouched for is an ordinary registration — it
     * must not inherit somebody else's verified Google identity, and it must
     * not get the password waiver that identity earns.
     */
    public static function pendingIdFor(string $email): ?string
    {
        $pending = self::pending();

        return $pending && $pending['email'] === strtolower(trim($email)) ? $pending['sub'] : null;
    }

    public static function forgetPending(): void
    {
        session()->forget(self::PENDING_SESSION_KEY);
    }

    /** The panel's own client id, ignoring `.env`. */
    private static function storedClientId(): string
    {
        return trim((string) SiteSetting::get(self::CLIENT_ID_KEY, ''));
    }

    /** The panel's own secret, decrypted, ignoring `.env`. */
    private static function storedSecret(): string
    {
        $stored = (string) SiteSetting::get(self::CLIENT_SECRET_KEY, '');

        if ($stored === '') {
            return '';
        }

        try {
            return trim(Crypt::decryptString($stored));
        } catch (DecryptException) {
            // Written under a different APP_KEY, so it can never be read again.
            // Not a reason to break sign-in: fall through to the environment.
            return '';
        }
    }
}
