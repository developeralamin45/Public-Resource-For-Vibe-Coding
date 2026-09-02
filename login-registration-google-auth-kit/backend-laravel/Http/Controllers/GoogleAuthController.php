<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\GoogleAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * "Continue with Google" — the whole server side of it.
 *
 * The browser gets an OAuth access token from Google Identity Services and
 * POSTs it here. We verify that token WITH GOOGLE, then answer with the one URL
 * the browser should go to next:
 *
 *   known email → signed in, on to the dashboard or the intended page
 *   new email   → on to registration, with the verified name and email already
 *                 filled in and the profile held for the moment they submit
 *
 * The second case deliberately does not open an account on the spot. Doing that
 * makes a user with no phone number and a random password nobody can ever use —
 * an account that looks complete and is not. Registration asks for whatever
 * else the project needs, so a new visitor goes there; only the parts Google
 * has already proved are skipped.
 *
 * The browser never proves identity by itself. That is the security boundary,
 * and §"verifyGoogleToken" below is where it lives — keep it as it is.
 */
class GoogleAuthController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $request->validate(['access_token' => ['required', 'string']]);

        $info = $this->verifyGoogleToken($request->string('access_token'));
        if (! $info) {
            return response()->json(['message' => 'Google sign-in could not be verified. Please try again.'], 401);
        }

        $user = User::where('email', $info['email'])->first();

        // Nobody on this address yet. Carry the verified profile over to the
        // registration form rather than inventing an account behind their back.
        if (! $user) {
            GoogleAuth::rememberPending($info);

            // A path, not a full URL: an absolute one carries APP_URL's host,
            // which is not always the host the browser is actually on.
            return response()->json(['redirect' => route('register', [], false)]);
        }

        // An existing email/password account signing in with Google for the
        // first time: link the two, so both doors open the same account.
        if (! $user->google_id) {
            DB::table('users')->where('id', $user->id)->update(['google_id' => $info['sub']]);
        }

        // Google has proved they own this address, so an account that never got
        // round to confirming its email is confirmed by this sign-in.
        // (Drop this if the project does not implement MustVerifyEmail.)
        if (method_exists($user, 'hasVerifiedEmail') && ! $user->hasVerifiedEmail()) {
            $user->markEmailAsVerified();
        }

        // Nothing is left half-done from an earlier attempt in this browser.
        GoogleAuth::forgetPending();

        Auth::login($user);
        $request->session()->regenerate();

        // ── SEAM ──────────────────────────────────────────────────────────
        // Where a signed-in user lands. Match the project's own post-login
        // redirect (Fortify's LoginResponse, a RouteServiceProvider HOME
        // constant, whatever it uses) rather than inventing a second answer.
        $fallback = (method_exists($user, 'isAdmin') && $user->isAdmin()) ? '/admin' : '/dashboard';
        $intended = $request->session()->pull('url.intended', $fallback);
        if (str_contains($intended, '/api/')) {
            $intended = $fallback;
        }
        // ──────────────────────────────────────────────────────────────────

        return response()->json(['redirect' => $intended]);
    }

    /**
     * Verify a Google OAuth access token over HTTPS. Confirms the token was
     * issued for OUR client id, then returns the verified profile.
     *
     * KEEP THIS AS IT IS. Both checks matter:
     *   • `aud` must equal our client id, or a token minted for somebody
     *     else's Google app would sign that person in here.
     *   • `email_verified` must be true, or an unverified address could be
     *     used to claim an account.
     *
     * @return array{sub:string,email:string,name:string,picture:string}|null
     */
    private function verifyGoogleToken(string $accessToken): ?array
    {
        try {
            // Local Windows/XAMPP PHP often lacks a CA bundle (cURL error 60), so
            // skip TLS verification ONLY in local dev; production verifies fully.
            $verify = ! app()->environment('local');
            $clientId = GoogleAuth::clientId();

            // With no client id there is no audience to check against, and an
            // unchecked token is one minted for somebody else's app. Refuse it.
            if ($clientId === '') {
                return null;
            }

            // 1) Confirm the token's audience matches our client id.
            $tokenInfo = Http::withOptions(['verify' => $verify])->timeout(15)
                ->get('https://oauth2.googleapis.com/tokeninfo', ['access_token' => $accessToken]);
            if (! $tokenInfo->ok()) {
                return null;
            }
            if ($tokenInfo->json('aud') !== $clientId) {
                return null;
            }

            // 2) Pull the verified profile.
            $userInfo = Http::withOptions(['verify' => $verify])->timeout(15)->withToken($accessToken)
                ->get('https://www.googleapis.com/oauth2/v3/userinfo');
            if (! $userInfo->ok()) {
                return null;
            }

            $email = $userInfo->json('email');
            $verified = $userInfo->json('email_verified');
            if (! $email || $verified === false || $verified === 'false') {
                return null;
            }

            return [
                'sub' => (string) ($userInfo->json('sub') ?? ''),
                'email' => strtolower($email),
                'name' => (string) ($userInfo->json('name') ?? ''),
                'picture' => (string) ($userInfo->json('picture') ?? ''),
            ];
        } catch (\Throwable $e) {
            Log::error('Google token verify error: '.$e->getMessage());

            return null;
        }
    }
}
