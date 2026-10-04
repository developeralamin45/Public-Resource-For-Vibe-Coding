# RECIPE — the login & registration screen, and Continue with Google

**You are an AI coding agent. This file is your brief.** Read it end to end
before touching anything, then work the phases in order.

Your job is **not** to copy files verbatim. It is to give this project one
polished auth screen and a working Google sign-in that fit *what this project
already is* — its namespaces, its auth stack, its palette, its language.

What the human should have at the end:

- one page at `/login` and `/register` — two tabs that slide, floating labels,
  a password eye, dark and light, right on a phone;
- **Continue with Google** on top of it, verified server-side — and **absent**
  inside Facebook's and Instagram's own browsers, where Google refuses to work;
- a new Google visitor asked for **a phone number and nothing else** — no
  password, no email box, no name;
- a phone field that survives a **Bangla keyboard** and a form that stays above
  the keyboard in an in-app browser;
- an **admin panel field** for the Client ID with the console walkthrough beside
  it, so nobody ever edits `.env` on a server to switch this on.

This kit is the **master copy**. It is kept current from the projects it is
used in; `CHANGELOG.md` says what arrived when. If the project you are working
in already has an older copy of this kit, treat this as an upgrade: diff
against the changelog and bring over what is missing, rather than starting
again. And if you improve on the kit while you are there, tell the human, so
the improvement can come back.

---

## Phase 0 — Read the project before you copy anything

Answer these from the codebase, not from assumptions.

1. **What renders auth now?** Fortify, Breeze, Jetstream, hand-rolled
   controllers, or nothing yet? Find the routes and views for login and
   register. **You are replacing those views**, not adding a third one.
2. **Blade or SPA?** The screen ships as Blade. If the project's auth is a
   React or Vue SPA with token auth, use the SPA variant instead:
   `GoogleAuthApiController.example.php` and `frontend-react/` (Phase 4b), and
   port the screen's markup — the tab animation and floating labels are ~60
   lines of vanilla JS in `auth/index.blade.php`; keep the behaviour, not the
   syntax.
3. **What does registration require?** Read the existing create-user path.
   Phone? Role? Team? Trial? Those fields stay — a Google sign-up is a normal
   registration and must produce a complete account, not a half one. Then
   sort the required fields into two piles: what Google supplies (name,
   email — and it stands in for the password) and **what it cannot** (phone,
   business name…). The second pile is the whole of the last step.
4. **Where do users land after login?** Fortify's `LoginResponse`, a `HOME`
   constant, a redirect in a controller. You will reuse that answer, not invent
   a second one.
5. **Is there a settings table and an admin panel?** Grep for `site_settings`,
   `settings`, `options`. And find the middleware guarding admin routes — you
   will reuse it exactly.
6. **What is the palette and the language?** Does the project already have
   colour tokens and a dark mode? Is the UI in English?
7. **Does any Google login exist already?** If so, you are replacing it.
8. **Where does the traffic come from?** If the site is advertised on Facebook
   or Instagram, most visitors arrive inside those apps' own browsers. That is
   the browser to test in, and three parts of this kit exist only for it.
9. **Is the project Bangladeshi?** The phone field ships with the Bangladeshi
   rule (`01XXXXXXXXX`). Elsewhere, swap the rule and keep the IME-safe binding
   (Phase 4, "Typing with an IME").

**Then tell the human, in three or four lines, what you found and what you are
about to do.** If registration's required fields are ambiguous, ask — that one
answer decides whether a new Google user can finish at all.

---

## Phase 1 — The flow, before you write any of it

Two paths, and which one a visitor gets is decided by one thing: whether the
site already knows their email address.

```
                 "Continue with Google"
                          │
        the server asks Google to vouch for the token
                          │
            ┌─────────────┴─────────────┐
            │                           │
     email already known          email is new
            │                           │
      signed in, done            → the last step: one page that shows
      • google_id linked           who they are signed in as, and asks
      • email marked verified      for a PHONE NUMBER — nothing else
      • an account nobody ever     • name and email travel hidden
        verified has its old       • no password is asked for or set
        password cancelled           by them; "Forgot password" sets
      • lands where the              one if they ever want it
        project sends people       • on submit: google_id attached,
                                     email counts as verified
```

