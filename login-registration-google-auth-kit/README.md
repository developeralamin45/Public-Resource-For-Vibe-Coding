# 🔐 Login & Registration + Continue with Google — the master kit

One polished auth screen — sliding tabs, floating labels, dark and light — with
**Continue with Google** on top of it, verified server-side, and an **admin panel
field for the Client ID** so the owner can switch it on without ever touching a
server. Built for the way visitors actually arrive: on a phone, from an ad,
inside Facebook's own browser, typing with a Bangla keyboard.

**Blade + Laravel · React/SPA variant · React admin panel · MIT · free for anyone.**

This is the one auth kit in this repo — the older `continue-with-google-oauth-kit`
was folded into it — and it is kept current from the projects it is used in.
[`CHANGELOG.md`](./CHANGELOG.md) says what arrived when.

---

## The two paths

Which one a visitor gets is decided by one thing: whether the site already knows
their email address.

| | |
|---|---|
| **The address is known** | Signed in. No second account, no "link your account" step. Their `google_id` is attached quietly, and an unconfirmed email counts as confirmed — Google just proved they own it. |
| **The address is new** | One more screen: who they are signed in as, and **a phone number field — nothing else**. No password, no email box, no name. The account is created complete. |

That second path is the part most implementations get wrong, in one of two
directions. Creating the account silently on first sign-in makes a user with no
phone number: an account that looks complete and is not. Sending them to the
full registration form asks for a password — twice — from someone who pressed
the Google button precisely so as not to make one up.

## What it gets right that is easy to get wrong

- **No Google button inside Facebook, Messenger, Instagram or TikTok.** Google
  refuses to sign anyone in from an embedded browser; the popup ends on an error
  page with no way back. There the button and its divider are simply not
  rendered, and the email form — which works everywhere — is the page.
- **A phone field that survives an IME.** A Bangla keyboard, Gboard's suggestion
  bar and swipe typing all hold text in a composition; a field that reformats
  itself mid-composition doubles digits and throws the caret. This one waits for
  the composition to commit — and copes with the WebView that never says it has.
- **Any shape of number.** `+880 1712-345678`, `৮৮০১৭…`, `0088 017…`,
  `1712345678` all become `01712345678`, by the same rules in the browser and on
  the server.
- **The field you are typing in stays above the keyboard** in in-app browsers
  that draw the keyboard over the page.
- **An unverified account cannot be squatted.** If a stranger registered
  somebody's address with their own password, the owner's first Google sign-in
  cancels that password and drops every open session.
- **A native app can use it too**: the same endpoint accepts the ID token from
  an Android account picker, held to the same checks.

## What is in the box

```
RECIPE.md            the implementation brief — the agent reads this one
CREDENTIALS.md       the Google console walkthrough, five steps
CHANGELOG.md         what changed, and which project it came from
copy-bangla.md       every UI string in Bangla, ready to drop in

frontend-blade/
├── auth/index.blade.php          the screen: two tabs, one view, both forms
├── auth/google-phone.blade.php   the last step after Google: one phone field
├── layouts/auth.blade.php        shell, no-flash dark mode
├── components/float-input.blade.php   the floating-label input
├── partials/google-auth.blade.php     the button + divider, as one block
├── partials/bd-phone.blade.php        IME-safe phone tidying
├── partials/form-loading.blade.php    submit spinner, no double submit
├── js/keyboard-aware.js          the field stays above the keyboard
└── css/auth-theme.css            tokens, glass card, ambient background

frontend-react/                   for a React / SPA frontend
├── google.ts                     load, offer (or not), request a token
├── useImeSafeInput.ts            any live-formatted field, IME-safe
├── phone.ts                      the phone rule, mirroring the server's
└── GoogleSignIn.example.tsx      the three wired together, as a reference

backend-laravel/
├── Support/GoogleAuth.php                     credentials, the pending profile, where the button is offered
├── Support/GoogleToken.php                    the security boundary: asks Google
├── Support/Phone.php                          normalize + validate a phone number
├── Http/Controllers/GoogleAuthController.php  session sites: verify, then sign in or send on
├── Http/Controllers/GoogleAuthApiController.example.php   token-based SPAs: the same, as JSON
├── Http/Controllers/SettingsGoogleRules.example.php   admin-side trait
├── Actions/CreateNewUser.example.php          the blocks registration needs
├── migrations/…add_google_id_to_users_table.php
├── wiring.example.php                         routes, config, .env, the views
└── tests/GoogleAuthTest.example.php           30 tests, Google faked, offline

admin-react/
├── GoogleCredentialsPanel.tsx   the Client ID field, for the settings screen
├── GoogleSetupGuideModal.tsx    the five-step console walkthrough beside it
└── Modal.tsx                    only if the project has no dialog of its own
```

## Quick start

**Hand it to your agent** — this is the intended way:

```
Read https://github.com/developeralamin45/Public-Resource-For-Vibe-Coding/tree/main/login-registration-google-auth-kit
and implement it in this project. Follow its RECIPE.md: inspect my codebase
first, adapt it to what this project actually is, then tell me what I need to
do myself.
```

**Already using an older copy?** Say so, and it becomes an upgrade:

```
This project already uses the login-registration-google-auth-kit. Read the
kit's CHANGELOG.md and RECIPE.md at the link above and bring this project up to
date with it — only what is missing here.
```

**Or by hand:** copy `frontend-blade/` into `resources/views/` (and
`js/keyboard-aware.js` into `public/js/`), `backend-laravel/` into `app/`, make
the small edits in `wiring.example.php`, run the migration, and drop
`GoogleCredentialsPanel` into your settings screen. Then follow
[`CREDENTIALS.md`](./CREDENTIALS.md).

## Why it is safe

- The browser never proves identity by itself. The server re-verifies every
  token **with Google**, and requires that the token's **audience is this app's
  client id** — without that check, a token minted for somebody else's Google
  app would sign that person in here.
- **`email_verified` is required.** No account is ever claimed on an unverified
  address.
- **No client id configured means nothing is accepted.** No client id, no
  audience to check against.
- The **Client ID is public** (the login page uses it in the browser, by
  design). The **secret is encrypted** with `APP_KEY` — which lives in `.env`,
  not the database — and never travels back to a browser.
- A pending Google profile is only ever attached to an account opened under
  **the same address Google verified** — and only that address is excused a
  password. It waits thirty minutes, then is forgotten.
- A Google-only account is never stored with an empty password; it gets a random
  one nobody holds, and "Forgot your password?" sets a real one on request.
- An account whose email **nobody ever verified** has its password cancelled and
  its sessions dropped the first time Google vouches for the real owner.

## Notes

- **This sign-in method needs no redirect URI and no client secret.** It uses
  Google Identity Services' token flow: a popup, an access token, and a
  server-to-Google check. Putting your address in the console's *redirect URIs*
  box instead of *JavaScript origins* is the single most common way to end up at
  `Error 401: invalid_client`.
- **It works on localhost.** Google allows `http://localhost` as an origin even
  without HTTPS. Add it beside the live address, on the same client.
- UI copy ships in English; `copy-bangla.md` has the Bangla.
- The phone rule ships Bangladeshi (`01XXXXXXXXX`). Elsewhere, swap the rule in
  `Phone.php` and its two mirrors; keep the IME-safe binding.
- **Test it the way the traffic arrives**: open the login link from inside a
  Facebook or Messenger chat, on a phone, with a Bangla keyboard. A desktop
  browser shows none of what this kit is careful about.

## License

MIT — use it anywhere, including commercial projects.
