<?php

namespace App\Support;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Asks Google whether a token the browser handed over is real, and whose it is.
 *
 * THIS IS THE SECURITY BOUNDARY. KEEP IT AS IT IS. The browser never proves
 * identity by itself; everything else in the kit trusts what comes out of
 * verify() and nothing that goes in. Three checks, and each one matters:
 *
 *   • `aud` must equal our client id, or a token minted for somebody else's
 *     Google app would sign that person in here.
 *   • `email_verified` must be true, or an unverified address could be used to
 *     claim an account.
 *   • With no client id configured, everything is refused — no client id means
 *     no audience to check against, and an unchecked token is somebody else's.
 *
 * Two kinds of token arrive through the same door:
 *
 *   an ACCESS token — what the web button gets from Google Identity Services;
 *   an ID token (a JWT) — what a native app's account picker returns, and what
 *     One Tap returns. A project's own Android app cannot use the web popup
 *     (Google blocks it inside a WebView), so it signs in natively and sends
 *     this instead. See RECIPE.md, "Inside your own app".
 *
 * They are told apart by shape — a JWT has exactly two dots, an access token
 * has none — and held to the same three checks.
 */
class GoogleToken
{
    /**
     * @return array{sub:string,email:string,name:string,picture:string}|null
     */
    public static function verify(string $token): ?array
    {
        try {
            $clientId = GoogleAuth::clientId();

            if ($clientId === '' || $token === '') {
                return null;
            }

            $profile = substr_count($token, '.') === 2
                ? self::fromIdToken($token, $clientId)
                : self::fromAccessToken($token, $clientId);

            if ($profile === null) {
                return null;
            }

            $email = $profile['email'] ?? null;
            $verified = $profile['email_verified'] ?? null;
            $sub = (string) ($profile['sub'] ?? '');

            // Google sends the flag as a boolean from one endpoint and as the
            // string "true" from the other. Anything that is not plainly true
            // is not verified.
            if (! is_string($email) || $email === '' || $sub === '' || ! in_array($verified, [true, 'true'], true)) {
                return null;
            }

            return [
                'sub' => $sub,
                'email' => strtolower(trim($email)),
                'name' => trim((string) ($profile['name'] ?? '')),
                'picture' => (string) ($profile['picture'] ?? ''),
            ];
        } catch (\Throwable $e) {
            Log::error('Google token verify error: '.$e->getMessage());

            return null;
        }
    }

    /** The web button: confirm the audience, then pull the profile. */
    private static function fromAccessToken(string $token, string $clientId): ?array
    {
        $tokenInfo = self::http()->get('https://oauth2.googleapis.com/tokeninfo', ['access_token' => $token]);

        if (! $tokenInfo->ok() || $tokenInfo->json('aud') !== $clientId) {
            return null;
        }

        $userInfo = self::http()->withToken($token)->get('https://www.googleapis.com/oauth2/v3/userinfo');

        return $userInfo->ok() ? (array) $userInfo->json() : null;
    }

    /**
     * A native account picker or One Tap: the JWT carries the profile itself,
     * and Google's tokeninfo checks its signature and expiry for us.
     */
    private static function fromIdToken(string $token, string $clientId): ?array
    {
        $tokenInfo = self::http()->get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $token]);

        if (! $tokenInfo->ok() || $tokenInfo->json('aud') !== $clientId) {
            return null;
        }

        return (array) $tokenInfo->json();
    }

    private static function http()
    {
        // Local Windows/XAMPP PHP often lacks a CA bundle (cURL error 60), so
        // skip TLS verification ONLY in local dev; production verifies fully.
        return Http::withOptions(['verify' => ! app()->environment('local')])->timeout(15);
    }
}