Three decisions in that picture, and the reason for each:

**The new-address path does not create an account on the spot.** Doing that
makes a user with no phone number — an account that looks complete and is not.
The verified profile waits in the session (for thirty minutes, no longer) for
the one field still missing.

**The last step asks for no password.** They pressed the Google button
precisely so as not to make one up; asking for one on the very next screen —
twice — takes that back. The account gets a random password nobody holds. The
waiver applies **only** to the address Google vouched for: submit any other
email with that session and it is an ordinary registration that still needs a
password. Without that rule a pending profile would be a way to open
password-less accounts on any address at all.

**An unverified account is taken away from whoever set its password.**
Wherever registration does not make people confirm their email, a stranger can
register `karim@gmail.com` with a password of their choosing and wait. When the
real Karim signs in with Google he lands in that account — and the stranger
still holds a working password to it. So when Google vouches for an address
whose account was never verified, the old password is replaced with one nobody
holds, the remember token is rotated, and open sessions and API tokens are
dropped. A verified account is untouched. See `claimUnprovenAccount()`.

**If registration needs nothing Google cannot supply** — name, email and
password are the whole form — there is no last step to show. In that project
(and only there) create the account straight away in the controller's
new-address branch, through the project's own create-user path, with a random
password and a verified email. Do not show an empty step.

---

## Phase 2 — Backend

```
backend-laravel/Support/GoogleAuth.php                    → app/Support/
backend-laravel/Support/GoogleToken.php                   → app/Support/
backend-laravel/Support/Phone.php                         → app/Support/   (Bangladeshi projects)
backend-laravel/Http/Controllers/GoogleAuthController.php → app/Http/Controllers/
backend-laravel/migrations/*.php                          → database/migrations/ (RENAME)
```

**Rename the migration** to today's date so it runs after the project's own:
`2024_01_01_000001_…` → `2026_09_02_120000_…`.

Then the small edits, all shown in **`wiring.example.php`**:

- the route in `routes/web.php` (web group, not api — the flow needs the session);
- the `google` block in `config/services.php`, and the two `.env` keys;
- `'google_id'` in the `User` model's `$fillable`;
- the three-branch register view (ordinary form / last step / `?manual=1`);
- `keyboard-aware.js` into `public/js/`.

**`GoogleAuth` needs a key/value store.** It reads `SiteSetting::get()` /
`::set()`. Point it at whatever the project already has — the calls are
`get(string $key, $default)` and `set(string $key, $value)`, so a thin adapter
is usually two lines. Only if the project has no settings table at all should
you create one.

### What must not be edited

`GoogleToken::verify()` is the security boundary. Every path into an account
goes through it, and it checks three things:

- **`aud` equals our client id.** Without it, a token minted for somebody
  else's Google app would sign that person in here.
- **`email_verified` is true.** Without it, an unverified address could be used
  to claim an account.
- **With no client id configured it refuses everything** — no client id means
  no audience to check against, and an unchecked token is somebody else's.

It accepts two kinds of token through the same field: the **access token** the
web button gets, and an **ID token** (a JWT) from a native account picker or
One Tap. Both are held to the same checks.

### Inside your own app

Google blocks its web sign-in inside any WebView, including the project's own
Android app — so `GoogleAuth::usableIn()` hides the button there too (every
Android WebView's User-Agent carries `; wv)`). If the project has such an app
and wants Google in it, the app opens the phone's **native** account picker
(Credential Manager), asks for an ID token **for the web client id**, and hands
it to the page through a JS bridge; the page posts it to the same endpoint.
Then exempt the app from the hiding by its own User-Agent marker
(`frontend-react/google.ts` takes the bridge as an argument and does this for
you). No bridge, no button — never show one that can only fail.

### The seam

One block in the controller is marked `── SEAM ──`: where a signed-in user
lands. Replace it with the project's own answer from Phase 0.

---

## Phase 3 — The registration hook

Open the project's create-user path (Fortify's `CreateNewUser`, a
`RegisterController`, a service). Add the blocks marked in
`Actions/CreateNewUser.example.php`:

