# RECIPE — Continue with Google (OAuth)

> **For the AI agent implementing this in another project.** A complete, secure
> "Continue with Google" flow: a frontend button (Google Identity Services token
> flow) + a Laravel backend that **verifies the token server-side** and logs the
> user in or signals new-user registration. Keep the verification logic exactly.

---

## 1. How the flow works

```
[GoogleButton]  user clicks
      │  Google popup → access_token (in the browser)
      ▼
POST /auth/google { access_token }
      │  backend verifies token WITH Google (audience + email_verified)
      ├── known email → { login:true, token, user }           → onLogin()
      └── new email   → { needs_registration:true, name,       → onNeedsRegistration()
                          email, picture, google_token }
                             │  frontend collects extra fields
                             ▼
                       POST /auth/google/register { google_token, name, ... }
                             → { token, user }                 → logged in
```

The browser never proves identity by itself — the **backend** re-verifies the
token with Google. That's the security boundary.

## 2. Stacks

- **Frontend:** React + TypeScript. No UI deps (Google logo is inline SVG). Loads
  Google Identity Services (`accounts.google.com/gsi/client`) on demand.
- **Backend:** Laravel 9+ (`Http` client + Sanctum tokens). No extra packages.
- Non-Laravel backend? Port the two endpoints + `verifyGoogleToken` (§7).

## 3. Google Cloud setup (do this first)

1. [console.cloud.google.com](https://console.cloud.google.com) → create/select a project.
2. **APIs & Services → OAuth consent screen** → External → fill app name / emails → Save.
   **Publish the app (Production)** so tokens don't expire in testing.
3. **Credentials → Create Credentials → OAuth client ID → Web application.**
4. **Authorized JavaScript origins**: add your site origins, e.g.
   `http://localhost:5173` and `https://yourdomain.com` (the token flow needs
   *origins*, not redirect URIs).
5. Copy the **Client ID** (and Secret).
6. Env:
   - backend `.env`: `GOOGLE_CLIENT_ID=...apps.googleusercontent.com`, `GOOGLE_CLIENT_SECRET=GOCSPX-...`
   - frontend `.env`: `VITE_GOOGLE_CLIENT_ID=...` (the **same** Client ID)

## 4. Files

**Frontend** → e.g. `src/lib/` + `src/components/`:
```
google.ts          ← GIS loader + signInWithGoogle() + googleConfigured()
GoogleButton.tsx   ← the button (runs step 1, routes the result)
demo/AuthExample.tsx
```
**Backend** → matching Laravel folders:
```
Http/Controllers/GoogleAuthController.php  → app/Http/Controllers/
migrations/*_add_google_id_to_users_table.php → database/migrations/
config-services-google.php                 → merge into config/services.php
routes.example.php                         → merge into routes/api.php
```

## 5. Install

**Backend**
1. Copy the controller; adjust namespace if not `App\`.
2. `php artisan migrate` (adds `google_id`, `last_login_at` to `users`).
3. Merge the `google` block into `config/services.php`; set the two `.env` vars.
4. Add the routes (throttled, public).
5. Uses Sanctum (`createToken`). If you use JWT/session, swap that one line.

**Frontend**
```tsx
import axios from "axios";
import { GoogleButton } from "@/components/GoogleButton";

const api = axios.create({ baseURL: "/api" });

<GoogleButton
  http={api}
  onLogin={(data) => { localStorage.setItem("token", data.token); /* go to dashboard */ }}
  onNeedsRegistration={(data) => { /* show a small form; then POST /auth/google/register */ }}
  onError={(msg) => setError(msg)}
/>
```
The button auto-hides when `VITE_GOOGLE_CLIENT_ID` is missing.

## 6. The seams (what changes per project)

| Seam | Where |
|---|---|
| Client ID | `.env` (both sides) or `clientId` prop |
| Route paths | `endpoint` prop + `routes.example.php` |
| Token issuance | `createToken` (Sanctum) — swap for your auth |
| New-user setup (team/tenant/trial/role/seed) | the marked block in `register()` |
| Extra registration fields | add to `register()` validation + the step-2 form |
| Button label / styling | `label`, `className`, `spinner` props |

## 7. Backend contract (for non-Laravel ports)

- `POST /auth/google` `{ access_token }` →
  `{ login:true, token, user, picture }` **or**
  `{ needs_registration:true, name, email, picture, google_token }`.
- `POST /auth/google/register` `{ google_token, name, ... }` → `{ token, user }`.
- **verifyGoogleToken(access_token):** GET `https://oauth2.googleapis.com/tokeninfo?access_token=…`
  and reject if `aud !== YOUR_CLIENT_ID`; then GET
  `https://www.googleapis.com/oauth2/v3/userinfo` (Bearer token) and reject
  unless `email_verified`. Return `{ sub, email, name, picture }`.

## 8. GOTCHAS — keep these

- **Verify `aud` == your client id.** Without it, a token minted for *another*
  app could be replayed against yours. This check is the core of the security.
- **Require `email_verified`.** Never create/login an account on an unverified
  Google email.
- **Publish the OAuth consent screen (Production).** In "Testing" mode Google
  limits/expires access.
- **Token flow uses Authorized JavaScript _origins_**, not redirect URIs (a common
  setup mistake that yields `idpiframe`/origin errors).
- **Local TLS:** Windows/local PHP often lacks a CA bundle (cURL error 60). The
  controller skips TLS verify **only** in `local` env; production verifies fully.
- **Random password** for Google users + `email_verified_at = now()`. Google is
  the login method; they never use a password.
- **Link `google_id` on first login** for an existing email — so an email/password
  account and its Google sign-in resolve to the same user.

## 9. Verify after implementing

1. Button shows only when `VITE_GOOGLE_CLIENT_ID` is set; click opens the Google chooser.
2. A brand-new Google account → `needs_registration` → your form → account created + logged in.
3. Sign out, click again → instant login (existing user), `google_id` now stored.
4. An existing email/password user signing in with the same Google email links, not duplicates.
5. Tamper with the token → 401 "Google verification failed".
6. Works in production over HTTPS (verification is server-to-Google on 443).
