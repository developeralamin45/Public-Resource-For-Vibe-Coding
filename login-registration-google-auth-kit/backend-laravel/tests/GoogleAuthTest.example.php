<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\GoogleAuth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * EXAMPLE — copy into tests/Feature/GoogleAuthTest.php and adapt the fixtures:
 * the redirect targets ('/dashboard', '/admin'), the registration fields, the
 * role column, and the strings asserted on if the UI was translated.
 *
 * "Continue with Google" has exactly two outcomes, and which one a visitor gets
 * is decided by one thing only: whether the site already knows their address.
 *
 *   known address → signed in, nothing else asked
 *   new address   → sent to the last step, which asks for the phone number
 *                   this site needs and nothing Google already answered
 *
 * The second case deliberately does not open an account on the spot. That would
 * make a user with no phone number — an account that looks complete and is not.
 *
 * Everything below stubs Google's two endpoints. The point of the flow is that
 * the server asks Google rather than believing the browser, so the tests put
 * the answers Google would give in Google's mouth — including the wrong ones.
 */
class GoogleAuthTest extends TestCase
{
    use RefreshDatabase;

    private const CLIENT_ID = 'test-client.apps.googleusercontent.com';

    protected function setUp(): void
    {
        parent::setUp();
        // The pages are asserted on as HTML; they do not need built assets.
        $this->withoutVite();
        config(['services.google.client_id' => self::CLIENT_ID]);
    }

