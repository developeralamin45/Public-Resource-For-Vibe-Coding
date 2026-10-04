<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\GoogleToken;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * EXAMPLE — "Continue with Google" for a token-based SPA (React/Vue + Sanctum,
 * a mobile app's WebView, anything with no server session to carry a pending
 * profile in). A Blade site uses GoogleAuthController.php instead; a project
 * needs one of the two, not both.
 *
 * The same two outcomes, expressed as JSON instead of a redirect:
 *
 *   POST /auth/google           { access_token }
 *     known email → { login: true, token, user }
 *     new email   → { needs_registration: true, name, email, google_token }
 *
 *   POST /auth/google/register  { google_token, phone, name?, …project fields }
 *     → 201 { token, user }
 *
 * There is no session, so nothing is remembered between the two calls. The
 * frontend sends the Google token back with the phone number and it is
 * VERIFIED AGAIN — the email the account is opened on comes from Google's
 * answer the second time too, never from the request body. That re-check is
 * this variant's equivalent of pendingIdFor(): the client can say whatever it
 * likes about who it is, and none of it is believed. (A Google access token
 * lives about an hour, which is the time a visitor has to type a phone number.)
 *
 * Adapt the two SEAM blocks; leave the order of the checks alone.
 */
class GoogleAuthApiController extends Controller
{
    public function auth(Request $request): JsonResponse
    {
        $request->validate(['access_token' => ['required', 'string']]);

        $info = GoogleToken::verify((string) $request->input('access_token'));
        if (! $info) {
            return response()->json(['message' => 'Google sign-in could not be verified. Please try again.'], 401);
        }

        $user = User::where('email', $info['email'])->first();

        if (! $user) {
            return response()->json([
                'needs_registration' => true,
                'name' => $info['name'],
                'email' => $info['email'],
                'picture' => $info['picture'],
                'google_token' => $request->input('access_token'),
            ]);
        }

        // ── SEAM: whatever the password login refuses, this refuses too ────
        // A blocked account, a suspended tenant, a role that must use another
        // panel. The Google door must never be a way round the other one.
        // ──────────────────────────────────────────────────────────────────

        // Same rule as the Blade controller, and for the same reason — read
        // claimUnprovenAccount() there before changing it.
        if (! $user->hasVerifiedEmail()) {
            $user->forceFill([
                'password' => Hash::make(Str::random(64)),
                'remember_token' => Str::random(60),
                'email_verified_at' => now(),
            ])->save();
            $user->tokens()->delete();
        }

        if (! $user->google_id) {
            DB::table('users')->where('id', $user->id)->update(['google_id' => $info['sub']]);
        }

        return response()->json([
            'login' => true,
            'token' => $user->createToken('auth_token')->plainTextToken,
            'user' => $user->fresh(),
            'picture' => $info['picture'],
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        // Any shape in, one shape judged — the same normalizer as the ordinary
        // registration, so both doors accept a number in the same costumes.
        $request->merge(['phone' => Phone::normalize($request->input('phone'))]);

        $validated = $request->validate([
            'google_token' => ['required', 'string'],
            'phone' => Phone::RULES,
            // Asked only when Google had no name on the account.
            'name' => ['nullable', 'string', 'max:255'],
            // ...the project's other required fields (business name, …).
        ], Phone::messages());

        $info = GoogleToken::verify($validated['google_token']);
        if (! $info) {
            return response()->json(['message' => 'Google sign-in has expired. Please sign in again.'], 401);
        }

        $name = $info['name'] !== '' ? $info['name'] : trim((string) ($validated['name'] ?? ''));
        if ($name === '') {
            return response()->json(['message' => 'Enter your name.', 'errors' => ['name' => ['Enter your name.']]], 422);
        }

        if (User::where('email', $info['email'])->exists()) {
            return response()->json(['message' => 'This email is already registered. Please sign in.'], 422);
        }

        // ── SEAM: create the account exactly as the ordinary registration does
        // Call the same service the email registration calls — tenant, role,
        // trial, starter records, fraud checks, welcome email, all of it —
        // passing these four facts instead of what a form would have supplied.
        $user = User::create([
            'name' => $name,
            'email' => $info['email'],                      // Google's answer, not the request's
            'phone' => $validated['phone'],
            'google_id' => $info['sub'],
            'password' => Hash::make(Str::random(64)),      // nobody holds it; Google is the way in
        ]);
        $user->markEmailAsVerified();                       // Google already proved the address
        // ──────────────────────────────────────────────────────────────────

        return response()->json([
            'token' => $user->createToken('auth_token')->plainTextToken,
            'user' => $user,
            'picture' => $info['picture'],
        ], 201);
    }
}
