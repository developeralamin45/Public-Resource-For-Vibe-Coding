# RECIPE — the login & registration screen, and Continue with Google

**You are an AI coding agent. This file is your brief.** Read it end to end
before touching anything, then work the phases in order.

Your job is **not** to copy files verbatim. It is to give this project one
polished auth screen and a working Google sign-in that fit *what this project
already is* — its namespaces, its auth stack, its palette, its language.

What the human should have at the end:

- one page at `/login` and `/register` — two tabs that slide, floating labels,
  a password eye, dark and light, right on a phone;
- **Continue with Google** on top of it, verified server-side;
- an **admin panel field** for the Client ID with the console walkthrough beside
  it, so nobody ever edits `.env` on a server to switch this on.

---

## Phase 0 — Read the project before you copy anything

Answer these from the codebase, not from assumptions.

1. **What renders auth now?** Fortify, Breeze, Jetstream, hand-rolled
   controllers, or nothing yet? Find the routes and views for login and
   register. **You are replacing those views**, not adding a third one.
2. **Blade or SPA?** This kit's screen is Blade. If the project's auth is React
   or Vue, port the markup — the tab animation and floating labels are ~60 lines
   of vanilla JS in `auth/index.blade.php`; keep the behaviour, not the syntax.
3. **What does registration require?** Read the existing create-user path.
   Phone? Role? Team? Trial? Those fields stay — a Google sign-up is a normal
   registration and must produce a complete account, not a half one.
4. **Where do users land after login?** Fortify's `LoginResponse`, a `HOME`
   constant, a redirect in a controller. You will reuse that answer, not invent
   a second one.
5. **Is there a settings table and an admin panel?** Grep for `site_settings`,
   `settings`, `options`. And find the middleware guarding admin routes — you
   will reuse it exactly.
6. **What is the palette and the language?** Does the project already have
   colour tokens and a dark mode? Is the UI in English?
7. **Does any Google login exist already?** If so, you are replacing it.

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
      signed in, done            → /register, with the
      • google_id linked           name and email filled in
      • email marked verified      • the profile waits in the session
      • lands where the            • they add whatever else the project
        project sends people         needs (phone, password…)
                                   • on submit, google_id is attached
                                     and the email counts as verified
```

**The new-address path deliberately does not create an account on the spot.**
Doing that makes a user with no phone number and a random password nobody can
ever use — an account that looks complete and is not. Send them through the
project's own registration instead, and skip only what Google has proved.

---

## Phase 2 — Backend

```
backend-laravel/Support/GoogleAuth.php                    → app/Support/
backend-laravel/Http/Controllers/GoogleAuthController.php → app/Http/Controllers/
backend-laravel/migrations/*.php                          → database/migrations/ (RENAME)
```

**Rename the migration** to today's date so it runs after the project's own:
`2024_01_01_000001_…` → `2026_09_02_120000_…`.

Then the small edits, all shown in **`wiring.example.php`**:

- the route in `routes/web.php` (web group, not api — the flow needs the session);
- the `google` block in `config/services.php`, and the two `.env` keys;
- `'google_id'` in the `User` model's `$fillable`;
- `googlePrefill` passed to the register view.

**`GoogleAuth` needs a key/value store.** It reads `SiteSetting::get()` /
`::set()`. Point it at whatever the project already has — the calls are
`get(string $key, $default)` and `set(string $key, $value)`, so a thin adapter
is usually two lines. Only if the project has no settings table at all should
you create one.

### What must not be edited

`verifyGoogleToken()` is the security boundary. It checks two things and both
matter:

- **`aud` equals our client id.** Without it, a token minted for somebody
  else's Google app would sign that person in here.
- **`email_verified` is true.** Without it, an unverified address could be used
  to claim an account.

And with **no client id configured it refuses everything** — no client id means
no audience to check against, and an unchecked token is somebody else's.

### The seam

One block in the controller is marked `── SEAM ──`: where a signed-in user
lands. Replace it with the project's own answer from Phase 0.

---

## Phase 3 — The registration hook

Open the project's create-user path (Fortify's `CreateNewUser`, a
`RegisterController`, a service). Add the two blocks marked in
`Actions/CreateNewUser.example.php`:

```php
$googleId = GoogleAuth::pendingIdFor($input['email']);   // BLOCK 1

User::create([... 'google_id' => $googleId, ...]);        // BLOCK 2a
if ($googleId !== null) $user->markEmailAsVerified();     // BLOCK 2b
GoogleAuth::forgetPending();
```

**Keep every other field the project already sets.** Role, phone, team, trial,
starter records — all of it still runs.

**Do not weaken the validation** to let a Google user through. If registration
demands a phone number, a Google user gives a phone number; that is the reason
they were sent to the form rather than given an account silently.

`pendingIdFor()` compares the submitted email against the one Google verified.
That comparison is the whole point: someone can type over the prefilled address,
and a pending profile must never hand its verified identity to a different one.

---

## Phase 4 — The screen

```
frontend-blade/auth/index.blade.php        → resources/views/auth/index.blade.php
frontend-blade/layouts/auth.blade.php      → resources/views/layouts/auth.blade.php
frontend-blade/components/float-input.blade.php → resources/views/components/
frontend-blade/partials/google-auth.blade.php   → resources/views/partials/
frontend-blade/css/auth-theme.css          → append to resources/css/app.css
```

Point the project's login and register routes at this one view, with
`activeTab` set to `'login'` or `'register'`.

**What the screen is doing, so you keep it when you adapt it:**

- **One view, two forms.** Both panels are in the DOM; the tab swaps which is
  visible and slides the pill indicator. Each `<a>` is still a real link to a
  real URL, so the tabs work without JS and the back button behaves.
- **Floating labels.** `float-input` puts the label over the input as a
  placeholder and floats it on focus or when filled — pure CSS `peer`, no JS.
- **16px inputs at every width, deliberately.** Anything smaller makes iOS
  zoom the page on focus and stay zoomed.
- **The Google button and its "or with email" divider hang on one condition.**
  With no client id, the button could only ever show an error, and a divider
  above nothing reads as a broken page. Both hide together.
- **The prefill banner** on the register panel appears only when a Google
  sign-in sent them there.

**If the project already has colour tokens**, keep them and drop
`auth-theme.css`. The markup only asks for four families — `ink-*` (surfaces
and borders), `fg-*` (text), `brand-*`, `accent-*` — so remapping those onto the
project's palette is the whole integration.

**Translate the copy** if the project's UI is not in English. `copy-bangla.md`
has the Bangla strings ready to drop in.

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
suite and adapt the fixtures (the redirect target, the registration fields).
It fakes Google's two endpoints, so it runs offline. It covers:

- an existing email/password user signs straight in, `google_id` linked, no
  second account;
- a new address creates nothing and lands on `/register`, profile pending;
- the form arrives filled in; finishing it links Google and skips verification;
- a different email typed over the prefill inherits nothing;
- registration still demands what it demanded before;
- a token for another app, an unconfigured client id, and an unverified Google
  email are each refused.

Run them. Then run whatever the project's own auth tests are — you replaced its
login screen, and that is exactly the kind of change that quietly breaks a test
asserting on the old markup.

**Finish by telling the human what only they can do**, in their language:

1. Open **Admin → Settings → Google login → Setup guide** and follow the five
   steps.
2. Paste the Client ID and save.
3. Test: sign in with a Google account that already has an account here (should
   go straight in), and one that does not (should land on registration, filled
   in).

And **say what you actually ran**. If you could not run the tests or could not
try a real Google sign-in without credentials, say so plainly rather than
presenting it as done.