```php
$googleId     = GoogleAuth::pendingIdFor($input['email']);          // BLOCK 1
$passwordless = $googleId !== null && blank($input['password'] ?? null);

'password' => $passwordless ? ['nullable'] : $this->passwordRules(),  // the rule

User::create([...
    'password'  => Hash::make($passwordless ? Str::random(64) : $input['password']),
    'google_id' => $googleId,                                        // BLOCK 2a
]);
if ($googleId !== null) $user->markEmailAsVerified();                // BLOCK 2b
GoogleAuth::forgetPending();
```

**Keep every other field the project already sets.** Role, phone, team, trial,
starter records, the welcome email — all of it still runs.

**The password is the only thing waived.** If registration demands a phone
number, a Google user gives a phone number; that is the reason they were sent
to a form rather than given an account silently.

**Never store an empty password.** An account whose password is `""` opens to
anyone who leaves the field blank. A random 64-character one opens to nobody.

`pendingIdFor()` compares the submitted email against the one Google verified.
That comparison is the whole point: the email travels in a hidden field the
visitor can edit, and a pending profile must never hand its verified identity —
or its password waiver — to a different address.

---

## Phase 4 — The screen

```
frontend-blade/auth/index.blade.php          → resources/views/auth/index.blade.php
frontend-blade/auth/google-phone.blade.php   → resources/views/auth/google-phone.blade.php
frontend-blade/layouts/auth.blade.php        → resources/views/layouts/auth.blade.php
frontend-blade/components/float-input.blade.php → resources/views/components/
frontend-blade/partials/google-auth.blade.php   → resources/views/partials/
frontend-blade/partials/bd-phone.blade.php      → resources/views/partials/
frontend-blade/partials/form-loading.blade.php  → resources/views/partials/
frontend-blade/js/keyboard-aware.js          → public/js/keyboard-aware.js
frontend-blade/css/auth-theme.css            → append to resources/css/app.css
```

Point the project's login and register routes at `auth.index`, with
`activeTab` set to `'login'` or `'register'`; the register route also serves
`auth.google-phone` when a Google profile is waiting (`wiring.example.php`, §5).

**What the screen is doing, so you keep it when you adapt it:**

- **One view, two forms.** Both panels are in the DOM; the tab swaps which is
  visible and slides the pill indicator. Each `<a>` is still a real link to a
  real URL, so the tabs work without JS and the back button behaves.
- **Floating labels.** `float-input` puts the label over the input as a
  placeholder and floats it on focus or when filled — pure CSS `peer`, no JS.
- **16px inputs at every width, deliberately.** Anything smaller makes iOS
  zoom the page on focus and stay zoomed.
- **The Google button and its "or with email" divider are one block.** They
  live together in `partials/google-auth` and hang on one question,
  `GoogleAuth::offeredTo($userAgent)`: is a client id configured, and can
  Google work in this browser? A divider above nothing reads as a broken page.
- **The ordinary registration form knows nothing about Google.** No prefill, no
  banner. A Google visitor never sees it; they see the last step.
- **The last step is its own page**: who they are signed in as (many people
  have more than one Gmail — this is where a wrong pick gets noticed), one
  phone field, one button, and a way out ("Use a different email" →
  `/register?manual=1`, which lets the profile go). No tabs, no Google button,
  no password. A Google account with no name on it is asked for one, because a
  hidden empty name would fail validation on a page with no box to fix it in.

### No Google button where Google refuses to work

Facebook, Messenger, Instagram, TikTok and their kind open links in their own
embedded browser, and Google will not sign anyone in from one — the popup ends
on a `disallowed_useragent` error page with no way back. For a site that
advertises on those apps, that is most first visits. The button is therefore
**not rendered** there, and neither is its divider; the email form, which
works everywhere, is simply the page.

- The list of markers is one constant, `GoogleAuth::EMBEDDED_BROWSER_MARKERS`.
  The server checks it when rendering, and the button's own script checks the
  same list again in the browser — for the page that came out of a full-page
  cache or a CDN, rendered for somebody else's browser.
- It cannot be feature-detected: nothing a page can query says "Google will
  refuse me". So the hosts are named. A miss costs one failed tap, as before.

### Typing with an IME

