<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\GoogleAuth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * "Continue with Google" has exactly two outcomes, and which one a visitor gets
 * is decided by one thing only: whether the site already knows their address.
 *
 *   known address → signed in, nothing else asked
 *   new address   → sent to registration with the verified name and email
 *                   filled in, to give the phone number this site needs
 *
 * The second case deliberately does not open an account on the spot. That would
 * make a student with no phone number and a password nobody could ever use.
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
        config(['services.google.client_id' => self::CLIENT_ID]);
    }

    /** Make Google answer for a verified account. */
    private function googleReturns(string $email, string $name = 'Notun Chatro', string $sub = 'google-sub-1'): void
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

    private function pending(string $email, string $name = 'Notun Chatro', string $sub = 'google-sub-1'): array
    {
        return [GoogleAuth::PENDING_SESSION_KEY => ['sub' => $sub, 'email' => $email, 'name' => $name]];
    }

    /* ------------------------------------------------- an account already exists */

    public function test_an_existing_email_password_user_is_signed_straight_in(): void
    {
        // The whole promise of the feature for existing students: no second
        // account, no extra form, no "link your account" step.
        $user = User::factory()->create(['email' => 'purono@example.com', 'google_id' => null]);
        $this->googleReturns('purono@example.com');

        $this->signInWithGoogle()
            ->assertOk()
            ->assertJsonPath('redirect', '/dashboard');

        $this->assertAuthenticatedAs($user);
        $this->assertSame(1, User::count());
        $this->assertSame('google-sub-1', $user->fresh()->google_id);
    }

    public function test_the_google_id_is_linked_to_the_existing_account_not_a_new_one(): void
    {
        $user = User::factory()->create(['email' => 'purono@example.com', 'google_id' => null]);
        $this->googleReturns('purono@example.com');

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
        $user = User::factory()->unverified()->create(['email' => 'purono@example.com']);
        $this->googleReturns('purono@example.com');

        $this->signInWithGoogle()->assertOk();

        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    /* ---------------------------------------------------- no account here yet */

    public function test_a_new_address_is_sent_to_registration_instead_of_being_given_an_account(): void
    {
        $this->googleReturns('notun@example.com', 'Notun Chatro', 'sub-notun');

        $this->signInWithGoogle()
            ->assertOk()
            ->assertJsonPath('redirect', '/register');

        $this->assertSame(0, User::count());
        $this->assertGuest();
        $this->assertSame('notun@example.com', session(GoogleAuth::PENDING_SESSION_KEY)['email']);
    }

    public function test_the_checkout_a_visitor_was_headed_for_survives_the_detour(): void
    {
        // Clicking "Enroll" while logged out stores the checkout URL and bounces
        // to /login. Going via Google and then registration is a longer road to
        // the same place, and must not lose the destination on the way.
        $this->withSession(['url.intended' => '/checkout/kono-course']);
        $this->googleReturns('notun@example.com');

        $this->signInWithGoogle()->assertJsonPath('redirect', '/register');

        $this->assertSame('/checkout/kono-course', session('url.intended'));
    }

    public function test_the_registration_form_arrives_already_filled_in(): void
    {
        $this->withSession($this->pending('notun@example.com'))
            ->get('/register')
            ->assertOk()
            ->assertSee('value="notun@example.com"', false)
            ->assertSee('value="Notun Chatro"', false)
            ->assertSee('No account on this email yet', false);
    }

    public function test_the_registration_form_is_untouched_without_a_google_sign_in(): void
    {
        $this->get('/register')
            ->assertOk()
            ->assertDontSee('No account on this email yet', false);
    }

    public function test_finishing_registration_links_google_and_skips_email_verification(): void
    {
        $this->withSession($this->pending('notun@example.com', 'Notun Chatro', 'sub-notun'))
            ->post('/register', [
                'name' => 'Notun Chatro',
                'email' => 'notun@example.com',
                'phone' => '01712345678',
                'password' => 'gopon-pass',
                'password_confirmation' => 'gopon-pass',
            ])
            ->assertRedirect();

        $user = User::where('email', 'notun@example.com')->firstOrFail();
        $this->assertSame('sub-notun', $user->google_id);
        $this->assertSame('student', $user->role);
        $this->assertSame('01712345678', $user->phone);
        $this->assertNotNull($user->email_verified_at, 'Google already verified this address.');
        $this->assertAuthenticatedAs($user);

        // The sign-in that brought them here is spent.
        $this->assertNull(session(GoogleAuth::PENDING_SESSION_KEY));
    }

    public function test_a_pending_profile_cannot_be_claimed_by_a_different_address(): void
    {
        // The visitor controls the email field. Typing over the prefilled address
        // must not hand somebody else's verified Google identity to the account
        // being opened — that is an ordinary registration.
        $this->withSession($this->pending('notun@example.com', 'Notun Chatro', 'sub-notun'))
            ->post('/register', [
                'name' => 'Onno Keu',
                'email' => 'onno@example.com',
                'phone' => '01712345678',
                'password' => 'gopon-pass',
                'password_confirmation' => 'gopon-pass',
            ])
            ->assertRedirect();

        $user = User::where('email', 'onno@example.com')->firstOrFail();
        $this->assertNull($user->google_id);
        $this->assertNull($user->email_verified_at);
    }

    public function test_registration_still_insists_on_a_phone_number(): void
    {
        // The reason a new visitor is sent here at all.
        $this->withSession($this->pending('notun@example.com'))
            ->post('/register', [
                'name' => 'Notun Chatro',
                'email' => 'notun@example.com',
                'password' => 'gopon-pass',
                'password_confirmation' => 'gopon-pass',
            ])
            ->assertSessionHasErrors('phone');

        $this->assertSame(0, User::count());
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
        $this->googleReturns('notun@example.com');

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
