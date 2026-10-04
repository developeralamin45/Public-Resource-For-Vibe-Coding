<?php

namespace App\Actions\Fortify;

use App\Models\User;
use App\Support\GoogleAuth;
use App\Support\Phone;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Laravel\Fortify\Contracts\CreatesNewUsers;

/**
 * EXAMPLE — the project almost certainly has one of these already.
 *
 * Do not copy this file in. Find where the project creates a registered user
 * (Fortify's CreateNewUser, a RegisterController, a service class) and add the
 * marked blocks to it. Everything else here is only scaffolding to show where
 * they go.
 *
 * What the blocks do: someone who arrived from "Continue with Google" is
 * carrying a profile Google has already verified. If the email they submit is
 * still the one Google vouched for, the new account gets that google_id, a
 * verified email, and NO password to make up — they pressed the Google button
 * precisely so as not to. If the email is any other address, it is an ordinary
 * registration: it inherits nothing and still needs a password. That one
 * comparison is what stops a pending profile being a way to open password-less
 * accounts on addresses nobody proved.
 */
class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules;

    /**
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        // ── BLOCK 0 (only if the project asks for a phone number) ─────────
        // Accept the number in any shape — +880…, hyphens, Bengali digits —
        // and judge it after it has been tidied, not before.
        $input['phone'] = Phone::normalize($input['phone'] ?? null);
        // ──────────────────────────────────────────────────────────────────

        // ── BLOCK 1 ───────────────────────────────────────────────────────
        // Resolve the pending Google profile, if there is one, against the
        // address actually being registered.
        $googleId = GoogleAuth::pendingIdFor((string) ($input['email'] ?? ''));

        // The last step after Google shows no password field. The account gets
        // a password nobody holds; Google is the way in, and "Forgot your
        // password?" sets a real one whenever they want it. A password that IS
        // submitted alongside a Google profile is still validated and kept.
        $passwordless = $googleId !== null && blank($input['password'] ?? null);
        // ──────────────────────────────────────────────────────────────────

        // Whatever the project already validates. Keep its own rules and its
        // own messages; only the `password` line changes.
        Validator::make($input, [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique(User::class)],
            'phone' => Phone::RULES,
            'password' => $passwordless ? ['nullable'] : $this->passwordRules(),   // ← BLOCK 1
        ], Phone::messages())->validate();

        $user = User::create([
            'name' => $input['name'],
            'email' => $input['email'],
            'phone' => $input['phone'],

            // ── BLOCK 2a ──────────────────────────────────────────────────
            // Never the empty string: an account whose password is "" opens to
            // anyone who leaves the field blank.
            'password' => Hash::make($passwordless ? Str::random(64) : $input['password']),
            'google_id' => $googleId,
            // ──────────────────────────────────────────────────────────────

            // ...plus whatever else this project's users need: role, team_id,
            // trial_ends_at, a starter record. A Google sign-up is a normal
            // registration, so it gets exactly the same setup.
        ]);

        // ── BLOCK 2b ──────────────────────────────────────────────────────
        if ($googleId !== null) {
            // Google has already proved they own the address, so there is
            // nothing left to confirm. Marking it here also keeps Fortify's
            // Registered listener from sending a verification email nobody
            // needs to act on.
            $user->markEmailAsVerified();
        }

        // Whatever address they settled on, the sign-in that brought them here
        // is spent. Leaving it behind would let a later registration in the
        // same browser pick it up.
        GoogleAuth::forgetPending();
        // ──────────────────────────────────────────────────────────────────

        return $user;
    }
}
