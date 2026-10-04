# Changelog

This kit is the master copy. Improvements are made in real projects first, then
brought back here — so every entry names where it was proved. When a project
gets ahead of the kit, port the change back and add a line.

To upgrade a project that has an older copy: read down from the top until you
reach what the project already has, and bring over everything above it.

## 2026-10-04 — the phone-only last step, and the in-app browser

Brought back from **Founders.com.bd** (Blade + Fortify) and **AmarDokan POS**
(React SPA + Sanctum + Android app).

**Changed**

- **A new Google visitor is asked for a phone number and nothing else.** The
  old flow sent them to the full registration form, prefilled — which still
  asked for a password twice. Now there is a page of its own
  (`auth/google-phone.blade.php`): who they are signed in as, one field, one
  button, and a way out. `CreateNewUser` waives the password for the address
  Google vouched for and no other. The ordinary registration form no longer
  knows about Google at all (`googlePrefill` is gone).
- **Token verification moved** out of the controller into
  `Support/GoogleToken.php`, so the session controller and the API controller
  share one boundary. It now also refuses a profile with no `sub`, and requires
  `email_verified` to be plainly true rather than merely not false.
- **The "or with email" divider moved into `partials/google-auth`**, so the
  button and divider are one block that is shown or hidden whole.

**Added**

- **No Google button in embedded browsers** — Facebook, Messenger, Instagram,
  TikTok, Line, WeChat, Snapchat, any Android WebView. Checked on the server
  when rendering and again in the browser (for cached pages), from one list:
  `GoogleAuth::EMBEDDED_BROWSER_MARKERS`.
- **Claiming an unverified account**: Google vouching for an address whose
  account was never verified cancels the old password, rotates the remember
  token and drops open sessions and API tokens.
- **IME-safe phone input** (`partials/bd-phone.blade.php`,
  `frontend-react/useImeSafeInput.ts`): no rewriting mid-composition, recovery
  from a WebView that never fires `compositionend`, caret kept in place, tidied
  again at submit.
- **`Support/Phone.php`** and its two client mirrors: any shape of Bangladeshi
  number in, `01XXXXXXXXX` out, with no hardcoded operator list.
- **`js/keyboard-aware.js`**: the focused field stays above the keyboard in
  in-app browsers. The same file as in the payment kit.
- **`partials/form-loading.blade.php`**: submit spinner, no double submit.
- **A React / SPA variant**: `frontend-react/` and
  `GoogleAuthApiController.example.php` — stateless, re-verifying the Google
  token at the second step.
- **ID tokens** (a native Android account picker, One Tap) are accepted through
  the same endpoint and the same checks.
- **The pending profile expires** after thirty minutes.
- The button fetches Google's script ahead of the tap (so the popup is not
  blocked on a slow connection), says nothing when the popup is simply closed,
  and has separate messages for a blocked popup, no connection and an expired
  page.
- Email inputs: `inputmode="email"`, no auto-capitalise, no autocorrect.
- Tests: 16 → 30.

**Upgrading an existing install**

1. Add `GoogleToken.php`, `Phone.php`; replace `GoogleAuth.php` and the
   controller (keep your SEAM block).
2. Apply the new blocks from `CreateNewUser.example.php`.
3. Add `auth/google-phone.blade.php` and the three-branch register view
   (`wiring.example.php` §5); remove the prefill banner and `googlePrefill`
   from `auth/index.blade.php`.
4. Replace `partials/google-auth.blade.php`; change the include in
   `auth/index.blade.php` to the `offeredTo()` form and delete the divider that
   used to sit under it.
5. Add `bd-phone`, `form-loading`, `keyboard-aware.js`; mark the phone inputs
   `data-bd-phone`.
6. Replace the test file and run it.

## Earlier — the whole front door

The login and registration screen joined the Google button; the separate
`continue-with-google-oauth-kit` was retired into this one. Admin panel field
for the Client ID, five-step console guide, 16 tests.