A Bangla keyboard typing `০১৭…`, Gboard's suggestion bar, swipe typing — each
holds the half-finished text in a *composition* the browser owns. A field that
rewrites its own value on every keystroke (to fold `০১৭` into `017`, to strip a
`+880`) tears that buffer up: the caret jumps and digits double.

The rule, in `partials/bd-phone.blade.php` and `frontend-react/useImeSafeInput.ts`:

1. **Never assign to a field while a composition is open.** Tidy it once, when
   the composition commits (`compositionend`).
2. **Blur ends a composition whether or not the browser says so.** Facebook's
   WebView has been seen committing at blur without firing `compositionend`;
   clear the flag and tidy there too, or the field goes deaf after a refocus.
3. **Tidy again at submit**, and normalize again on the server
   (`Phone::normalize`). Autofill and password managers set values without any
   event having run.
4. **Put the caret back** after a rewrite, so fixing a digit mid-number does
   not send the next keystroke to the end.
5. **An Enter that confirms an IME candidate is not a submit.** Native forms
   handle this; any `keydown` handler of your own must check
   `event.isComposing || event.keyCode === 229` first.

The client and server normalizers are the same rules in two languages, and
accept any shape a person might type or paste: `+880 1712-345678`,
`8801712345678`, `০১৭১২৩৪৫৬৭৮`, `0088 01712…`, `1712345678`. Validation then
judges the number — eleven digits starting `01` — not the formatting. Change
the rule in `Phone.php` and its two mirrors together, or not at all.

The email boxes carry `inputmode="email"`, `autocapitalize="none"`,
`autocorrect="off"` and `spellcheck="false"`, so a phone keyboard does not
capitalise or "correct" an address.

### The keyboard, in an in-app browser

Chrome and Safari scroll a focused field clear of the keyboard. Facebook's
browser draws the keyboard over an unchanged page, so the field at the bottom
of the card is typed into blind. `keyboard-aware.js` fixes that and does
nothing at all where the browser already gets it right. It is the same file,
byte for byte, as in this repo's payment kit — if the project has it already,
do not add a second copy. Its header explains every decision; do not "simplify"
it to a `scrollIntoView` on focus, which is the version that makes pages jump.

### Smaller things that are deliberate

- **Google's script is fetched before the tap needs it** (idle, and again on
  `pointerdown`). A popup may only open while the browser still counts the tap
  as recent; a click that first downloads a script can outlive that on a slow
  connection, and the popup is silently blocked.
- **Closing the popup shows no error.** It is a decision, not a failure. A
  blocked popup, a dropped connection and an expired page (419) each get their
  own sentence.
- **`form-loading`** puts a spinner on the submit button and stops a second
  submit — a slow connection otherwise turns one registration into two, and the
  second fails on "email already taken".

**If the project already has colour tokens**, keep them and drop
`auth-theme.css`. The markup only asks for four families — `ink-*` (surfaces
and borders), `fg-*` (text), `brand-*`, `accent-*` — so remapping those onto the
project's palette is the whole integration.

**Translate the copy** if the project's UI is not in English. `copy-bangla.md`
has the Bangla strings ready to drop in.

### Phase 4b — a React / SPA frontend instead

```
frontend-react/google.ts               the button's logic: load, offer, request
frontend-react/useImeSafeInput.ts      any live-formatted field, IME-safe
frontend-react/phone.ts                the Bangladeshi rule, mirroring Phone.php
frontend-react/GoogleSignIn.example.tsx   the three wired together — a reference, not a component to ship
backend-laravel/Http/Controllers/GoogleAuthApiController.example.php
```

The same flow with JSON in place of redirects: `POST /auth/google` answers
`{ login, token, user }` or `{ needs_registration, name, email, google_token }`;
the page shows the same one-field last step and posts
`{ google_token, phone }` to `/auth/google/register`. With no session to hold a
pending profile, the server **verifies the Google token a second time** there
and takes the email from Google's answer, never from the request — that
re-check is this variant's `pendingIdFor()`.

Everything above still applies: `googleOffered()` hides the button and its
divider together in embedded browsers, the phone field is bound through
`useImeSafeInput`, and whatever the password login refuses (a blocked account,
a suspended tenant) the Google login refuses too.

