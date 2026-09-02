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
     * Someone signing in with an address the site has never seen gets sent to
     * registration with their name and email already filled in, rather than
     * having an account invented for them with no phone number and a password
     * they will never know.
     */
    public static function rememberPending(array $profile): void
    {
        session()->put(self::PENDING_SESSION_KEY, [
            'sub' => (string) ($profile['sub'] ?? ''),
            'email' => strtolower(trim((string) ($profile['email'] ?? ''))),
            'name' => (string) ($profile['name'] ?? ''),
        ]);
    }

    /** @return array{sub:string,email:string,name:string}|null */
    public static function pending(): ?array
    {
        $pending = session(self::PENDING_SESSION_KEY);

        if (! is_array($pending) || ($pending['sub'] ?? '') === '' || ($pending['email'] ?? '') === '') {
            return null;
        }

        return $pending;
    }

    /**
     * The Google id to attach to an account being opened for this address.
     *
     * The email comparison is the whole point. The pending profile sits in the
     * session while a form the visitor controls is filled in, so an address
     * typed over the prefilled one is an ordinary registration — it must not
     * inherit somebody else's verified Google identity.
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