    /** Make Google answer for a verified account. */
    private function googleReturns(string $email, string $name = 'New Person', string $sub = 'google-sub-1'): void
    {
        Http::fake([
            'oauth2.googleapis.com/tokeninfo*' => Http::response(['aud' => self::CLIENT_ID]),
            'www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'sub' => $sub,
                'email' => $email,
                'email_verified' => true,
                'name' => $name,
                'picture' => '',
            ]),
        ]);
    }

    private function signInWithGoogle()
    {
        return $this->postJson('/auth/google', ['access_token' => 'a-browser-token']);
    }

    private function pending(string $email, string $name = 'New Person', string $sub = 'google-sub-1'): array
    {
        return [GoogleAuth::PENDING_SESSION_KEY => ['sub' => $sub, 'email' => $email, 'name' => $name, 'at' => time()]];
    }

    /* ------------------------------------------------- an account already exists */

    public function test_an_existing_email_password_user_is_signed_straight_in(): void
    {
        // The whole promise of the feature for existing users: no second
        // account, no extra form, no "link your account" step.
        $user = User::factory()->create(['email' => 'existing@example.com', 'google_id' => null]);
        $this->googleReturns('existing@example.com');

        $this->signInWithGoogle()
            ->assertOk()
            ->assertJsonPath('redirect', '/dashboard');

        $this->assertAuthenticatedAs($user);
        $this->assertSame(1, User::count());
        $this->assertSame('google-sub-1', $user->fresh()->google_id);
    }

    public function test_the_google_id_is_linked_to_the_existing_account_not_a_new_one(): void
    {
        $user = User::factory()->create(['email' => 'existing@example.com', 'google_id' => null]);
        $this->googleReturns('existing@example.com');

        $this->signInWithGoogle()->assertOk();

        $this->assertSame(1, User::count());
        $this->assertDatabaseHas('users', ['id' => $user->id, 'google_id' => 'google-sub-1']);
    }

    public function test_an_admin_signing_in_with_google_lands_on_the_admin_panel(): void
    {
        User::factory()->create(['email' => 'boss@example.com', 'role' => 'admin']);
        $this->googleReturns('boss@example.com');

        $this->signInWithGoogle()->assertJsonPath('redirect', '/admin');
    }

    public function test_an_unverified_account_is_confirmed_by_signing_in_with_google(): void
    {
        // Google has proved they own the address; there is nothing left to
        // confirm by email.
        $user = User::factory()->unverified()->create(['email' => 'existing@example.com']);
        $this->googleReturns('existing@example.com');

        $this->signInWithGoogle()->assertOk();

        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    /* ------------------------------------- claiming an account nobody proved */

    public function test_signing_in_with_google_kills_the_password_on_an_unverified_account(): void
    {
        // The attack this closes: a stranger registers someone else's address
        // with a password of their choosing (registration never asks them to
        // confirm the email), waits for the real owner to "Continue with
        // Google", and then still holds a working password to the account the
        // owner is now using.
        $victimEmail = 'karim@example.com';
        User::factory()->unverified()->create([
            'email' => $victimEmail,
            'password' => Hash::make('stranger-chose-this'),
        ]);

        $this->googleReturns($victimEmail);
        $this->signInWithGoogle()->assertOk();

        // The password the stranger set no longer opens anything.
        $this->post('/logout');
        $this->post('/login', ['email' => $victimEmail, 'password' => 'stranger-chose-this'])
            ->assertSessionHasErrors('email');
        $this->assertGuest();
    }

    public function test_a_session_already_open_on_an_unverified_account_is_dropped(): void
    {
        // Only meaningful where sessions are rows. Delete this test if the
        // project keeps them anywhere else.
        config(['session.driver' => 'database']);
        $user = User::factory()->unverified()->create(['email' => 'karim@example.com']);

        // A stranger sitting logged in on the account they opened.
        DB::table('sessions')->insert([
            'id' => 'stranger-session',
            'user_id' => $user->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'stranger',
            'payload' => '',
            'last_activity' => time(),
        ]);

        $this->googleReturns('karim@example.com');
        $this->signInWithGoogle()->assertOk();

        $this->assertDatabaseMissing('sessions', ['id' => 'stranger-session']);
    }

    public function test_a_verified_account_keeps_its_password(): void
    {
        // The ordinary case must not be disturbed: this address was proved when
        // the account was made, so the password on it is its owner's.
        $user = User::factory()->create(['email' => 'existing@example.com']);
        $before = $user->password;

        $this->googleReturns('existing@example.com');
        $this->signInWithGoogle()->assertOk();

        $this->assertSame($before, $user->fresh()->password);
    }

    /* ---------------------------------------------------- no account here yet */

    public function test_a_new_address_is_sent_to_registration_instead_of_being_given_an_account(): void
    {
        $this->googleReturns('new@example.com', 'New Person', 'sub-new');

        $this->signInWithGoogle()
            ->assertOk()
            ->assertJsonPath('redirect', '/register');

        $this->assertSame(0, User::count());
        $this->assertGuest();
        $this->assertSame('new@example.com', session(GoogleAuth::PENDING_SESSION_KEY)['email']);
    }

    public function test_the_checkout_a_visitor_was_headed_for_survives_the_detour(): void
    {
        // Clicking "Buy" while logged out stores the checkout URL and bounces
        // to /login. Going via Google and then registration is a longer road to
        // the same place, and must not lose the destination on the way.
        $this->withSession(['url.intended' => '/checkout/some-course']);
        $this->googleReturns('new@example.com');

        $this->signInWithGoogle()->assertJsonPath('redirect', '/register');

        $this->assertSame('/checkout/some-course', session('url.intended'));
    }

    public function test_the_last_step_carries_the_google_profile_without_asking_for_it_again(): void
    {
        $this->withSession($this->pending('new@example.com'))
            ->get('/register')
            ->assertOk()
            // Shown, so a wrong Google account gets noticed…
            ->assertSee('New Person')
            ->assertSee('new@example.com')
            // …and sent along, but not as boxes to fill in.
            ->assertSee('<input type="hidden" name="email" value="new@example.com">', false)
            ->assertSee('<input type="hidden" name="name" value="New Person">', false)
            ->assertSee('Enter your phone number', false);
    }

    public function test_a_google_account_with_no_name_is_asked_for_one(): void
    {
        // The account needs a name. A hidden empty one would fail validation
        // on a page with no box to fix it in.
        $this->withSession($this->pending('new@example.com', ''))
            ->get('/register')
            ->assertOk()
            ->assertSee('id="g-name"', false);
    }

    public function test_the_registration_form_is_untouched_without_a_google_sign_in(): void
    {
        $this->get('/register')
            ->assertOk()
            ->assertDontSee('Enter your phone number', false)
            ->assertSee('id="r-password"', false);
    }

    public function test_finishing_registration_links_google_and_skips_email_verification(): void
    {
        $this->withSession($this->pending('new@example.com', 'New Person', 'sub-new'))
            ->post('/register', [
                'name' => 'New Person',
                'email' => 'new@example.com',
                'phone' => '01712345678',
                'password' => 'secret-pass',
                'password_confirmation' => 'secret-pass',
            ])
            ->assertRedirect();

        $user = User::where('email', 'new@example.com')->firstOrFail();
        $this->assertSame('sub-new', $user->google_id);
        $this->assertSame('01712345678', $user->phone);
        $this->assertNotNull($user->email_verified_at, 'Google already verified this address.');
        $this->assertAuthenticatedAs($user);

        // The sign-in that brought them here is spent.
        $this->assertNull(session(GoogleAuth::PENDING_SESSION_KEY));
    }

    public function test_after_google_only_the_phone_number_is_asked_for(): void
    {
        // Pressing "Continue with Google" is a way of not making up a password.
        // Asking for one on the very next screen takes that back.
        $this->withSession($this->pending('new@example.com'))
            ->get('/register')
            ->assertOk()
            ->assertSee('name="phone"', false)
            ->assertDontSee('type="password"', false)
            // No tabs either: there is nothing to switch to mid-step.
            ->assertDontSee('role="tablist"', false)
            // Already signed in with Google once; the button has nothing left to do.
            ->assertDontSee('id="google-signin"', false);
    }

    public function test_registration_finishes_with_no_password_after_google(): void
    {
        $this->withSession($this->pending('new@example.com', 'New Person', 'sub-new'))
            ->post('/register', [
                'name' => 'New Person',
                'email' => 'new@example.com',
                'phone' => '01712345678',
            ])
            ->assertSessionHasNoErrors()
            ->assertRedirect();

        $user = User::where('email', 'new@example.com')->firstOrFail();
        $this->assertSame('sub-new', $user->google_id);
        $this->assertNotNull($user->email_verified_at);
        $this->assertAuthenticatedAs($user);

        // Something is stored, and it is not the empty string: an account whose
        // password is "" would open to anyone who leaves the field blank.
        $this->assertFalse(Hash::check('', $user->password));
    }

    public function test_a_different_address_still_needs_a_password(): void
    {
        // The password is waived for the address Google vouched for and no
        // other. Without this, a pending profile would be a way to open
        // password-less accounts on any address at all.
        $this->withSession($this->pending('new@example.com'))
            ->post('/register', [
                'name' => 'Someone Else',
                'email' => 'other@example.com',
                'phone' => '01712345678',
            ])
            ->assertSessionHasErrors('password');

        $this->assertSame(0, User::count());
    }

    public function test_an_ordinary_registration_still_needs_a_password(): void
    {
        $this->post('/register', [
            'name' => 'Ordinary Person',
            'email' => 'ordinary@example.com',
            'phone' => '01712345678',
        ])->assertSessionHasErrors('password');

        $this->assertSame(0, User::count());
    }

    public function test_the_visitor_can_let_go_of_the_google_profile_and_register_by_hand(): void
    {
        $this->withSession($this->pending('new@example.com'))
            ->get('/register?manual=1')
            ->assertOk()
            ->assertDontSee('Enter your phone number', false)
            ->assertSee('id="r-password"', false)
            ->assertSee('id="google-signin"', false);

        $this->assertNull(session(GoogleAuth::PENDING_SESSION_KEY));
    }

    /* ------------------------------------------- browsers Google will not serve */

    public function test_the_button_is_offered_in_an_ordinary_browser(): void
    {
        $this->withHeader('User-Agent', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36')
            ->get('/login')
            ->assertOk()
            ->assertSee('id="google-signin"', false);
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('embeddedBrowsers')]
    public function test_the_button_is_hidden_inside_an_embedded_browser(string $userAgent): void
    {
        // Google refuses sign-in from an embedded browser, so there the button
        // could only ever end on Google's error page.
        foreach (['/login', '/register'] as $page) {
            $this->withHeader('User-Agent', $userAgent)
                ->get($page)
                ->assertOk()
                ->assertDontSee('id="google-signin"', false)
                // …and no "or by email" divider left hanging above nothing.
                ->assertDontSee('id="email-divider-label"', false)
                // The form that does work there is still on the page.
                ->assertSee('name="email"', false);
        }
    }

    public static function embeddedBrowsers(): array
    {
        return [
            'Facebook on Android' => ['Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/465.0.0.38.109;]'],
            'Facebook on iPhone' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/466.0.0.34.107;FBDV/iPhone14,5]'],
            'Messenger on iPhone' => ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/MessengerForiOS;FBAV/460.0.0.30.109]'],
            'TikTok on Android' => ['Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36 musical_ly_2023 BytedanceWebview/d8a21c6'],
            'Any Android WebView' => ['Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36'],
            'Instagram on Android' => ['Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36 Instagram 334.0.0.42.95 Android'],
        ];
    }

    public function test_a_pending_profile_cannot_be_claimed_by_a_different_address(): void
    {
        // The visitor controls the email field. Typing over the prefilled address
        // must not hand somebody else's verified Google identity to the account
        // being opened — that is an ordinary registration.
        $this->withSession($this->pending('new@example.com', 'New Person', 'sub-new'))
            ->post('/register', [
                'name' => 'Someone Else',
                'email' => 'other@example.com',
                'phone' => '01712345678',
                'password' => 'secret-pass',
                'password_confirmation' => 'secret-pass',
            ])
            ->assertRedirect();

        $user = User::where('email', 'other@example.com')->firstOrFail();
        $this->assertNull($user->google_id);
        $this->assertNull($user->email_verified_at);
    }

    public function test_registration_still_insists_on_a_phone_number(): void
    {
        // The reason a new visitor is sent here at all.
        $this->withSession($this->pending('new@example.com'))
            ->post('/register', [
                'name' => 'New Person',
                'email' => 'new@example.com',
                'password' => 'secret-pass',
                'password_confirmation' => 'secret-pass',
            ])
            ->assertSessionHasErrors('phone');

        $this->assertSame(0, User::count());
    }

    public function test_a_google_profile_left_waiting_too_long_is_forgotten(): void
    {
        // A shared computer must not offer yesterday's visitor's Google
        // identity to today's.
        $stale = $this->pending('new@example.com');
        $stale[GoogleAuth::PENDING_SESSION_KEY]['at'] = time() - GoogleAuth::PENDING_TTL_SECONDS - 1;

        $this->withSession($stale)
            ->get('/register')
            ->assertOk()
            ->assertDontSee('Enter your phone number', false)
            ->assertSee('id="r-password"', false);

        $this->assertNull(session(GoogleAuth::PENDING_SESSION_KEY));
    }

    /* ------------------------------------------- a native app's ID token (JWT) */

    public function test_an_id_token_from_a_native_account_picker_signs_in_too(): void
    {
        // A project's own Android app cannot use the web popup, so it sends
        // the ID token its native picker returned. Same door, same checks.
        $user = User::factory()->create(['email' => 'existing@example.com']);
        Http::fake([
            'oauth2.googleapis.com/tokeninfo*' => Http::response([
                'aud' => self::CLIENT_ID, 'sub' => 'google-sub-1',
                'email' => 'existing@example.com', 'email_verified' => 'true', 'name' => 'New Person',
            ]),
        ]);

        $this->postJson('/auth/google', ['access_token' => 'header.payload.signature'])->assertOk();

        $this->assertAuthenticatedAs($user);
    }

    public function test_an_id_token_minted_for_another_app_is_refused(): void
    {
        Http::fake([
            'oauth2.googleapis.com/tokeninfo*' => Http::response([
                'aud' => 'someone-else.apps.googleusercontent.com', 'sub' => 'x',
                'email' => 'attacker@example.com', 'email_verified' => 'true',
            ]),
        ]);

        $this->postJson('/auth/google', ['access_token' => 'header.payload.signature'])->assertStatus(401);
        $this->assertGuest();
    }

    /* --------------------------------------------------------- what gets refused */

    public function test_a_token_minted_for_another_app_is_refused(): void
    {
        // The audience check is the security boundary: without it a token issued
        // for somebody else's Google app would sign someone in here.
        Http::fake([
            'oauth2.googleapis.com/tokeninfo*' => Http::response(['aud' => 'someone-else.apps.googleusercontent.com']),
            'www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'sub' => 'x', 'email' => 'attacker@example.com', 'email_verified' => true, 'name' => 'X',
            ]),
        ]);

        $this->signInWithGoogle()->assertStatus(401);
        $this->assertSame(0, User::count());
        $this->assertGuest();
    }

    public function test_nothing_is_accepted_while_no_client_id_is_configured(): void
    {
        // With no client id there is no audience to check against, so every
        // token is somebody else's until proven otherwise.
        config(['services.google.client_id' => null]);
        $this->googleReturns('new@example.com');

        $this->signInWithGoogle()->assertStatus(401);
        $this->assertGuest();
    }

    public function test_an_unverified_google_email_is_refused(): void
    {
        Http::fake([
            'oauth2.googleapis.com/tokeninfo*' => Http::response(['aud' => self::CLIENT_ID]),
            'www.googleapis.com/oauth2/v3/userinfo' => Http::response([
                'sub' => 'x', 'email' => 'unverified@example.com', 'email_verified' => false, 'name' => 'X',
            ]),
        ]);

        $this->signInWithGoogle()->assertStatus(401);
        $this->assertSame(0, User::count());
        $this->assertNull(session(GoogleAuth::PENDING_SESSION_KEY));
    }

    public function test_google_refusing_the_token_outright_is_refused_here_too(): void
    {
        Http::fake(['oauth2.googleapis.com/tokeninfo*' => Http::response(['error' => 'invalid_token'], 400)]);

        $this->signInWithGoogle()->assertStatus(401);
        $this->assertGuest();
    }

    public function test_an_access_token_is_required(): void
    {
        $this->postJson('/auth/google', [])->assertStatus(422);
    }
}
