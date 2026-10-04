<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\GoogleAuth;
use App\Support\GoogleToken;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * "Continue with Google" — the server side, for a session-based (Blade) site.
 * A token-based SPA uses GoogleAuthApiController.example.php instead.
 *
 * The browser gets a token from Google Identity Services and POSTs it here. We
 * verify that token WITH GOOGLE (App\Support\GoogleToken — the security
 * boundary, leave it alone), then answer with the one URL the browser should
 * go to next:
 *
 *   known email → signed in, on to the dashboard or the intended page
 *   new email   → on to the last step, which asks only for what Google could
 *                 not supply (a phone number) — no name, no email, no password
 *
 * The second case deliberately does not open an account on the spot. Doing
 * that makes a user with no phone number — an account that looks complete and
 * is not. The verified profile waits in the session for the one field that is
 * still missing.
 */
class GoogleAuthController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        $request->validate(['access_token' => ['required', 'string']]);

        $info = GoogleToken::verify((string) $request->string('access_token'));
        if (! $info) {
            return response()->json(['message' => 'Google sign-in could not be verified. Please try again.'], 401);
        }

        $user = User::where('email', $info['email'])->first();

        // Nobody on this address yet. Carry the verified profile over to the
        // last step rather than inventing an account behind their back.
        if (! $user) {
            GoogleAuth::rememberPending($info);

            // A path, not a full URL: an absolute one carries APP_URL's host,
            // which is not always the host the browser is actually on.
            return response()->json(['redirect' => route('register', [], false)]);
        }

        // Before anyone is signed in: if nobody had ever proved they own this
        // address, whatever credentials sit on the account are unproven too.
        $this->claimUnprovenAccount($user, $request);

        // An existing email/password account signing in with Google for the
        // first time: link the two, so both doors open the same account.
        if (! $user->google_id) {
            DB::table('users')->where('id', $user->id)->update(['google_id' => $info['sub']]);
        }

        // Google has proved they own this address, so an account that never got
        // round to confirming its email is confirmed by this sign-in.
        if ($this->tracksVerification($user) && ! $user->hasVerifiedEmail()) {
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
     * Hand an unverified account to the person Google just vouched for, and to
     * nobody else.
     *
     * Wherever registration does not make people confirm their email first,
     * anyone can open an account on an address they do not own — a stranger
     * registering karim@gmail.com with a password of their choosing — and
     * wait. When the real Karim later signs in with Google, this endpoint
     * finds that account by email and lets him in; from then on Karim's
     * orders and phone number sit in an account whose password a stranger
     * still knows.
     *
     * Google proving the address closes that: the person in front of us owns
     * it, and whoever set the password never proved anything. So the password
     * is replaced with one nobody holds, the remember-me token is rotated, and
     * every session and API token already open on the account is dropped.
     * Karim keeps the account and signs in with Google; the stranger is out,
     * and cannot reset the password either, because that link goes to Karim's
     * inbox.
     *
     * Someone who registered honestly and simply never confirmed their email
     * lands here too, and loses a password they chose. That is the trade: they
     * are signed in by Google either way, and one "Forgot your password?" sets
     * a new one. There is no way to tell the two cases apart, and this is the
     * safe side to be wrong on.
     *
     * In a project that never verifies email at all, every password account is
     * unproven, so each one goes through this once — on its owner's first
     * Google sign-in, which also marks it verified. Same trade, same reason.
     */
    private function claimUnprovenAccount(User $user, Request $request): void
    {
        if (! $this->tracksVerification($user) || $user->hasVerifiedEmail()) {
            return; // ownership was proved when the account was made
        }

        $user->forceFill([
            'password' => Hash::make(Str::random(64)),
            'remember_token' => Str::random(60),
        ])->save();

        // With database sessions an open one elsewhere is a row. The visitor's
        // own session is still a guest row (no user_id) and is not touched.
        // Other drivers have nothing to delete by user: the rotated remember
        // token and the new password hash are what shut those out (Laravel's
        // AuthenticateSession middleware logs a session out when the hash it
        // stored no longer matches — worth having on for exactly this).
        if (config('session.driver') === 'database') {
            DB::table(config('session.table', 'sessions'))->where('user_id', $user->getKey())->delete();
        }

        // Sanctum / Passport personal tokens, where the project issues them.
        if (method_exists($user, 'tokens')) {
            $user->tokens()->delete();
        }

        Log::warning('Google sign-in claimed an unverified account; its password was reset.', [
            'user_id' => $user->getKey(),
        ]);

        // Shown by the auth layout's status box on the next Blade page. The
        // sentence has to survive being missed (an SPA destination will not
        // show it): the account still opens with Google.
        $request->session()->flash(
            'status',
            'For your security the old password on this account was cancelled, because its email had never been verified. '
            .'You can always sign in with Google; to use a password, set a new one from "Forgot your password?".'
        );
    }

    /** Whether this project records email verification at all. */
    private function tracksVerification(User $user): bool
    {
        return method_exists($user, 'hasVerifiedEmail');
    }
}
