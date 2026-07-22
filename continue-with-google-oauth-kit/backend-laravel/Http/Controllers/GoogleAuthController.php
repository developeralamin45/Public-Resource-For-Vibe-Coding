<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * "Continue with Google" — token-flow OAuth.
 *
 * The frontend obtains a Google access token (via Google Identity Services) and
 * sends it here. We verify it server-side with Google, then either log the user
 * in or signal that a new user must complete registration.
 *
 * SECURITY: the whole point is `verifyGoogleToken()` — it confirms the token was
 * minted for OUR client id (audience check) and that Google marked the email
 * verified. Never trust the email/name from the client without this. Keep it.
 *
 * This is the GENERIC core. The `register()` here creates a plain User; add your
 * app's own setup (team/tenant/subscription/seed data) where marked.
 */
class GoogleAuthController extends Controller
{
    /**
     * Step 1 — verify the Google token.
     *   • known email → log in (issue an API token)
     *   • new email   → tell the frontend to collect extra fields, then register()
     */
    public function auth(Request $request)
    {
        $request->validate(['access_token' => 'required|string']);

        $info = $this->verifyGoogleToken($request->access_token);
        if (!$info) {
            return response()->json(['message' => 'Google verification failed. Please try again.'], 401);
        }

        $user = User::where('email', $info['email'])->first();

        if ($user) {
            // Link the Google id on first Google login; stamp activity without
            // firing model events.
            DB::table('users')->where('id', $user->id)->update([
                'google_id'     => $user->google_id ?: $info['sub'],
                'last_login_at' => now(),
            ]);

            return response()->json([
                'login'   => true,
                'message' => 'Logged in successfully',
                'user'    => $user,
                'token'   => $user->createToken('auth_token')->plainTextToken,
                'picture' => $info['picture'],
            ]);
        }

        // New user — the frontend collects any remaining fields, then calls
        // register() with this same token (valid ~1h; re-verified there).
        return response()->json([
            'needs_registration' => true,
            'name'         => $info['name'],
            'email'        => $info['email'],
            'picture'      => $info['picture'],
            'google_token' => $request->access_token,
        ]);
    }

    /**
     * Step 2 — finish Google registration. No user-chosen password (a random one
     * is set; Google already verified the email).
     */
    public function register(Request $request)
    {
        $validated = $request->validate([
            'google_token' => 'required|string',
            'name'         => 'required|string|max:255',
            // Add your own required fields here (phone, business_name, …).
        ]);

        $info = $this->verifyGoogleToken($validated['google_token']);
        if (!$info) {
            return response()->json(['message' => 'Google verification failed. Please sign in again.'], 401);
        }

        $email = $info['email'];
        if (User::where('email', $email)->exists()) {
            return response()->json(['message' => 'This email is already registered. Please log in.'], 422);
        }

        try {
            DB::beginTransaction();

            $user = User::create([
                'name'              => $validated['name'],
                'email'             => $email,
                'google_id'         => $info['sub'],
                'password'          => bcrypt(Str::random(40)), // random; Google is the login method
                'email_verified_at' => now(),                   // Google already verified it
            ]);

            // ─── APP-SPECIFIC SETUP GOES HERE ────────────────────────────────
            // e.g. create a team/tenant, start a trial, seed default data,
            // assign a role: $user->assignRole('admin');
            // ─────────────────────────────────────────────────────────────────

            DB::commit();

            return response()->json([
                'message' => 'Registered successfully',
                'user'    => $user,
                'token'   => $user->createToken('auth_token')->plainTextToken,
                'picture' => $info['picture'],
                'just_registered' => true,
            ], 201);
        } catch (\Throwable $e) {
            DB::rollBack();
            \Illuminate\Support\Facades\Log::error('Google register failed: ' . $e->getMessage());
            return response()->json(['message' => 'Registration failed. Please try again.'], 500);
        }
    }

    /**
     * Verify a Google OAuth access token over HTTPS (port 443 — never blocked).
     * (1) confirm the token's audience is our client id, (2) fetch the verified
     * profile and require email_verified. Returns the profile or null.
     *
     * @return array{sub:string,email:string,name:string,picture:string}|null
     */
    private function verifyGoogleToken(string $accessToken): ?array
    {
        try {
            // Windows/local PHP often lacks a CA bundle (cURL error 60). Skip TLS
            // verification ONLY in local dev; production verifies fully.
            $verify = !app()->environment('local');

            // 1) Audience check — the token must have been minted for our client.
            $clientId = config('services.google.client_id');
            $ti = Http::withOptions(['verify' => $verify])->timeout(15)
                ->get('https://oauth2.googleapis.com/tokeninfo', ['access_token' => $accessToken]);
            if (!$ti->ok()) return null;
            if ($clientId && $ti->json('aud') !== $clientId) return null;

            // 2) Fetch the verified profile.
            $ui = Http::withOptions(['verify' => $verify])->timeout(15)->withToken($accessToken)
                ->get('https://www.googleapis.com/oauth2/v3/userinfo');
            if (!$ui->ok()) return null;

            $email    = $ui->json('email');
            $verified = $ui->json('email_verified');
            if (!$email || $verified === false || $verified === 'false') return null;

            return [
                'sub'     => (string) ($ui->json('sub') ?? ''),
                'email'   => strtolower($email),
                'name'    => (string) ($ui->json('name') ?? ''),
                'picture' => (string) ($ui->json('picture') ?? ''),
            ];
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Google token verify error: ' . $e->getMessage());
            return null;
        }
    }
}
