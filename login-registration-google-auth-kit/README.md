# 🔐 Login & Registration + Continue with Google

One polished auth screen — sliding tabs, floating labels, dark and light — with
**Continue with Google** on top of it, verified server-side, and an **admin panel
field for the Client ID** so the owner can switch it on without ever touching a
server.

**Blade + Laravel · React admin panel · MIT · free for anyone.**

---

## The two paths

Which one a visitor gets is decided by one thing: whether the site already knows
their email address.

| | |
|---|---|
| **The address is known** | Signed in. No second account, no "link your account" step. Their `google_id` is attached quietly, and an unconfirmed email counts as confirmed — Google just proved they own it. |
| **The address is new** | Sent to registration with their name and email already filled in. They add whatever else the project needs — a phone number, a password — and the account is created complete. |

That second path is the part most implementations get wrong. Creating the
account silently on first sign-in makes a user with no phone number and a random
password nobody can ever use: an account that looks complete and is not.

## What is in the box

```
RECIPE.md            the implementation brief — the agent reads this one
CREDENTIALS.md       the Google console walkthrough, five steps
copy-bangla.md       every UI string in Bangla, ready to drop in

frontend-blade/
├── auth/index.blade.php        the screen: two tabs, one view, both forms
├── layouts/auth.blade.php      shell, no-flash dark mode
├── components/float-input.blade.php   the floating-label input
├── partials/google-auth.blade.php     the button + Google Identity Services
└── css/auth-theme.css          tokens, glass card, ambient background

backend-laravel/
├── Support/GoogleAuth.php                     credentials + the pending profile
├── Http/Controllers/GoogleAuthController.php  verify, then sign in or send on
├── Http/Controllers/SettingsGoogleRules.example.php   admin-side trait
├── Actions/CreateNewUser.example.php          the two lines registration needs
├── migrations/…add_google_id_to_users_table.php
├── wiring.example.php                         routes, config, .env, the view
└── tests/GoogleAuthTest.example.php           16 tests, Google faked, offline

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

**Or by hand:** copy `frontend-blade/` into `resources/views/`, `backend-laravel/`
into `app/`, make the five small edits in `wiring.example.php`, run the
migration, and drop `GoogleCredentialsPanel` into your settings screen.
Then follow [`CREDENTIALS.md`](./CREDENTIALS.md).

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
  **the same address Google verified**.

## Notes

- **This sign-in method needs no redirect URI and no client secret.** It uses
  Google Identity Services' token flow: a popup, an access token, and a
  server-to-Google check. Putting your address in the console's *redirect URIs*
  box instead of *JavaScript origins* is the single most common way to end up at
  `Error 401: invalid_client`.
- **It works on localhost.** Google allows `http://localhost` as an origin even
  without HTTPS. Add it beside the live address, on the same client.
- UI copy ships in English; `copy-bangla.md` has the Bangla.

## License

MIT — use it anywhere, including commercial projects.