---

## Phase 5 — The admin panel

```
admin-react/GoogleCredentialsPanel.tsx   → the settings screen
admin-react/GoogleSetupGuideModal.tsx    → beside it
admin-react/Modal.tsx                    → only if the project has no dialog
backend-laravel/Http/Controllers/SettingsGoogleRules.example.php → the trait
```

This is the part that decides whether the owner can ever switch Google login on
without you. Do not skip it, and do not settle for "put the key in `.env`".

- **`GoogleAuth` prefers the panel and falls back to `.env`**, so a server
  configured before the panel existed keeps working.
- **The client id is public** — the login page renders it into the browser, by
  design. Store it as typed.
- **The secret is not.** It is encrypted with `APP_KEY`, which lives in `.env`
  rather than the database, so a leaked dump carries nothing usable. It never
  travels to a browser: what goes out is a mask, and the mask coming back
  unchanged means "keep what is stored".
- **Validate the client id's shape** on save. A wrong one does not fail at save
  time — it fails days later at sign-in, with nothing to show but "verification
  failed".
- **The route goes behind the project's existing admin guard.** Reuse it; never
  invent a weaker one.

If the settings screen already saves everything under one button, lift the two
fields and the guide button into that form rather than shipping a second Save.

### The setup guide

`GoogleSetupGuideModal` is five steps with the exact value to paste at each one,
built from the site's own address. Keep it that way. It has no troubleshooting
section on purpose: every extra branch is one more thing to read while deciding
where to click, and deciding is what stalls people.

Two details in it are not decoration:

- **Publishing is step 4, before the client id is pasted in.** A published app
  needs no test-user list, which removes a step and every "Access blocked" that
  comes of forgetting it.
- **Origins, not redirect URIs.** This flow uses neither a redirect nor a
  secret. Putting the address in the redirect box is the single most common way
  to end up at `Error 401: invalid_client — no registered origin`.

---

## Phase 6 — Prove it, then hand it over

Copy `backend-laravel/tests/GoogleAuthTest.example.php` into the project's test
suite and adapt the fixtures (the redirect target, the registration fields, the
strings if you translated them). It fakes Google's endpoints, so it runs
offline. It covers:

- an existing email/password user signs straight in, `google_id` linked, no
  second account;
- an unverified account is claimed: old password dead, open sessions dropped —
  and a verified account keeps its password;
- a new address creates nothing and lands on the last step, which shows the
  profile, asks only for the phone, and has no password field, tabs or Google
  button;
- the account finishes with no password — and the stored hash is not the empty
  string;
- a different email submitted with a pending profile inherits nothing and still
  needs a password; so does an ordinary registration;
- "Use a different email" lets the profile go; a profile left waiting too long
  is forgotten;
- the button and its divider are absent in Facebook's, Messenger's,
  Instagram's, TikTok's and any Android WebView's browser, and present in
  Chrome;
- a native app's ID token signs in; one minted for another app does not;
- a token for another app, an unconfigured client id, an unverified Google
  email and a token Google rejects are each refused.

Run them. Then run whatever the project's own auth tests are — you replaced its
login screen, and that is exactly the kind of change that quietly breaks a test
asserting on the old markup.

**Then test the way the traffic arrives.** Paste the login URL into a Facebook
or Messenger chat and open it from there, on a real phone: no Google button, no
dangling divider, and the last field stays above the keyboard while you type.
Type the phone number with a Bangla keyboard. If you cannot do this yourself,
say so and ask the human to — it is the half of the kit a desktop browser
cannot show you.

**Finish by telling the human what only they can do**, in their language:

1. Open **Admin → Settings → Google login → Setup guide** and follow the five
   steps.
2. Paste the Client ID and save.
3. Test: sign in with a Google account that already has an account here (should
   go straight in), and one that does not (should be asked for a phone number
   and nothing else).
4. Open the login page from inside Facebook or Messenger on a phone: the Google
   button should not be there, and typing should never be hidden by the
   keyboard.

And **say what you actually ran**. If you could not run the tests or could not
try a real Google sign-in without credentials, say so plainly rather than
presenting it as done.
