<?php

namespace App\Http\Controllers\Admin;

use App\Support\GoogleAuth;
use Illuminate\Validation\ValidationException;

/**
 * The Google half of an admin settings endpoint, as a trait to drop into
 * whichever controller the project already uses for site settings.
 *
 *     class SettingsController extends Controller
 *     {
 *         use HandlesGoogleCredentials;
 *
 *         public function update(Request $request) {
 *             $data = $request->validate(['settings' => ['required', 'array']]);
 *             $this->applyGoogleRules($data['settings']);      // ← add
 *             foreach ($data['settings'] as $key => $value) { …store… }
 *             return response()->json($this->allSettings());
 *         }
 *
 *         private function allSettings(): object {
 *             $settings = …the project's key/value read…;
 *             $this->addGoogleReadOnly($settings);              // ← add
 *             return (object) $settings;
 *         }
 *     }
 *
 * Two things it is doing, both worth keeping:
 *
 *  • The client id is checked for shape while someone is still looking at the
 *    form. A wrong one does not fail here — it fails days later at sign-in,
 *    with nothing to show but "verification failed".
 *  • The secret never travels to a browser. What goes out is a mask; what comes
 *    back unchanged means "keep what is stored". Stored, it is encrypted with
 *    APP_KEY, which lives in .env rather than the database, so a leaked dump
 *    carries nothing usable.
 *
 * THE ROUTE MUST SIT BEHIND THE PROJECT'S EXISTING ADMIN GUARD. These endpoints
 * read and write credentials; reuse the middleware that already protects the
 * admin area rather than inventing a weaker one.
 */
trait HandlesGoogleCredentials
{
    /**
     * Keys reported but never stored. They are computed from other state, so
     * writing one back would leave a stale copy quietly disagreeing with it.
     */
    private array $googleReadOnlyKeys = ['google.source', 'app.url'];

    /**
     * @param  array<string, mixed>  $settings
     */
    private function applyGoogleRules(array &$settings): void
    {
        foreach ($this->googleReadOnlyKeys as $key) {
            unset($settings[$key]);
        }

        if (array_key_exists(GoogleAuth::CLIENT_ID_KEY, $settings)) {
            $clientId = trim((string) $settings[GoogleAuth::CLIENT_ID_KEY]);

            if ($clientId !== '' && ! str_ends_with($clientId, GoogleAuth::CLIENT_ID_SUFFIX)) {
                throw ValidationException::withMessages([
                    'settings.'.GoogleAuth::CLIENT_ID_KEY => 'A Google Client ID ends with "'.GoogleAuth::CLIENT_ID_SUFFIX.'". Copy the whole thing from the Google console.',
                ]);
            }

            $settings[GoogleAuth::CLIENT_ID_KEY] = $clientId;
        }

        if (! array_key_exists(GoogleAuth::CLIENT_SECRET_KEY, $settings)) {
            return;
        }

        $secret = trim((string) $settings[GoogleAuth::CLIENT_SECRET_KEY]);

        // The form is never given the real secret, so it posts the mask straight
        // back when the field was left alone. That means "keep what is stored" —
        // storing the asterisks would quietly destroy the key.
        if ($secret === GoogleAuth::SECRET_MASK) {
            unset($settings[GoogleAuth::CLIENT_SECRET_KEY]);

            return;
        }

        // Blank still clears it.
        $settings[GoogleAuth::CLIENT_SECRET_KEY] = $secret === '' ? '' : GoogleAuth::encryptSecret($secret);
    }

    /**
     * Add the two computed keys to a settings payload on its way out.
     *
     * @param  array<string, mixed>  $settings
     */
    private function addGoogleReadOnly(array &$settings): void
    {
        // Encrypted at rest and no business reaching a browser: the form is
        // told only whether one exists.
        $settings[GoogleAuth::CLIENT_SECRET_KEY] = GoogleAuth::hasStoredSecret() ? GoogleAuth::SECRET_MASK : '';

        // Where the client id in force comes from: 'panel', 'env' or 'none'.
        $settings['google.source'] = GoogleAuth::source();

        // The site's own public address. The setup guide builds the values an
        // admin pastes into Google out of this, so it has to be the live site —
        // not whatever host an admin happens to be browsing from, which on a
        // developer's machine is localhost.
        $settings['app.url'] = rtrim((string) config('app.url'), '/');
    }
}
