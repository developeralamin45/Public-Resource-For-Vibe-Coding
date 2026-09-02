<?php

namespace App\Actions\Fortify;

use App\Models\User;
use App\Support\GoogleAuth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Laravel\Fortify\Contracts\CreatesNewUsers;

/**
 * EXAMPLE — the project almost certainly has one of these already.
 *
 * Do not copy this file in. Find where the project creates a registered user
 * (Fortify's CreateNewUser, a RegisterController, a service class) and add the
 * two marked blocks to it. Everything else here is only scaffolding to show
 * where they go.
 *
 * What the two blocks do: someone who arrived at registration from "Continue
 * with Google" is carrying a profile Google has already verified. If the email
 * they submit is still the one Google vouched for, the new account gets that
 * google_id and a verified email. If they typed a different address over the
 * prefilled one, it is an ordinary registration and inherits nothing — that
 * check is what stops a pending profile being claimed by another address.
 */
class CreateNewUser implements CreatesNewUsers
{
    use PasswordValidationRules;

    /**
     * @param  array<string, string>  $input
     */
    public function create(array $input): User
    {
        // Whatever the project already validates. Keep its own rules and its
        // own messages; the fields below are only the common minimum.
        Validator::make($input, [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique(User::class)],
            'password' => $this->passwordRules(),
        ])->validate();

        // ── BLOCK 1 ───────────────────────────────────────────────────────
        // Resolve the pending Google profile, if there is one, against the
        // address actually being registered.
        $googleId = GoogleAuth::pendingIdFor($input['email']);
        // ──────────────────────────────────────────────────────────────────

        $user = User::create([
            'name' => $input['name'],
            'email' => $input['email'],
            'password' => Hash::make($input['password']),

            // ── BLOCK 2a ──────────────────────────────────────────────────
            'google_id' => $googleId,
            // ──────────────────────────────────────────────────────────────

            // ...plus whatever else this project's users need: role, phone,
            // team_id, trial_ends_at, a starter record. A Google sign-up is a
            // normal registration, so it gets exactly the same setup.
        ]);

        // ── BLOCK 2b ──────────────────────────────────────────────────────
        if ($googleId !== null) {
            // Google has already proved they own the address, so there is
            // nothing left to confirm. Marking it here also keeps Fortify's
            // Registered listener from sending a verification email nobody
            // needs to act on. Drop this if the project does not implement
            // MustVerifyEmail.
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
